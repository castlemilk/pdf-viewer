# CI/CD Runbook

This repository is wired for GitHub Actions jobs that run on a Cuttlefish-backed self-hosted macOS runner.

## Runner Labels

The workflow requires a runner with these labels:

```text
self-hosted, cuttlefish, macOS, pdf-viewer
```

Register the local Cuttlefish GitHub Actions compatibility runner from the sibling Cuttlefish checkout:

```bash
./scripts/start-cuttlefish-runner.sh
```

For a background runner on this Mac:

```bash
./scripts/install-cuttlefish-runner-launch-agent.sh
launchctl print gui/$(id -u)/com.castlemilk.pdf-viewer.cuttlefish-runner
tail -f ~/.cuttlefish/pdf-viewer-gh-runner.log
```

## Cuttlefish Cloud Onboarding

The Cuttlefish org and project are:

```text
org:     castlemilk
project: pdf-viewer
repo:    https://github.com/castlemilk/pdf-viewer
```

Finish the GitHub App mapping when repository access is granted:

```bash
cd ../cuttlefish
go run ./cmd/cuttle github install --org castlemilk --project pdf-viewer --open
go run ./cmd/cuttle github installations --org castlemilk
go run ./cmd/cuttle github sync --org castlemilk --installation <installation-id>
go run ./cmd/cuttle github map --org castlemilk --project pdf-viewer --repo castlemilk/pdf-viewer
go run ./cmd/cuttle projects check pdf-viewer
```

## What The Pipeline Does

- `web-landing`: installs the root Vite app, builds it, and runs Playwright e2e checks on desktop and mobile Chromium.
- `macos-app`: installs the React Native macOS app, installs CocoaPods, runs lint, Jest, TypeScript, native XCTest, and macOS UI e2e tests.
- `package-macos`: on manual runs or `v*.*.*` tags, builds a Release ZIP and checksum.
- `publish-release`: on `v*.*.*` tags, creates or updates a GitHub release with the macOS ZIP assets.

## Local Validation

```bash
npm run build
npm run test:e2e

cd PDFViewer
npm run validate
npm run macos:ui-build
npm run e2e:macos
```
