import {NativeModules} from 'react-native';
import {StoreKitBridge} from '../native/StoreKitBridge';
import {
  createProAccountSynchronizer,
  type ProAccountSynchronizer,
} from './proAccountSynchronizer';
import {ProBackendClient} from './proBackendClient';
import {
  createProPurchaseCoordinator,
  type ProAuthTokenProvider,
  type ProPurchaseCoordinator,
} from './proPurchaseCoordinator';

type NativeAcaciaAuth = {
  getFirebaseIDToken?: () => Promise<string | undefined>;
};

type NativeAcaciaConfig = {
  proApiBaseURL?: string;
};

type AcaciaGlobals = typeof globalThis & {
  __ACACIA_PRO_API_BASE_URL__?: string;
};

export function createDefaultProPurchaseCoordinator(): ProPurchaseCoordinator {
  const baseUrl = getDefaultProApiBaseUrl();

  return createProPurchaseCoordinator({
    authTokenProvider: getNativeFirebaseAuthTokenProvider(),
    backendClient: baseUrl ? new ProBackendClient({baseUrl}) : undefined,
    storeKit: StoreKitBridge.isAvailable() ? StoreKitBridge : undefined,
  });
}

export function createDefaultProAccountSynchronizer(): ProAccountSynchronizer {
  const baseUrl = getDefaultProApiBaseUrl();

  return createProAccountSynchronizer({
    authTokenProvider: getNativeFirebaseAuthTokenProvider(),
    backendClient: baseUrl ? new ProBackendClient({baseUrl}) : undefined,
  });
}

export function getDefaultProApiBaseUrl() {
  const globals = globalThis as AcaciaGlobals;
  const nativeConfig = NativeModules.AcaciaConfig as
    | NativeAcaciaConfig
    | undefined;
  const configured =
    globals.__ACACIA_PRO_API_BASE_URL__ ?? nativeConfig?.proApiBaseURL ?? '';

  return configured.trim() || undefined;
}

function getNativeFirebaseAuthTokenProvider():
  | ProAuthTokenProvider
  | undefined {
  const nativeAuth = NativeModules.AcaciaAuth as NativeAcaciaAuth | undefined;
  const getFirebaseIDToken = nativeAuth?.getFirebaseIDToken;
  if (typeof getFirebaseIDToken !== 'function') {
    return undefined;
  }

  return {
    getIDToken: () => getFirebaseIDToken(),
  };
}
