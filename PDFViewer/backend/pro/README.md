# Acacia Pro Backend

Lightweight entitlement and cloud-sync service for Acacia Pro.

## Shape

- Cloud Run HTTP service, scale-to-zero by default.
- Firebase Auth ID token verification at the application layer.
- GCS object storage for entitlement records, cloud library snapshots, and uploaded PDF content.
- Protocol Buffers for request and response payloads.
- No Firestore polling, workers, heartbeats, or warm minimum instances.

## Endpoints

All protobuf endpoints return `application/x-protobuf`.

- `GET /health`
- `POST /v1/account:get`
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Body: `acacia.pro.v1.GetAccountRequest`.
  - Response: `acacia.pro.v1.GetAccountResponse`.
  - Missing stored entitlement returns an active signed-in free account.
- `POST /v1/account:purchaseContext`
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Returns StoreKit product ids and the stable `appAccountToken` to pass into the native purchase call.
- `POST /v1/account/apple:revoke`
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Body: `acacia.pro.v1.RevokeAppleSignInTokenRequest` with a fresh Sign in with Apple authorization code.
  - Exchanges the code server-side and revokes the resulting Apple token for App Review 5.1.1 account deletion.
- `POST /v1/account:delete`
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Deletes entitlement and cloud data for the Firebase UID. The app calls Apple token revocation before this endpoint for Apple-backed accounts.
- `POST /v1/app_store/transactions:sync`
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Body: `acacia.pro.v1.SyncAppStoreTransactionRequest`.
  - Verifies the signed StoreKit transaction JWS and stores the Pro entitlement.
- `POST /v1/library:sync`
  - Requires an active Pro entitlement.
  - Body: `acacia.pro.v1.SyncLibraryRequest`.
  - Stores the latest local-first document metadata and annotation snapshot.
- `POST /v1/documents/content:upload`
  - Requires an active Pro entitlement.
  - Body: `acacia.pro.v1.UploadDocumentContentRequest`.
  - Stores PDF bytes in GCS and updates `storage_used_bytes`.
- `POST /v1/documents/content:download`
  - Requires an active Pro entitlement.
  - Body: `acacia.pro.v1.DownloadDocumentContentRequest`.
  - Returns the stored PDF bytes for the requested document.
- `POST /v1/app_store/notifications`
  - App Store Server Notifications V2 endpoint.
  - Body: JSON `{ "signedPayload": "<signedPayload>" }`.
  - Verifies the notification JWS, verifies the nested transaction JWS, then renews or downgrades the stored entitlement.
- `POST /v1/admin/entitlements:upsert`
  - Disabled unless `ACACIA_ADMIN_TOKEN` is configured.
  - Requires `Authorization: Bearer <admin-token>`.
  - Body: `acacia.pro.v1.UpsertEntitlementRequest`.
  - Response: `acacia.pro.v1.UpsertEntitlementResponse`.

## Environment

- `PORT`: Cloud Run sets this automatically. Defaults to `8080`.
- `FIREBASE_PROJECT_ID`: Firebase project used to verify ID tokens.
- `ACACIA_ENTITLEMENTS_BUCKET`: GCS bucket for entitlement protobuf objects.
- `ACACIA_ENTITLEMENTS_PREFIX`: object prefix. Defaults to `pro`.
- `ACACIA_CLOUD_BUCKET`: GCS bucket for cloud library/PDF objects. Defaults to `ACACIA_ENTITLEMENTS_BUCKET`.
- `ACACIA_CLOUD_PREFIX`: object prefix for cloud library/PDF objects. Defaults to `pro`.
- `ACACIA_APP_ACCOUNT_TOKEN_SECRET`: required HMAC secret for stable StoreKit `appAccountToken` values.
- `ACACIA_BUNDLE_ID`: App Store bundle id. Defaults to `com.benebsworth.acacia`.
- `ACACIA_PRO_PRODUCT_IDS`: comma-separated App Store product ids. Defaults to monthly and yearly Acacia Pro ids.
- `ACACIA_PRO_STORAGE_QUOTA_BYTES`: Pro cloud quota. Defaults to `21474836480`.
- `ACACIA_ADMIN_TOKEN`: optional admin token for manual entitlement provisioning.
- `ACACIA_APPLE_TEAM_ID`, `ACACIA_APPLE_KEY_ID`, `ACACIA_APPLE_CLIENT_ID`: optional Sign in with Apple REST API identifiers for account-deletion token revocation. `ACACIA_APPLE_CLIENT_ID` defaults to `ACACIA_BUNDLE_ID`.
- `ACACIA_APPLE_PRIVATE_KEY` or `ACACIA_APPLE_PRIVATE_KEY_FILE`: optional Sign in with Apple `.p8` private key. Required with the Apple identifiers to enable `/v1/account/apple:revoke`.

The Cloud Run service account needs permission to read/write objects in the entitlement and cloud buckets.

## Local Validation

```bash
go test ./...
```

Regenerate Go protobuf bindings after editing `proto/acacia/pro/v1/account.proto`:

```bash
protoc -I proto --go_out=. --go_opt=module=github.com/benebsworth/acacia/backend/pro proto/acacia/pro/v1/account.proto
```

## Staging Smoke

After deploying a staging service, run protobuf-level smoke checks against the real Cloud Run URL:

```bash
ACACIA_PRO_BASE_URL=https://<cloud-run-host> \
ACACIA_FIREBASE_ID_TOKEN=<firebase-id-token> \
scripts/smoke-cloud-run.sh
```

To also verify the admin provisioning path, use a smoke Firebase token whose UID matches `ACACIA_SMOKE_FIREBASE_UID`:

```bash
ACACIA_PRO_BASE_URL=https://<cloud-run-host> \
ACACIA_FIREBASE_ID_TOKEN=<firebase-id-token> \
ACACIA_ADMIN_TOKEN=<admin-token> \
ACACIA_SMOKE_FIREBASE_UID=<firebase-uid> \
ACACIA_SMOKE_EMAIL=smoke@example.com \
scripts/smoke-cloud-run.sh
```

The smoke command covers `/health`, unauthorized auth guarding, purchase context, account refresh, and optional admin entitlement upsert. Real App Store purchase and transaction-JWS sync still need a sandbox StoreKit run from macOS/iOS.

## Deploy

```bash
GCP_PROJECT_ID=acacia-prod \
FIREBASE_PROJECT_ID=acacia-prod \
ACACIA_ENTITLEMENTS_BUCKET=acacia-prod-entitlements \
ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET=acacia-pro-app-account-token-secret \
ACACIA_ADMIN_TOKEN_SECRET=acacia-pro-admin-token \
scripts/deploy-cloud-run.sh
```

The service is deployed with `--allow-unauthenticated` because Firebase token verification happens inside the service. Do not expose privileged admin behavior without `ACACIA_ADMIN_TOKEN` provided from Secret Manager.

The deploy script enables the required Cloud Run, Cloud Build, Artifact Registry, and Storage APIs, creates the entitlement bucket if it is missing, grants the Cloud Run runtime service account object access, and deploys with minimum instances set to `0`.

After deploy, configure the App Store Server Notifications V2 production URL in App Store Connect as:

```text
https://<cloud-run-host>/v1/app_store/notifications
```
