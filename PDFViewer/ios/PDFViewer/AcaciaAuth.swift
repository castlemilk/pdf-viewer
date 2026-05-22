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
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(
      configuredValue(
        environmentKey: "ACACIA_FIREBASE_ID_TOKEN",
        infoKey: "AcaciaFirebaseIDToken"
      ) ?? NSNull()
    )
  }
}

private func configuredValue(environmentKey: String, infoKey: String) -> String? {
  let environmentValue = ProcessInfo.processInfo.environment[environmentKey] ?? ""
  if !environmentValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    return environmentValue
  }

  let infoValue = Bundle.main.object(forInfoDictionaryKey: infoKey) as? String
  if infoValue?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
    return infoValue
  }

  return nil
}

