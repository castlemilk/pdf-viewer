import AppKit
import AuthenticationServices
import CryptoKit
import Foundation
import React
import Security

@objc(AcaciaAuth)
final class AcaciaAuth: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getFirebaseIDToken:rejecter:)
  func getFirebaseIDToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if let validationToken = configuredValue(
      environmentKey: "ACACIA_FIREBASE_ID_TOKEN",
      infoKey: "AcaciaFirebaseIDToken"
    ) {
      resolve(validationToken)
      return
    }

    guard let apiKey = configuredValue(
      environmentKey: "ACACIA_FIREBASE_WEB_API_KEY",
      infoKey: "AcaciaFirebaseWebAPIKey"
    ) else {
      resolve(NSNull())
      return
    }

    Task {
      do {
        let idToken = try await FirebaseAnonymousTokenProvider.shared.idToken(apiKey: apiKey)
        resolveOnMain(resolve, idToken)
      } catch {
        rejectOnMain(reject, "firebase_auth_failed", "Could not sign in to Acacia Pro.", error)
      }
    }
  }

  @objc(signInWithApple:rejecter:)
  func signInWithApple(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let apiKey = configuredValue(
      environmentKey: "ACACIA_FIREBASE_WEB_API_KEY",
      infoKey: "AcaciaFirebaseWebAPIKey"
    ) else {
      reject("firebase_config_missing", "Firebase sign-in is not configured in this build.", nil)
      return
    }

    if #available(iOS 13.0, macOS 10.15, *) {
      DispatchQueue.main.async {
        AppleSignInCoordinator.start(apiKey: apiKey, resolve: resolve, reject: reject)
      }
    } else {
      reject("apple_sign_in_unavailable", "Sign in with Apple is not available on this OS version.", nil)
    }
  }

  @objc(requestAppleAuthorizationCode:rejecter:)
  func requestAppleAuthorizationCode(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 13.0, macOS 10.15, *) {
      DispatchQueue.main.async {
        AppleAuthorizationCodeCoordinator.start(resolve: resolve, reject: reject)
      }
    } else {
      reject("apple_sign_in_unavailable", "Sign in with Apple is not available on this OS version.", nil)
    }
  }

  @objc(deleteFirebaseAccount:rejecter:)
  func deleteFirebaseAccount(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let apiKey = configuredValue(
      environmentKey: "ACACIA_FIREBASE_WEB_API_KEY",
      infoKey: "AcaciaFirebaseWebAPIKey"
    ) else {
      reject("firebase_config_missing", "Firebase account deletion is not configured in this build.", nil)
      return
    }

    Task {
      do {
        try await FirebaseAnonymousTokenProvider.shared.deleteCurrentAccount(apiKey: apiKey)
        resolveOnMain(resolve, NSNull())
      } catch {
        rejectOnMain(reject, "firebase_account_delete_failed", "Could not delete your Acacia account.", error)
      }
    }
  }
}

private final class FirebaseAnonymousTokenProvider {
  static let shared = FirebaseAnonymousTokenProvider()

  private let defaults = UserDefaults.standard
  private let idTokenKey = "com.benebsworth.acacia.firebase.idToken"
  private let refreshTokenKey = "com.benebsworth.acacia.firebase.refreshToken"
  private let expiryKey = "com.benebsworth.acacia.firebase.idTokenExpiresAt"

  func idToken(apiKey: String) async throws -> String {
    let now = Date().timeIntervalSince1970
    if let cached = defaults.string(forKey: idTokenKey),
       defaults.double(forKey: expiryKey) > now + 60 {
      return cached
    }

    if let refreshToken = defaults.string(forKey: refreshTokenKey),
       !refreshToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      do {
        return try await refreshIDToken(apiKey: apiKey, refreshToken: refreshToken)
      } catch {
        defaults.removeObject(forKey: refreshTokenKey)
      }
    }

