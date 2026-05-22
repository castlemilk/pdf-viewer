#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AcaciaAuth, NSObject)

RCT_EXTERN_METHOD(getFirebaseIDToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

