#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)

RCT_EXTERN_METHOD(purchasePro:(NSString *)productId
                  appAccountToken:(NSString *)appAccountToken
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restorePro:(NSArray *)productIds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
