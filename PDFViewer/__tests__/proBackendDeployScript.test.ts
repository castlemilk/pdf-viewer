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

test('pro backend deploy script grants Secret Manager access when admin token secret is used', () => {
  const script = readFileSync(scriptPath, 'utf8');

  expect(script).toContain('secretmanager.googleapis.com');
  expect(script).toContain('roles/secretmanager.secretAccessor');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET=${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET}:latest');
  expect(script).toContain('ACACIA_ADMIN_TOKEN_SECRET');
});

test('pro backend smoke script runs the protobuf Cloud Run smoke command', () => {
  const script = readFileSync(smokeScriptPath, 'utf8');

  expect(script).toContain('ACACIA_PRO_BASE_URL');
  expect(script).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(script).toContain('go run ./cmd/acacia-pro-smoke');
});
