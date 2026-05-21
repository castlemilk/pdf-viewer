export type LocalProUnlockContext = {
  isJestRuntime: boolean;
  isScreenshotLaunch: boolean;
};

export function shouldAllowLocalProUnlock(context: LocalProUnlockContext): boolean {
  return context.isJestRuntime || context.isScreenshotLaunch;
}
