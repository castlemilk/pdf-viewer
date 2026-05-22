import Foundation
import React
import StoreKit

@objc(AcaciaStoreKit)
final class AcaciaStoreKit: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(purchasePro:appAccountToken:resolver:rejecter:)
  func purchasePro(
    _ productId: String,
    appAccountToken: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let appAccountUUID = UUID(uuidString: appAccountToken) else {
      reject("invalid_app_account_token", "Backend app account token is not a UUID.", nil)
      return
    }

    if let testPayload = storeKitTestPayload(productId: productId) {
      resolve(testPayload)
      return
    }

    Task {
      do {
        let products = try await Product.products(for: [productId])
        guard let product = products.first else {
          rejectOnMain(reject, "product_unavailable", "Acacia Pro product is not available.", nil)
          return
        }

        let options: Set<Product.PurchaseOption> = [
          Product.PurchaseOption.appAccountToken(appAccountUUID)
        ]
        let result = try await product.purchase(options: options)

        switch result {
        case .success(let verification):
          let signedTransactionJws = verification.jwsRepresentation
          let transaction = try verifiedTransaction(from: verification)
          let payload: [String: Any] = [
            "productId": transaction.productID,
            "originalTransactionId": String(transaction.originalID),
            "signedTransactionJws": signedTransactionJws,
          ]
          await transaction.finish()
          resolveOnMain(resolve, payload)
        case .userCancelled:
          rejectOnMain(reject, "purchase_cancelled", "The App Store purchase was cancelled.", nil)
        case .pending:
          rejectOnMain(reject, "purchase_pending", "The App Store purchase is pending approval.", nil)
        @unknown default:
          rejectOnMain(reject, "purchase_unknown", "The App Store purchase did not complete.", nil)
        }
      } catch {
        rejectOnMain(reject, "purchase_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(restorePro:resolver:rejecter:)
  func restorePro(
    _ productIds: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if let testPayload = storeKitTestPayload(productId: productIds.first ?? "") {
      resolve(testPayload)
      return
    }

    Task {
      do {
        let allowedProductIds = Set(productIds)
        for await verification in Transaction.currentEntitlements {
          let signedTransactionJws = verification.jwsRepresentation
          let transaction = try verifiedTransaction(from: verification)
          guard allowedProductIds.contains(transaction.productID) else {
            continue
          }

          resolveOnMain(resolve, [
            "productId": transaction.productID,
            "originalTransactionId": String(transaction.originalID),
            "signedTransactionJws": signedTransactionJws,
          ])
          return
        }

        rejectOnMain(reject, "restore_not_found", "No active Acacia Pro purchase was found for this Apple ID.", nil)
      } catch {
        rejectOnMain(reject, "restore_failed", error.localizedDescription, error)
      }
    }
  }
}

private func storeKitTestPayload(productId: String) -> [String: Any]? {
  let environment = ProcessInfo.processInfo.environment
  guard environment["PDFVIEWER_PRO_PURCHASE_TESTING"] == "1" else {
    return nil
  }
  guard let signedTransactionJws = environment["ACACIA_STOREKIT_TEST_SIGNED_JWS"],
        !signedTransactionJws.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    return nil
  }

  return [
    "productId": productId,
    "originalTransactionId": environment["ACACIA_STOREKIT_TEST_ORIGINAL_TRANSACTION_ID"] ?? "acacia-ui-test-original-transaction",
    "signedTransactionJws": signedTransactionJws,
  ]
}

private func verifiedTransaction(
  from result: VerificationResult<Transaction>
) throws -> Transaction {
  switch result {
  case .verified(let transaction):
    return transaction
  case .unverified(_, let error):
    throw error
  }
}

private func resolveOnMain(
  _ resolve: @escaping RCTPromiseResolveBlock,
  _ value: Any
) {
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
