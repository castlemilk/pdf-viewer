import {NativeModules, Platform} from 'react-native';

export type AppleSignInResult = {
  providerId: 'apple.com';
  firebaseUid?: string;
  email?: string;
  displayName?: string;
  isNewUser?: boolean;
};

type NativeAcaciaAuth = {
  getFirebaseIDToken?: () => Promise<string | undefined>;
  signInWithApple?: () => Promise<AppleSignInResult>;
  requestAppleAuthorizationCode?: () => Promise<string>;
  deleteFirebaseAccount?: () => Promise<void>;
};

function getNativeBridge() {
  return NativeModules.AcaciaAuth as NativeAcaciaAuth | undefined;
}

export const AcaciaAuthBridge = {
  isAppleSignInAvailable() {
    const nativeBridge = getNativeBridge();
    return (
      (Platform.OS === 'ios' || Platform.OS === 'macos') &&
      typeof nativeBridge?.signInWithApple === 'function'
    );
  },

  async getFirebaseIDToken() {
    return getNativeBridge()?.getFirebaseIDToken?.();
  },

  async signInWithApple(): Promise<AppleSignInResult> {
    const nativeBridge = getNativeBridge();
    if (!nativeBridge?.signInWithApple) {
      throw new Error('Sign in with Apple is not available in this build.');
    }

    return nativeBridge.signInWithApple();
  },

  async deleteFirebaseAccount(): Promise<void> {
    const nativeBridge = getNativeBridge();
    if (!nativeBridge?.deleteFirebaseAccount) {
      throw new Error('Account deletion is not available in this build.');
    }

    await nativeBridge.deleteFirebaseAccount();
  },

  async requestAppleAuthorizationCode(): Promise<string> {
    const nativeBridge = getNativeBridge();
    if (!nativeBridge?.requestAppleAuthorizationCode) {
      throw new Error(
        'Sign in with Apple reauthentication is not available in this build.',
      );
    }

    return nativeBridge.requestAppleAuthorizationCode();
  },
};
