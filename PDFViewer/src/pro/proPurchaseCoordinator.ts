import type {PersistedAccountState} from '../domain';
import type {
  GetPurchaseContextResponse,
  SyncAppStoreTransactionResponse,
} from './protobuf';

export type ProAuthTokenProvider = {
  getIDToken: () => Promise<string | undefined>;
};

export type ProBackend = {
  getPurchaseContext: (
    firebaseIDToken: string,
  ) => Promise<GetPurchaseContextResponse>;
  syncAppStoreTransaction: (
    firebaseIDToken: string,
    signedTransactionJws: string,
  ) => Promise<SyncAppStoreTransactionResponse>;
};

export type ProStoreKitPurchaseInput = {
  productId: string;
  appAccountToken: string;
};

export type ProStoreKitPurchaseResult = {
  productId: string;
  originalTransactionId: string;
  signedTransactionJws: string;
};

export type ProStoreKit = {
  purchasePro: (
    input: ProStoreKitPurchaseInput,
  ) => Promise<ProStoreKitPurchaseResult>;
};

export type ProPurchaseResult = {
  accountState: PersistedAccountState;
  storageLimitGb?: number;
};

export type ProPurchaseCoordinator = {
  purchasePro: () => Promise<ProPurchaseResult>;
};

export class ProPurchaseUnavailableError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProPurchaseUnavailableError';
    this.code = code;
  }
}

export function createProPurchaseCoordinator({
  authTokenProvider,
  backendClient,
  storeKit,
}: {
  authTokenProvider?: ProAuthTokenProvider;
  backendClient?: ProBackend;
  storeKit?: ProStoreKit;
}): ProPurchaseCoordinator {
  return {
    async purchasePro() {
      if (!authTokenProvider) {
        throw new ProPurchaseUnavailableError(
          'auth_unavailable',
          'Sign in is not configured in this build.',
        );
      }
      if (!backendClient) {
        throw new ProPurchaseUnavailableError(
          'backend_unavailable',
          'Acacia Pro backend is not configured in this build.',
        );
      }
      if (!storeKit) {
        throw new ProPurchaseUnavailableError(
          'storekit_unavailable',
          'App Store purchases are not available on this device.',
        );
      }

      const firebaseIDToken = await authTokenProvider.getIDToken();
      if (!firebaseIDToken) {
        throw new ProPurchaseUnavailableError(
          'auth_unavailable',
          'Sign in before purchasing Acacia Pro.',
        );
      }

      const context = await backendClient.getPurchaseContext(firebaseIDToken);
      const productId = context.productIds[0];
      if (!productId) {
        throw new ProPurchaseUnavailableError(
          'products_unavailable',
          'No Acacia Pro App Store products are configured.',
        );
      }
      if (!context.appAccountToken) {
        throw new ProPurchaseUnavailableError(
          'app_account_token_unavailable',
          'Acacia Pro account token is not configured.',
        );
      }

      const transaction = await storeKit.purchasePro({
        productId,
        appAccountToken: context.appAccountToken,
      });
      const synced = await backendClient.syncAppStoreTransaction(
        firebaseIDToken,
        transaction.signedTransactionJws,
      );
      const account = synced.account;

      if (!account?.active || account.plan !== 'pro') {
        throw new ProPurchaseUnavailableError(
          'entitlement_inactive',
          'Acacia Pro purchase did not activate this account.',
        );
      }

      return {
        accountState: {signedIn: true, plan: 'pro'},
        storageLimitGb:
          account.storageQuotaBytes > 0
            ? bytesToGibibytes(account.storageQuotaBytes)
            : undefined,
      };
    },
  };
}

function bytesToGibibytes(bytes: number) {
  return bytes / (1024 * 1024 * 1024);
}