    return try await createAnonymousAccount(apiKey: apiKey)
  }

  func signInWithApple(apiKey: String, identityToken: String, rawNonce: String) async throws -> [String: Any] {
    let response = try await postJSON(
      url: firebaseURL(host: "identitytoolkit.googleapis.com", path: "/v1/accounts:signInWithIdp", apiKey: apiKey),
      body: [
        "postBody": "id_token=\(percentEncode(identityToken))&providerId=apple.com&nonce=\(percentEncode(rawNonce))",
        "requestUri": "http://localhost",
        "returnIdpCredential": true,
        "returnSecureToken": true,
      ]
    )
    _ = try persist(response: response, idTokenField: "idToken", refreshTokenField: "refreshToken", expiresField: "expiresIn")

    return [
      "providerId": response["providerId"] as? String ?? "apple.com",
      "firebaseUid": response["localId"] as? String ?? "",
      "email": response["email"] as? String ?? "",
      "displayName": response["displayName"] as? String ?? response["fullName"] as? String ?? "",
      "isNewUser": response["isNewUser"] as? Bool ?? false,
    ]
  }

  func deleteCurrentAccount(apiKey: String) async throws {
    guard let idToken = try await currentIDTokenForDeletion(apiKey: apiKey) else {
      clearTokens()
      return
    }

    _ = try await postJSON(
      url: firebaseURL(host: "identitytoolkit.googleapis.com", path: "/v1/accounts:delete", apiKey: apiKey),
      body: ["idToken": idToken]
    )
    clearTokens()
  }

  private func createAnonymousAccount(apiKey: String) async throws -> String {
    let response = try await postJSON(
      url: firebaseURL(host: "identitytoolkit.googleapis.com", path: "/v1/accounts:signUp", apiKey: apiKey),
      body: ["returnSecureToken": true]
    )
    return try persist(response: response, idTokenField: "idToken", refreshTokenField: "refreshToken", expiresField: "expiresIn")
  }

  private func refreshIDToken(apiKey: String, refreshToken: String) async throws -> String {
    let response = try await postForm(
      url: firebaseURL(host: "securetoken.googleapis.com", path: "/v1/token", apiKey: apiKey),
      body: "grant_type=refresh_token&refresh_token=\(percentEncode(refreshToken))"
    )
    return try persist(response: response, idTokenField: "id_token", refreshTokenField: "refresh_token", expiresField: "expires_in")
  }

  private func currentIDTokenForDeletion(apiKey: String) async throws -> String? {
    let now = Date().timeIntervalSince1970
    if let cached = defaults.string(forKey: idTokenKey),
       defaults.double(forKey: expiryKey) > now + 60 {
      return cached
    }

    guard let refreshToken = defaults.string(forKey: refreshTokenKey),
          !refreshToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return nil
    }
    return try await refreshIDToken(apiKey: apiKey, refreshToken: refreshToken)
  }

  private func clearTokens() {
    defaults.removeObject(forKey: idTokenKey)
    defaults.removeObject(forKey: refreshTokenKey)
    defaults.removeObject(forKey: expiryKey)
  }

  private func persist(
    response: [String: Any],
    idTokenField: String,
    refreshTokenField: String,
    expiresField: String
  ) throws -> String {
    guard let idToken = response[idTokenField] as? String,
          let refreshToken = response[refreshTokenField] as? String else {
      throw NSError(domain: "AcaciaAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase Auth response did not include tokens."])
    }

    let expiresIn = responseDuration(response[expiresField])
    defaults.set(idToken, forKey: idTokenKey)
    defaults.set(refreshToken, forKey: refreshTokenKey)
    defaults.set(Date().timeIntervalSince1970 + expiresIn, forKey: expiryKey)
    return idToken
  }
}

