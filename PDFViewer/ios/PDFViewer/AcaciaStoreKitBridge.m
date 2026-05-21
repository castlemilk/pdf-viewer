#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)

RCT_EXTERN_METHOD(purchasePro:(NSString *)productId
                  appAccountToken:(NSString *)appAccountToken
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
