import {NativeModules, Platform} from 'react-native';
import type {
  ProStoreKitPurchaseInput,
  ProStoreKitPurchaseResult,
} from '../pro/proPurchaseCoordinator';

type NativeStoreKitBridge = {
  purchasePro?: (
    productId: string,
    appAccountToken: string,
  ) => Promise<ProStoreKitPurchaseResult>;
};

function getNativeBridge() {
  return NativeModules.AcaciaStoreKit as NativeStoreKitBridge | undefined;
}

export const StoreKitBridge = {
  isAvailable() {
    const nativeBridge = getNativeBridge();
    return (
      (Platform.OS === 'ios' || Platform.OS === 'macos') &&
      typeof nativeBridge?.purchasePro === 'function'
    );
  },

  async purchasePro({
    productId,
    appAccountToken,
  }: ProStoreKitPurchaseInput): Promise<ProStoreKitPurchaseResult> {
    const nativeBridge = getNativeBridge();
    if (!nativeBridge?.purchasePro) {
      throw new Error('AcaciaStoreKit native module is not available');
    }

    return nativeBridge.purchasePro(productId, appAccountToken);
  },
};
