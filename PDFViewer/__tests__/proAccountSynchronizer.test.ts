import {createProAccountSynchronizer} from '../src/pro/proAccountSynchronizer';

test('syncs active Pro entitlement into app account state and storage quota', async () => {
  const getIDToken = jest.fn(async () => 'firebase-token');
  const getAccount = jest.fn(async () => ({
    account: {
      firebaseUid: 'firebase-user-1',
      email: 'eshe@example.com',
      plan: 'pro' as const,
      active: true,
      storageQuotaBytes: 20 * 1024 * 1024 * 1024,
      storageUsedBytes: 1536 * 1024 * 1024,
      customerId: 'customer-token',
      appStoreOriginalTransactionId: '1000001234567890',
      source: 'app_store' as const,
      features: ['review_threads', 'cloud_storage'],
      appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    },
  }));
  const synchronizer = createProAccountSynchronizer({
    authTokenProvider: {getIDToken},
    backendClient: {getAccount},
  });

  await expect(synchronizer.syncAccount()).resolves.toEqual({
    accountState: {signedIn: true, plan: 'pro'},
    storageLimitGb: 20,
    storageUsedGb: 1.5,
  });

  expect(getAccount).toHaveBeenCalledWith('firebase-token');
});

test('does not sync when native auth or backend config is unavailable', async () => {
  const getAccount = jest.fn();
  const synchronizer = createProAccountSynchronizer({
    authTokenProvider: undefined,
    backendClient: {getAccount},
  });

  await expect(synchronizer.syncAccount()).resolves.toBeUndefined();
  expect(getAccount).not.toHaveBeenCalled();
});

