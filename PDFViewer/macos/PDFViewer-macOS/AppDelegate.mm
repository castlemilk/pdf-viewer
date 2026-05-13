#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface RCTAppDelegate (AcaciaWindowLoading)
- (void)loadReactNativeWindow:(NSDictionary *)launchOptions;
@end

@interface AppDelegate ()
- (void)ensureMainWindowVisibleWithLaunchOptions:(NSDictionary *)launchOptions;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"Acacia";
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
  self.automaticallyLoadReactNativeWindow = YES;
  
  [super applicationDidFinishLaunching:notification];
  [self ensureMainWindowVisibleWithLaunchOptions:[notification userInfo]];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag
{
  [self ensureMainWindowVisibleWithLaunchOptions:@{}];
  return YES;
}

- (void)ensureMainWindowVisibleWithLaunchOptions:(NSDictionary *)launchOptions
{
  if (self.window == nil) {
    [self loadReactNativeWindow:launchOptions ?: @{}];
  }

  NSRect visibleFrame = NSScreen.mainScreen.visibleFrame;
  if (NSIsEmptyRect(visibleFrame)) {
    visibleFrame = NSMakeRect(0, 0, 1440, 900);
  }

  NSRect frame = self.window.frame;
  BOOL frameTooSmall = NSWidth(frame) < 640 || NSHeight(frame) < 480;
  BOOL frameOffscreen = NSIsEmptyRect(NSIntersectionRect(frame, visibleFrame));
  if (frameTooSmall || frameOffscreen) {
    CGFloat width = MIN(MAX(NSWidth(visibleFrame) - 96, 960), 1320);
    CGFloat height = MIN(MAX(NSHeight(visibleFrame) - 96, 680), 860);
    NSRect defaultFrame = NSMakeRect(NSMidX(visibleFrame) - width / 2,
                                     NSMidY(visibleFrame) - height / 2,
                                     width,
                                     height);
    [self.window setFrame:defaultFrame display:YES];
  }

  self.window.title = @"Acacia";
  [self.window setFrameAutosaveName:@"AcaciaMainWindow"];
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
  NSURL *bundledURL = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#if DEBUG
  BOOL useMetro =
      [[[NSProcessInfo processInfo].environment objectForKey:@"ACACIA_USE_METRO"] isEqualToString:@"1"] ||
      [[NSProcessInfo processInfo].arguments containsObject:@"--metro"];
  if (!useMetro && bundledURL != nil) {
    return bundledURL;
  }
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return bundledURL;
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
