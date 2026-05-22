import Foundation
import React

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
