#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"PDFViewer";
  NSString *screenshotMode =
      [[NSProcessInfo processInfo].environment objectForKey:@"PDFVIEWER_SCREENSHOT_MODE"];
  for (NSString *argument in [NSProcessInfo processInfo].arguments) {
    if ([argument hasPrefix:@"--screenshot="]) {
      screenshotMode = [argument substringFromIndex:[@"--screenshot=" length]];
      break;
    }
  }

  NSMutableDictionary *initialProps = [NSMutableDictionary new];
  if (screenshotMode.length > 0) {
    initialProps[@"screenshotMode"] = screenshotMode;
  }
  self.initialProps = initialProps;
  self.dependencyProvider = [RCTAppDependencyProvider new];
  
  return [super applicationDidFinishLaunching:notification];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  BOOL isUITesting =
      [[[NSProcessInfo processInfo].environment objectForKey:@"PDFVIEWER_UITESTING"] isEqualToString:@"1"] ||
      [[NSProcessInfo processInfo].arguments containsObject:@"--uitesting"];
  if (isUITesting) {
    NSURL *bundledURL = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
    if (bundledURL != nil) {
      return bundledURL;
    }
  }
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
