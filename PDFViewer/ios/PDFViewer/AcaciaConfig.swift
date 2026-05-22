import Foundation
import React

@objc(AcaciaConfig)
final class AcaciaConfig: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any] {
    [
      "proApiBaseURL": configuredValue(
        environmentKey: "ACACIA_PRO_API_BASE_URL",
        infoKey: "AcaciaProAPIBaseURL"
      ) ?? ""
    ]
  }
}

private func configuredValue(environmentKey: String, infoKey: String) -> String? {
  let environmentValue = ProcessInfo.processInfo.environment[environmentKey] ?? ""
  if !environmentValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    return environmentValue
  }

  return Bundle.main.object(forInfoDictionaryKey: infoKey) as? String
}

