import type {PersistedAccountState} from '../domain';
import type {GetAccountResponse} from './protobuf';
import type {ProAuthTokenProvider} from './proPurchaseCoordinator';

export type ProAccountBackend = {
  getAccount: (firebaseIDToken: string) => Promise<GetAccountResponse>;
};

export type ProAccountSyncResult = {
  accountState: PersistedAccountState;
  storageLimitGb?: number;
  storageUsedGb?: number;
};

export type ProAccountSynchronizer = {
  syncAccount: () => Promise<ProAccountSyncResult | undefined>;
};

export function createProAccountSynchronizer({
  authTokenProvider,
  backendClient,
}: {
  authTokenProvider?: ProAuthTokenProvider;
  backendClient?: ProAccountBackend;
}): ProAccountSynchronizer {
  return {
    async syncAccount() {
      if (!authTokenProvider || !backendClient) {
        return undefined;
      }

      const firebaseIDToken = await authTokenProvider.getIDToken();
      if (!firebaseIDToken) {
        return undefined;
      }

      const response = await backendClient.getAccount(firebaseIDToken);
      const account = response.account;
      if (!account?.active) {
        return undefined;
      }

      return {
        accountState: {
          signedIn: true,
          plan: account.plan === 'pro' ? 'pro' : 'free',
        },
        storageLimitGb:
          account.storageQuotaBytes > 0
            ? bytesToGibibytes(account.storageQuotaBytes)
            : undefined,
        storageUsedGb:
          account.storageUsedBytes > 0
            ? bytesToGibibytes(account.storageUsedBytes)
            : undefined,
      };
    },
  };
}

function bytesToGibibytes(bytes: number) {
  return bytes / (1024 * 1024 * 1024);
}

