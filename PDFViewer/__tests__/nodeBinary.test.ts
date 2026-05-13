declare const __dirname: string;
export {};
declare const process: {
  env: {
    HOME?: string;
  };
};
const {existsSync} = require('fs');
const {spawnSync} = require('child_process');
const path = require('path');

describe('Xcode Node resolution', () => {
  const appRoot = path.join(__dirname, '..');
  const cleanEnv = {
    HOME: process.env.HOME ?? '',
    PATH: '/usr/bin:/bin',
  };

  it('resolves Node when Xcode does not inherit the interactive shell PATH', () => {
    const script = path.join(appRoot, 'scripts', 'resolve-node-binary.sh');
    const result = spawnSync('/bin/bash', [script], {
      encoding: 'utf8',
      env: cleanEnv,
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const nodePath = result.stdout.trim();
    expect(nodePath).toMatch(/\/node$/);
    expect(existsSync(nodePath)).toBe(true);
  });

  it.each(['ios', 'macos'])(
    'sets NODE_BINARY from %s/.xcode.env in a stripped Xcode environment',
    platform => {
      const srcRoot = path.join(appRoot, platform);
      const envFile = path.join(srcRoot, '.xcode.env');
      const result = spawnSync(
        '/bin/bash',
        ['-lc', `source "${envFile}"; printf '%s\\n' "$NODE_BINARY"; test -x "$NODE_BINARY"`],
        {
          encoding: 'utf8',
          env: {
            ...cleanEnv,
            SRCROOT: srcRoot,
          },
        },
      );

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/\/node$/);
    },
  );

  it('sets NODE_BINARY from macos/.xcode.env when sourced by a Pods script phase', () => {
    const macosRoot = path.join(appRoot, 'macos');
    const podsRoot = path.join(macosRoot, 'Pods');
    const envFile = path.join(macosRoot, '.xcode.env');
    const result = spawnSync(
      '/bin/bash',
      ['-lc', `source "${envFile}"; printf '%s\\n' "$NODE_BINARY"; test -x "$NODE_BINARY"`],
      {
        encoding: 'utf8',
        env: {
          ...cleanEnv,
          PODS_ROOT: podsRoot,
          SRCROOT: podsRoot,
        },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/\/node$/);
  });
});
