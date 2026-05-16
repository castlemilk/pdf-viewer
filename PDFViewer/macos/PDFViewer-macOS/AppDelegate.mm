#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *const AcaciaPDFMenuOpenURLNotification = @"AcaciaPDFMenuOpenURLNotification";

@interface RCTAppDelegate (AcaciaWindowLoading)
- (void)loadReactNativeWindow:(NSDictionary *)launchOptions;
@end

@interface AppDelegate ()
- (void)ensureMainWindowVisibleWithLaunchOptions:(NSDictionary *)launchOptions;
- (void)wireFileMenuActions;
- (BOOL)openPDFURLFromMenu:(NSURL *)url;
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
  [self wireFileMenuActions];
  [self ensureMainWindowVisibleWithLaunchOptions:[notification userInfo]];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag
{
  [self ensureMainWindowVisibleWithLaunchOptions:@{}];
  return YES;
}

- (IBAction)openDocument:(id)sender
{
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"pdf"]];
  panel.allowsMultipleSelection = NO;
  panel.canChooseDirectories = NO;
  panel.canChooseFiles = YES;
  panel.message = @"Choose a PDF to add to Acacia";

  if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
    return;
  }

  [self openPDFURLFromMenu:panel.URL];
}

- (BOOL)application:(NSApplication *)application openFile:(NSString *)filename
{
  return [self openPDFURLFromMenu:[NSURL fileURLWithPath:filename]];
}

- (void)application:(NSApplication *)application openFiles:(NSArray<NSString *> *)filenames
{
  BOOL openedAnyFile = NO;

  for (NSString *filename in filenames) {
    openedAnyFile = [self openPDFURLFromMenu:[NSURL fileURLWithPath:filename]] || openedAnyFile;
  }

  [application replyToOpenOrPrint:openedAnyFile
    ? NSApplicationDelegateReplySuccess
    : NSApplicationDelegateReplyFailure];
}

- (void)wireFileMenuActions
{
  NSMenuItem *fileMenuItem = [NSApp.mainMenu itemWithTitle:@"File"];
  NSMenu *fileMenu = fileMenuItem.submenu;

  for (NSMenuItem *item in fileMenu.itemArray) {
    if (item.action == @selector(openDocument:)) {
      item.target = self;
    }
  }
}

- (BOOL)openPDFURLFromMenu:(NSURL *)url
{
  if (url == nil || ![url.pathExtension.lowercaseString isEqualToString:@"pdf"]) {
    return NO;
  }

  [self ensureMainWindowVisibleWithLaunchOptions:@{}];
  [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:url];
  [[NSNotificationCenter defaultCenter] postNotificationName:AcaciaPDFMenuOpenURLNotification
                                                      object:self
                                                    userInfo:@{@"url": url}];
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
  BOOL isUITesting =
      [[[NSProcessInfo processInfo].environment objectForKey:@"PDFVIEWER_UITESTING"] isEqualToString:@"1"];

  if (isUITesting) {
    CGFloat width = MIN(MAX(NSWidth(visibleFrame) - 520, 960), 1320);
    CGFloat height = MIN(MAX(NSHeight(visibleFrame) - 128, 680), 860);
    CGFloat x = MIN(NSMinX(visibleFrame) + 420, NSMaxX(visibleFrame) - width - 24);
    CGFloat y = NSMidY(visibleFrame) - height / 2;
    NSRect testFrame = NSMakeRect(MAX(NSMinX(visibleFrame) + 24, x),
                                  MAX(NSMinY(visibleFrame) + 24, y),
                                  width,
                                  height);
    [self.window setFrame:testFrame display:YES];
  } else if (frameTooSmall || frameOffscreen) {
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
