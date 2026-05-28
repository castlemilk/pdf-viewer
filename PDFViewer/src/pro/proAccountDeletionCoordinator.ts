import type {
  DeleteAccountResponse,
  RevokeAppleSignInTokenResponse,
} from './protobuf';
import type {ProAuthTokenProvider} from './proPurchaseCoordinator';

export type ProAccountDeleteBackend = {
  deleteAccount: (firebaseIDToken: string) => Promise<DeleteAccountResponse>;
  revokeAppleSignInToken?: (
    firebaseIDToken: string,
    authorizationCode: string,
  ) => Promise<RevokeAppleSignInTokenResponse>;
};

export type NativeAccountDeleter = {
  deleteFirebaseAccount: () => Promise<void>;
};

export type AppleAuthorizationCodeProvider = {
  requestAppleAuthorizationCode: () => Promise<string>;
};

export type ProAccountDeletionResult = {
  deleted: boolean;
};

export type ProAccountDeletionCoordinator = {
  deleteAccount: () => Promise<ProAccountDeletionResult>;
};

export class ProAccountDeletionUnavailableError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProAccountDeletionUnavailableError';
    this.code = code;
  }
}

export function createProAccountDeletionCoordinator({
  authTokenProvider,
  backendClient,
  appleAuthorizationCodeProvider,
  nativeAccountDeleter,
}: {
  authTokenProvider?: ProAuthTokenProvider;
  backendClient?: ProAccountDeleteBackend;
  appleAuthorizationCodeProvider?: AppleAuthorizationCodeProvider;
  nativeAccountDeleter?: NativeAccountDeleter;
}): ProAccountDeletionCoordinator {
  return {
    async deleteAccount() {
      if (!authTokenProvider || !nativeAccountDeleter) {
        throw new ProAccountDeletionUnavailableError(
          'auth_unavailable',
          'Account deletion is not configured in this build.',
        );
      }

      const firebaseIDToken = await authTokenProvider.getIDToken();
      if (!firebaseIDToken) {
        throw new ProAccountDeletionUnavailableError(
          'auth_unavailable',
          'Sign in before deleting your account.',
        );
      }

      if (backendClient) {
        if (
          backendClient.revokeAppleSignInToken &&
          appleAuthorizationCodeProvider
        ) {
          const authorizationCode =
            await appleAuthorizationCodeProvider.requestAppleAuthorizationCode();
          if (authorizationCode) {
            await backendClient.revokeAppleSignInToken(
              firebaseIDToken,
              authorizationCode,
            );
          }
        }
        await backendClient.deleteAccount(firebaseIDToken);
      }
      await nativeAccountDeleter.deleteFirebaseAccount();

      return {deleted: true};
    },
  };
}