@available(iOS 13.0, macOS 10.15, *)
private final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private static var activeCoordinators: [String: AppleSignInCoordinator] = [:]

  private let id: String
  private let apiKey: String
  private let rawNonce: String
  private let presentationAnchor: ASPresentationAnchor
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock

  static func start(
    apiKey: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      guard let anchor = currentPresentationAnchor() else {
        reject("apple_sign_in_unavailable", "No active app window is available for Sign in with Apple.", nil)
        return
      }

      let rawNonce = try randomNonceString()
      let coordinator = AppleSignInCoordinator(
        id: UUID().uuidString,
        apiKey: apiKey,
        rawNonce: rawNonce,
        presentationAnchor: anchor,
        resolve: resolve,
        reject: reject
      )
      activeCoordinators[coordinator.id] = coordinator
      coordinator.perform()
    } catch {
      reject("apple_sign_in_nonce_failed", "Could not prepare Sign in with Apple.", error)
    }
  }

  private init(
    id: String,
    apiKey: String,
    rawNonce: String,
    presentationAnchor: ASPresentationAnchor,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    self.id = id
    self.apiKey = apiKey
    self.rawNonce = rawNonce
    self.presentationAnchor = presentationAnchor
    self.resolve = resolve
    self.reject = reject
  }

  private func perform() {
    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(rawNonce)

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    presentationAnchor
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      finishRejecting(code: "apple_sign_in_invalid_credential", message: "Apple did not return an Apple ID credential.", error: nil)
      return
    }
    guard let tokenData = credential.identityToken,
          let identityToken = String(data: tokenData, encoding: .utf8) else {
      finishRejecting(code: "apple_sign_in_missing_token", message: "Apple did not return an identity token.", error: nil)
      return
    }

    Task {
      do {
        var result = try await FirebaseAnonymousTokenProvider.shared.signInWithApple(
          apiKey: apiKey,
          identityToken: identityToken,
          rawNonce: rawNonce
        )
        if (result["displayName"] as? String)?.isEmpty != false,
           let displayName = displayName(from: credential.fullName) {
          result["displayName"] = displayName
        }
        finishResolving(result)
      } catch {
        finishRejecting(code: "firebase_apple_sign_in_failed", message: "Could not sign in with Apple.", error: error)
      }
    }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let nsError = error as NSError
    let code = nsError.code == ASAuthorizationError.canceled.rawValue
      ? "apple_sign_in_cancelled"
      : "apple_sign_in_failed"
    finishRejecting(code: code, message: error.localizedDescription, error: error)
  }

  private func finishResolving(_ value: [String: Any]) {
    DispatchQueue.main.async {
      self.resolve(value)
      Self.activeCoordinators[self.id] = nil
    }
  }

  private func finishRejecting(code: String, message: String, error: Error?) {
    DispatchQueue.main.async {
      self.reject(code, message, error)
      Self.activeCoordinators[self.id] = nil
    }
  }
}

@available(iOS 13.0, macOS 10.15, *)
private final class AppleAuthorizationCodeCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private static var activeCoordinators: [String: AppleAuthorizationCodeCoordinator] = [:]

  private let id: String
  private let presentationAnchor: ASPresentationAnchor
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock

  static func start(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let anchor = currentPresentationAnchor() else {
      reject("apple_sign_in_unavailable", "No active app window is available for Sign in with Apple.", nil)
      return
    }

    let coordinator = AppleAuthorizationCodeCoordinator(
      id: UUID().uuidString,
      presentationAnchor: anchor,
      resolve: resolve,
      reject: reject
    )
    activeCoordinators[coordinator.id] = coordinator
    coordinator.perform()
  }

  private init(
    id: String,
    presentationAnchor: ASPresentationAnchor,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    self.id = id
    self.presentationAnchor = presentationAnchor
    self.resolve = resolve
    self.reject = reject
  }

  private func perform() {
    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    presentationAnchor
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      finishRejecting(code: "apple_sign_in_invalid_credential", message: "Apple did not return an Apple ID credential.", error: nil)
      return
    }
    guard let codeData = credential.authorizationCode,
          let authorizationCode = String(data: codeData, encoding: .utf8),
          !authorizationCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      finishRejecting(code: "apple_sign_in_missing_authorization_code", message: "Apple did not return an authorization code.", error: nil)
      return
    }

    finishResolving(authorizationCode)
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let nsError = error as NSError
    let code = nsError.code == ASAuthorizationError.canceled.rawValue
      ? "apple_sign_in_cancelled"
      : "apple_sign_in_failed"
    finishRejecting(code: code, message: error.localizedDescription, error: error)
  }

  private func finishResolving(_ authorizationCode: String) {
    DispatchQueue.main.async {
      self.resolve(authorizationCode)
      Self.activeCoordinators[self.id] = nil
    }
  }

  private func finishRejecting(code: String, message: String, error: Error?) {
    DispatchQueue.main.async {
      self.reject(code, message, error)
      Self.activeCoordinators[self.id] = nil
    }
  }
}

