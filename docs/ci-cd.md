# Local Cuttlefish CI/CD Runbook

This repository uses a Cuttlefish-native workflow, not GitHub Actions. There is no `.github/workflows` pipeline for this repo, so GitHub must not schedule these jobs on hosted or self-hosted GitHub runners.

## One-Time Local Onboarding

Start Cuttlefish, publish the task packages used by the workflow, then register and publish the workflow in the local catalog:

```bash
cd ../cuttlefish
make up
source .dev/last-dev-ports.env

docker build -t pipeline/checkout:0.2.1 task-packages/pipeline/checkout
docker build -t pipeline/run-script:0.2.0 task-packages/pipeline/run-script

go run ./cmd/cuttle task-packages publish task-packages/pipeline/checkout/manifest.yaml --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}"
go run ./cmd/cuttle task-packages publish task-packages/pipeline/run-script/manifest.yaml --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}"

go run ./cmd/cuttle workflows create ../pdf-viewer/workflows/pdf-viewer-ci.yaml \
  --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}" \
  --name pdf-viewer-ci \
  --description "pdf-viewer local CI: web install, build, Playwright e2e, artifacts"

go run ./cmd/cuttle workflows list --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}"
go run ./cmd/cuttle workflows publish <workflow-id> --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}"
```

The local UI is available at `http://localhost:${UI_HOST_PORT}` after sourcing `.dev/last-dev-ports.env`.

## Run Locally

Start the sibling Cuttlefish stack and run the workflow:

```bash
./scripts/run-cuttlefish-local-ci.sh
```

That script uses `../cuttlefish`, starts the local stack when needed, and runs:

```bash
cd ../cuttlefish
go run ./cmd/cuttle run start \
  --base-url http://localhost:<controlplane-port> \
  --workflow ../pdf-viewer/workflows/pdf-viewer-ci.yaml \
  --execution-mode docker \
  --capabilities docker \
  --wait
```

It also builds and publishes the local `pipeline/checkout` and `pipeline/run-script` task packages into the local Cuttlefish control plane before starting the run.

## Watch Jobs

Active jobs are visible on the local agent while a run is executing:

```bash
cd ../cuttlefish
source .dev/last-dev-ports.env
go run ./cmd/cuttle agent jobs --local "http://localhost:${RUNNER_HOST_PORT}" --watch
```

Completed runs are visible through the local control plane:

```bash
cd ../cuttlefish
source .dev/last-dev-ports.env
go run ./cmd/cuttle run list --base-url "http://localhost:${CONTROLPLANE_HOST_PORT}"
```

## What The Pipeline Does

- `checkout`: clones `https://github.com/castlemilk/pdf-viewer` into the Cuttlefish workspace.
- `install-web`: installs the root Vite app dependencies with an npm cache.
- `build-web`: runs TypeScript checking and the production Vite build.
- `e2e-web`: runs Playwright desktop and mobile Chromium checks.
- `collect-web-artifacts`: uploads the built `dist` directory as Cuttlefish artifacts.

## macOS App Validation

Cuttlefish's native local executor currently runs Docker/Podman tasks. The React Native macOS/Xcode validation must still run directly on the Mac host:

```bash
cd PDFViewer
npm ci
bundle config set path vendor/bundle
bundle install --jobs 4 --retry 3
bundle exec pod install --project-directory=macos
npm run validate
npm run e2e:macos
```
