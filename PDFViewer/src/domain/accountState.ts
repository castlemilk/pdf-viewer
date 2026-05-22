export type LocalProUnlockContext = {
  isJestRuntime: boolean;
  isScreenshotLaunch: boolean;
  isUiTestingLaunch: boolean;
  isProPurchaseTestingLaunch: boolean;
};

export function shouldAllowLocalProUnlock(context: LocalProUnlockContext): boolean {
  if (context.isProPurchaseTestingLaunch) {
    return false;
  }

  return (
    context.isJestRuntime ||
    context.isScreenshotLaunch ||
    context.isUiTestingLaunch
  );
}
