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

test('pro backend deploy script grants Secret Manager access when admin token secret is used', () => {
  const script = readFileSync(scriptPath, 'utf8');

  expect(script).toContain('secretmanager.googleapis.com');
  expect(script).toContain('roles/secretmanager.secretAccessor');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET');
  expect(script).toContain('ACACIA_APP_ACCOUNT_TOKEN_SECRET=${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET}:latest');
  expect(script).toContain('ACACIA_ADMIN_TOKEN_SECRET');
});
