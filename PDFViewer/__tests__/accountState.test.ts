import {shouldAllowLocalProUnlock} from '../src/domain/accountState';

test('allows local pro unlock only for controlled validation contexts', () => {
  expect(
    shouldAllowLocalProUnlock({
      isJestRuntime: true,
      isScreenshotLaunch: false,
    }),
  ).toBe(true);

  expect(
    shouldAllowLocalProUnlock({
      isJestRuntime: false,
      isScreenshotLaunch: true,
    }),
  ).toBe(true);

  expect(
    shouldAllowLocalProUnlock({
      isJestRuntime: false,
      isScreenshotLaunch: false,
    }),
  ).toBe(false);
});