private func responseDuration(_ value: Any?) -> Double {
  if let value = value as? Double {
    return value
  }
  if let value = value as? Int {
    return Double(value)
  }
  if let value = value as? String,
     let parsed = Double(value) {
    return parsed
  }
  return 3600
}

private func configuredValue(environmentKey: String, infoKey: String) -> String? {
  let environmentValue = ProcessInfo.processInfo.environment[environmentKey] ?? ""
  if !environmentValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    return environmentValue
  }

  let infoValue = Bundle.main.object(forInfoDictionaryKey: infoKey) as? String
  if !placeholderBuildSetting(infoValue),
     infoValue?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
    return infoValue
  }

  return nil
}

private func placeholderBuildSetting(_ value: String?) -> Bool {
  guard let value else {
    return false
  }
  return value.hasPrefix("$(") && value.hasSuffix(")")
}

private func firebaseURL(host: String, path: String, apiKey: String) -> URL {
  var components = URLComponents()
  components.scheme = "https"
  components.host = host
  components.path = path
  components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
  return components.url!
}

private func postJSON(url: URL, body: [String: Any]) async throws -> [String: Any] {
  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.httpBody = try JSONSerialization.data(withJSONObject: body)
  return try await requestJSON(request)
}

private func postForm(url: URL, body: String) async throws -> [String: Any] {
  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
  request.httpBody = body.data(using: .utf8)
  return try await requestJSON(request)
}

private func requestJSON(_ request: URLRequest) async throws -> [String: Any] {
  let (data, response) = try await URLSession.shared.data(for: request)
  guard let httpResponse = response as? HTTPURLResponse,
        (200..<300).contains(httpResponse.statusCode) else {
    throw NSError(domain: "AcaciaAuth", code: 2, userInfo: [NSLocalizedDescriptionKey: "Firebase Auth request failed."])
  }
  guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    throw NSError(domain: "AcaciaAuth", code: 3, userInfo: [NSLocalizedDescriptionKey: "Firebase Auth response was not JSON."])
  }
  return object
}

private func percentEncode(_ value: String) -> String {
  var allowed = CharacterSet.alphanumerics
  allowed.insert(charactersIn: "-._~")
  return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
}

@available(iOS 13.0, macOS 10.15, *)
private func currentPresentationAnchor() -> ASPresentationAnchor? {
  NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first
}

private func randomNonceString(length: Int = 32) throws -> String {
  precondition(length > 0)
  let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
  var result = ""
  var remainingLength = length

  while remainingLength > 0 {
    var random: UInt8 = 0
    let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
    if status != errSecSuccess {
      throw NSError(domain: "AcaciaAuth", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Could not generate a secure Apple sign-in nonce."])
    }
    if random < UInt8(charset.count) {
      result.append(charset[Int(random)])
      remainingLength -= 1
    }
  }

  return result
}

private func sha256(_ value: String) -> String {
  let digest = SHA256.hash(data: Data(value.utf8))
  return digest.map { String(format: "%02x", $0) }.joined()
}

private func displayName(from components: PersonNameComponents?) -> String? {
  guard let components else {
    return nil
  }
  let formatted = PersonNameComponentsFormatter().string(from: components)
  return formatted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : formatted
}

private func resolveOnMain(_ resolve: @escaping RCTPromiseResolveBlock, _ value: Any) {
  DispatchQueue.main.async {
    resolve(value)
  }
}

private func rejectOnMain(
  _ reject: @escaping RCTPromiseRejectBlock,
  _ code: String,
  _ message: String,
  _ error: Error?
) {
  DispatchQueue.main.async {
    reject(code, message, error)
  }
}
