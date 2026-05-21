import {
  createProPurchaseCoordinator,
  ProPurchaseUnavailableError,
} from '../src/pro/proPurchaseCoordinator';

test('purchases the first App Store product with backend appAccountToken and syncs the JWS', async () => {
  const getIDToken = jest.fn(async () => 'firebase-token');
  const getPurchaseContext = jest.fn(async () => ({
    appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    productIds: [
      'com.benebsworth.acacia.pro.monthly',
      'com.benebsworth.acacia.pro.yearly',
    ],
    bundleId: 'com.benebsworth.acacia',
  }));
  const purchasePro = jest.fn(async () => ({
    productId: 'com.benebsworth.acacia.pro.monthly',
    originalTransactionId: '1000001234567890',
    signedTransactionJws: 'signed-jws',
  }));
  const syncAppStoreTransaction = jest.fn(async () => ({
    account: {
      firebaseUid: 'firebase-user-1',
      email: 'eshe@example.com',
      plan: 'pro' as const,
      active: true,
      storageQuotaBytes: 20 * 1024 * 1024 * 1024,
      storageUsedBytes: 0,
      customerId: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
      appStoreOriginalTransactionId: '1000001234567890',
      source: 'app_store' as const,
      features: ['review_threads', 'cloud_storage'],
      appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    },
  }));
  const coordinator = createProPurchaseCoordinator({
    authTokenProvider: {getIDToken},
    backendClient: {getPurchaseContext, syncAppStoreTransaction},
    storeKit: {purchasePro},
  });

  await expect(coordinator.purchasePro()).resolves.toEqual({
    accountState: {signedIn: true, plan: 'pro'},
    storageLimitGb: 20,
  });

  expect(getIDToken).toHaveBeenCalledTimes(1);
  expect(getPurchaseContext).toHaveBeenCalledWith('firebase-token');
  expect(purchasePro).toHaveBeenCalledWith({
    productId: 'com.benebsworth.acacia.pro.monthly',
    appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
  });
  expect(syncAppStoreTransaction).toHaveBeenCalledWith(
    'firebase-token',
    'signed-jws',
  );
});

test('fails before purchase when Firebase auth token provider is unavailable', async () => {
  const coordinator = createProPurchaseCoordinator({
    authTokenProvider: undefined,
    backendClient: {
      getPurchaseContext: jest.fn(),
      syncAppStoreTransaction: jest.fn(),
    },
    storeKit: {purchasePro: jest.fn()},
  });

  await expect(coordinator.purchasePro()).rejects.toEqual(
    new ProPurchaseUnavailableError(
      'auth_unavailable',
      'Sign in is not configured in this build.',
    ),
  );
});

test('fails before purchase when backend has no App Store product ids', async () => {
  const purchasePro = jest.fn();
  const coordinator = createProPurchaseCoordinator({
    authTokenProvider: {getIDToken: jest.fn(async () => 'firebase-token')},
    backendClient: {
      getPurchaseContext: jest.fn(async () => ({
        appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
        productIds: [],
        bundleId: 'com.benebsworth.acacia',
      })),
      syncAppStoreTransaction: jest.fn(),
    },
    storeKit: {purchasePro},
  });

  await expect(coordinator.purchasePro()).rejects.toEqual(
    new ProPurchaseUnavailableError(
      'products_unavailable',
      'No Acacia Pro App Store products are configured.',
    ),
  );
  expect(purchasePro).not.toHaveBeenCalled();
});
