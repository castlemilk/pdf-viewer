import {NativeModules} from 'react-native';
import {AcaciaAuthBridge} from '../native/AcaciaAuthBridge';
import {StoreKitBridge} from '../native/StoreKitBridge';
import {
  createProAccountSynchronizer,
  type ProAccountSynchronizer,
} from './proAccountSynchronizer';
import {
  createProAccountDeletionCoordinator,
  type ProAccountDeletionCoordinator,
} from './proAccountDeletionCoordinator';
import {ProBackendClient} from './proBackendClient';
import {
  createProCloudSynchronizer,
  type ProCloudSynchronizer,
} from './proCloudSynchronizer';
import {
  createProPurchaseCoordinator,
  type ProAuthTokenProvider,
  type ProPurchaseCoordinator,
} from './proPurchaseCoordinator';

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

export function createDefaultProAccountDeletionCoordinator(): ProAccountDeletionCoordinator {
  const baseUrl = getDefaultProApiBaseUrl();

  return createProAccountDeletionCoordinator({
    authTokenProvider: getNativeFirebaseAuthTokenProvider(),
    backendClient: baseUrl ? new ProBackendClient({baseUrl}) : undefined,
    appleAuthorizationCodeProvider:
      typeof AcaciaAuthBridge.requestAppleAuthorizationCode === 'function'
        ? AcaciaAuthBridge
        : undefined,
    nativeAccountDeleter:
      typeof AcaciaAuthBridge.deleteFirebaseAccount === 'function'
        ? AcaciaAuthBridge
        : undefined,
  });
}

export function createDefaultProCloudSynchronizer(): ProCloudSynchronizer {
  const baseUrl = getDefaultProApiBaseUrl();

  return createProCloudSynchronizer({
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
  if (typeof AcaciaAuthBridge.getFirebaseIDToken !== 'function') {
    return undefined;
  }

  return {
    getIDToken: () => AcaciaAuthBridge.getFirebaseIDToken(),
  };
}
