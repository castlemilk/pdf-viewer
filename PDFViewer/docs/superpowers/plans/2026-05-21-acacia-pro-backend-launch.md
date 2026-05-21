# Acacia Pro Backend Launch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add launch-ready backend support for Acacia Pro entitlements without destabilizing the macOS/iOS app release path.

**Architecture:** Add a standalone Go Cloud Run service under `backend/pro`. The app will send Firebase ID tokens to a protobuf-over-HTTP endpoint, the service will verify them with Firebase Admin, and durable entitlement records will be stored as protobuf objects in GCS. Cloud Run stays request-triggered with minimum instances at zero.

**Tech Stack:** Go, Protocol Buffers, Firebase Admin SDK, Cloud Run, Google Cloud Storage, Jest/native validation for the existing app.

---

### Task 1: Pro Entitlement Schema

**Files:**
- Create: `backend/pro/proto/acacia/pro/v1/account.proto`
- Generate: `backend/pro/gen/acacia/pro/v1/account.pb.go`

- [ ] Define plan, source, account entitlement, get account, upsert entitlement, and error protobuf messages.
- [ ] Generate Go protobuf bindings with `protoc`.
- [ ] Keep the schema independent of app UI copy and StoreKit-specific client code.

### Task 2: Backend HTTP Service

**Files:**
- Create: `backend/pro/internal/server/server_test.go`
- Create: `backend/pro/internal/server/server.go`
- Create: `backend/pro/internal/entitlements/store.go`
- Create: `backend/pro/internal/auth/firebase.go`
- Create: `backend/pro/cmd/acacia-pro/main.go`

- [ ] Write failing tests for unauthorized access, signed-in free fallback, and admin entitlement upsert.
- [ ] Implement protobuf request/response handling.
- [ ] Implement Firebase token verifier abstraction and production verifier.
- [ ] Implement GCS-backed entitlement storage.
- [ ] Keep admin upsert disabled unless `ACACIA_ADMIN_TOKEN` is configured.

### Task 3: Deployability

**Files:**
- Create: `backend/pro/Dockerfile`
- Create: `backend/pro/scripts/deploy-cloud-run.sh`
- Create: `backend/pro/README.md`

- [ ] Build a small multi-stage Go container.
- [ ] Provide a Cloud Run deploy script with min instances set to zero.
- [ ] Document required Firebase, GCS, and Cloud Run configuration.

### Task 4: Validation And Launch Follow-Through

**Files:**
- Modify only as needed: `package.json`, release metadata, app client wiring.

- [ ] Run `go test ./...` inside `backend/pro`.
- [ ] Run the existing app validation touched by Pro UI changes.
- [ ] Decide whether v1 ships Pro UI behind real Firebase sign-in or temporarily hides the Pro-gated copy.
- [ ] Produce fresh macOS/iOS archive uploads after backend and app-client launch decisions are complete.
