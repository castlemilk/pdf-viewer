export {};

declare const __dirname: string;

const {readFileSync} = require('fs');
const path = require('path');

const scriptPath = path.join(
  __dirname,
  '..',
  'backend',
  'pro',
  'scripts',
  'deploy-cloud-run.sh',
);
const smokeScriptPath = path.join(
  __dirname,
  '..',
  'backend',
  'pro',
  'scripts',
  'smoke-cloud-run.sh',
);
const purchaseE2EScriptPath = path.join(
  __dirname,
  '..',
  'scripts',
  'run-macos-pro-purchase-e2e.sh',
);

test('pro backend deploy script grants Secret Manager access when admin token secret is used', () => {
  const script = readFileSync(scriptPath, 'utf8');

  expect(script).toContain('secretmanager.googleapis.com');
  expect(script).toContain('roles/secretmanager.secretAccessor');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET=${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET}:latest');
  expect(script).toContain('ACACIA_ADMIN_TOKEN_SECRET');
});

test('pro backend deploy script configures the cloud library bucket', () => {
  const script = readFileSync(scriptPath, 'utf8');

  expect(script).toContain('ACACIA_CLOUD_BUCKET');
  expect(script).toContain('ACACIA_CLOUD_PREFIX');
  expect(script).toContain('gs://${ACACIA_CLOUD_BUCKET}');
});

test('pro backend smoke script runs the protobuf Cloud Run smoke command', () => {
  const script = readFileSync(smokeScriptPath, 'utf8');

  expect(script).toContain('ACACIA_PRO_BASE_URL');
  expect(script).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(script).toContain('go run ./cmd/acacia-pro-smoke');
});

test('macOS Pro purchase e2e script runs a local backend and StoreKit fixture', () => {
  const script = readFileSync(purchaseE2EScriptPath, 'utf8');

  expect(script).toContain('go run ./cmd/acacia-pro-e2e');
  expect(script).toContain('ACACIA_PRO_API_BASE_URL');
  expect(script).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(script).toContain('ACACIA_STOREKIT_TEST_SIGNED_JWS');
  expect(script).toContain('port_in_use()');
  expect(script).toContain('find_free_port()');
  expect(script).toContain('! kill -0 "$BACKEND_PID"');
  expect(script).toContain('"${BASE_URL}/health"');
  expect(script).toContain(
    'Acacia-macOSUITests/PDFViewerUITests/testProPurchaseFlowActivatesCommentsThroughBackend',
  );
});
