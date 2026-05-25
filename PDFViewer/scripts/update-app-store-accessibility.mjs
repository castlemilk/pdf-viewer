#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createPrivateKey, sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ASC_API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FEATURE_FIELDS = [
  'supportsAudioDescriptions',
  'supportsCaptions',
  'supportsDarkInterface',
  'supportsDifferentiateWithoutColorAlone',
  'supportsLargerText',
  'supportsReducedMotion',
  'supportsSufficientContrast',
  'supportsVoiceControl',
  'supportsVoiceover',
];

const FEATURE_ENV_KEYS = {
  supportsAudioDescriptions: 'APP_STORE_ACCESSIBILITY_SUPPORTS_AUDIO_DESCRIPTIONS',
  supportsCaptions: 'APP_STORE_ACCESSIBILITY_SUPPORTS_CAPTIONS',
  supportsDarkInterface: 'APP_STORE_ACCESSIBILITY_SUPPORTS_DARK_INTERFACE',
  supportsDifferentiateWithoutColorAlone:
    'APP_STORE_ACCESSIBILITY_SUPPORTS_DIFFERENTIATE_WITHOUT_COLOR_ALONE',
  supportsLargerText: 'APP_STORE_ACCESSIBILITY_SUPPORTS_LARGER_TEXT',
  supportsReducedMotion: 'APP_STORE_ACCESSIBILITY_SUPPORTS_REDUCED_MOTION',
  supportsSufficientContrast: 'APP_STORE_ACCESSIBILITY_SUPPORTS_SUFFICIENT_CONTRAST',
  supportsVoiceControl: 'APP_STORE_ACCESSIBILITY_SUPPORTS_VOICE_CONTROL',
  supportsVoiceover: 'APP_STORE_ACCESSIBILITY_SUPPORTS_VOICEOVER',
};

const FEATURE_FLAG_NAMES = {
  supportsAudioDescriptions: 'audio-descriptions',
  supportsCaptions: 'captions',
  supportsDarkInterface: 'dark-interface',
  supportsDifferentiateWithoutColorAlone: 'differentiate-without-color-alone',
  supportsLargerText: 'larger-text',
  supportsReducedMotion: 'reduced-motion',
  supportsSufficientContrast: 'sufficient-contrast',
  supportsVoiceControl: 'voice-control',
  supportsVoiceover: 'voiceover',
};

const VALID_DEVICE_FAMILIES = new Set(['IPHONE', 'IPAD', 'APPLE_TV', 'APPLE_WATCH', 'MAC', 'VISION']);

const UNSUPPORTED_FEATURES_BY_DEVICE_FAMILY = {
  APPLE_TV: new Set(['supportsLargerText', 'supportsVoiceControl']),
  APPLE_WATCH: new Set(['supportsVoiceControl']),
  MAC: new Set(['supportsLargerText']),
};

function parseArgs(argv) {
  const parsed = {
    accessibilityUrl:
      process.env.APP_STORE_ACCESSIBILITY_URL ?? 'https://acacia-eta.vercel.app/accessibility.html',
    deviceFamilies: parseList(process.env.APP_STORE_ACCESSIBILITY_DEVICE_FAMILIES, ['MAC', 'IPHONE', 'IPAD']),
    publish: process.env.APP_STORE_ACCESSIBILITY_PUBLISH !== '0',
    dryRun: false,
    status: false,
    features: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--accessibility-url':
        parsed.accessibilityUrl = argv[++index];
        break;
      case '--device-family':
      case '--device-families':
        parsed.deviceFamilies = parseList(argv[++index], []);
        break;
      case '--publish':
        parsed.publish = true;
        break;
      case '--draft':
      case '--no-publish':
        parsed.publish = false;
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--status':
        parsed.status = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--no-')) {
          const feature = findFeatureByFlagName(arg.slice(5));
          if (feature) {
            parsed.features[feature] = false;
            break;
          }
        }
        if (arg.startsWith('--')) {
          const feature = findFeatureByFlagName(arg.slice(2));
          if (feature) {
            parsed.features[feature] = true;
            break;
          }
        }
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  parsed.deviceFamilies = parsed.deviceFamilies.map(normalizeDeviceFamily);
  return parsed;
}

function printHelp() {
  console.log(
    [
      'Usage: scripts/update-app-store-accessibility.sh [options]',
      '',
      'Options:',
      '  --accessibility-url URL        Set the App Store accessibility URL',
      '  --device-families LIST         Comma-separated device families, default MAC,IPHONE,IPAD',
      '  --publish                     Publish declarations after updating them (default)',
      '  --draft, --no-publish         Leave declarations as drafts',
      '  --dry-run                     Show planned API changes without sending writes',
      '  --status                      Read the current accessibility URL and declarations',
      '  --no-captions                 Override one supported feature to false',
      '  --no-audio-descriptions       Override one supported feature to false',
    ].join('\n'),
  );
}

function parseList(value, fallback) {
  if (!value) {
    return [...fallback];
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeDeviceFamily(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/-/g, '_');
  const aliases = {
    IOS: 'IPHONE',
    IPHONEOS: 'IPHONE',
    MACOS: 'MAC',
    MAC_OS: 'MAC',
    TVOS: 'APPLE_TV',
    WATCHOS: 'APPLE_WATCH',
    VISIONOS: 'VISION',
  };
  const deviceFamily = aliases[normalized] ?? normalized;
  if (!VALID_DEVICE_FAMILIES.has(deviceFamily)) {
    throw new Error(`Unsupported device family: ${value}`);
  }
  return deviceFamily;
}

function findFeatureByFlagName(flagName) {
  return Object.entries(FEATURE_FLAG_NAMES).find(([, name]) => name === flagName)?.[0];
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Expected boolean-like value, received: ${value}`);
}

function buildFeatureAttributes(cliFeatures) {
  return Object.fromEntries(
    FEATURE_FIELDS.map(field => [
      field,
      cliFeatures[field] ?? parseBoolean(readEnv(FEATURE_ENV_KEYS[field]), true),
    ]),
  );
}

function featuresForDeviceFamily(features, deviceFamily) {
  const unsupported = UNSUPPORTED_FEATURES_BY_DEVICE_FAMILY[deviceFamily] ?? new Set();
  return Object.fromEntries(Object.entries(features).filter(([field]) => !unsupported.has(field)));
}

function normalizePrivateKey(value) {
  const unescaped = value.trim().replace(/\\n/g, '\n');
  if (unescaped.includes('BEGIN PRIVATE KEY')) {
    return unescaped;
  }

  const body = unescaped.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

function readPrivateKey() {
  const inlineKey =
    readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY') ??
    readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY_P8');
  if (inlineKey) {
    return normalizePrivateKey(inlineKey);
  }

  const privateKeyPath = readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY_PATH');
  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
    throw new Error('APP_STORE_CONNECT_API_PRIVATE_KEY or APP_STORE_CONNECT_API_PRIVATE_KEY_PATH is required.');
  }

  return normalizePrivateKey(fs.readFileSync(privateKeyPath, 'utf8'));
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildJwt({issuerId, keyId, privateKey}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {alg: 'ES256', kid: keyId, typ: 'JWT'};
  const payload = {iss: issuerId, aud: 'appstoreconnect-v1', exp: nowSeconds + 60 * 15};
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function buildQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function summarizeApiError(json, fallback) {
  const details = json?.errors
    ?.map(error => [error.code, error.title, error.detail].filter(Boolean).join(': '))
    .filter(Boolean);
  return details?.length ? details.join('; ') : fallback;
}

function createAscClient(token) {
  async function request(method, pathname, {query, body} = {}) {
    const response = await fetch(`${ASC_API_BASE_URL}${pathname}${buildQueryString(query)}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? {'Content-Type': 'application/json'} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    if (!response.ok) {
      throw new Error(
        `App Store Connect API ${method} ${pathname} failed: ${summarizeApiError(
          json,
          `${response.status} ${text}`,
        )}`,
      );
    }
    return json;
  }

  return {
    get(pathname, query) {
      return request('GET', pathname, {query});
    },
    post(pathname, body) {
      return request('POST', pathname, {body});
    },
    patch(pathname, body) {
      return request('PATCH', pathname, {body});
    },
  };
}

function createDeclarationPayload({appId, deviceFamily, features}) {
  return {
    data: {
      type: 'accessibilityDeclarations',
      attributes: {
        deviceFamily,
        ...features,
      },
      relationships: {
        app: {
          data: {
            type: 'apps',
            id: appId,
          },
        },
      },
    },
  };
}

function updateDeclarationPayload({declarationId, features, publish}) {
  return {
    data: {
      type: 'accessibilityDeclarations',
      id: declarationId,
      attributes: {
        ...features,
        ...(publish ? {publish: true} : {}),
      },
    },
  };
}

function isPublishBlockedError(error) {
  return /CANNOT_PUBLISH|must be available on the App Store/i.test(String(error?.message ?? error));
}

async function patchDeclarationWithPublishFallback({client, declarationId, features, publish}) {
  try {
    return {
      response: await client.patch(
        `/accessibilityDeclarations/${declarationId}`,
        updateDeclarationPayload({declarationId, features, publish}),
      ),
      publishBlocked: false,
    };
  } catch (error) {
    if (!publish || !isPublishBlockedError(error)) {
      throw error;
    }

    return {
      response: await client.patch(
        `/accessibilityDeclarations/${declarationId}`,
        updateDeclarationPayload({declarationId, features, publish: false}),
      ),
      publishBlocked: true,
    };
  }
}

function appAccessibilityUrlPayload({appId, accessibilityUrl}) {
  return {
    data: {
      type: 'apps',
      id: appId,
      attributes: {
        accessibilityUrl,
      },
    },
  };
}

function findBestDeclaration(declarations, deviceFamily) {
  const matches = declarations.filter(item => item.attributes?.deviceFamily === deviceFamily);
  return (
    matches.find(item => item.attributes?.state === 'DRAFT') ??
    matches.find(item => item.attributes?.state === 'PUBLISHED') ??
    matches.find(item => item.attributes?.state !== 'REPLACED') ??
    matches[0]
  );
}

function summarizeDeclaration(item) {
  const attributes = item.attributes ?? {};
  return {
    id: item.id,
    deviceFamily: attributes.deviceFamily,
    state: attributes.state,
    ...Object.fromEntries(
      FEATURE_FIELDS.filter(field => field in attributes).map(field => [field, attributes[field]]),
    ),
  };
}

async function upsertDeclaration({client, config, deviceFamily, features}) {
  const deviceFeatures = featuresForDeviceFamily(features, deviceFamily);
  const existing = findBestDeclaration(config.existingDeclarations, deviceFamily);
  if (!existing) {
    const createPayload = createDeclarationPayload({
      appId: config.appId,
      deviceFamily,
      features: deviceFeatures,
    });
    if (config.dryRun) {
      console.log(`[dry-run] create ${deviceFamily} accessibility declaration`);
      console.log(JSON.stringify(createPayload, null, 2));
      return {deviceFamily, id: undefined, state: 'DRY_RUN_CREATE'};
    }

    const created = await client.post('/accessibilityDeclarations', createPayload);
    const declarationId = created.data.id;
    let published;
    if (config.publish) {
      published = await patchDeclarationWithPublishFallback({
        client,
        declarationId,
        features: deviceFeatures,
        publish: true,
      });
    }
    return {
      deviceFamily,
      id: declarationId,
      state: published?.publishBlocked
        ? 'DRAFT_PUBLISH_BLOCKED'
        : published?.response.data.attributes?.state ?? created.data.attributes?.state,
    };
  }

  const updatePayload = updateDeclarationPayload({
    declarationId: existing.id,
    features: deviceFeatures,
    publish: config.publish,
  });
  if (config.dryRun) {
    console.log(
      `[dry-run] update ${deviceFamily} accessibility declaration ${existing.id} (${existing.attributes?.state})`,
    );
    console.log(JSON.stringify(updatePayload, null, 2));
    return {deviceFamily, id: existing.id, state: 'DRY_RUN_UPDATE'};
  }

  const updated = await patchDeclarationWithPublishFallback({
    client,
    declarationId: existing.id,
    features: deviceFeatures,
    publish: config.publish,
  });
  return {
    deviceFamily,
    id: updated.response.data.id,
    state: updated.publishBlocked ? 'DRAFT_PUBLISH_BLOCKED' : updated.response.data.attributes?.state,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = {
    appId: readEnv('APP_STORE_CONNECT_APP_ID'),
    keyId: readEnv('APP_STORE_CONNECT_API_KEY_ID'),
    issuerId: readEnv('APP_STORE_CONNECT_API_ISSUER_ID'),
    privateKey: args.dryRun ? undefined : readPrivateKey(),
    accessibilityUrl: args.accessibilityUrl,
    deviceFamilies: [...new Set(args.deviceFamilies)],
    publish: args.publish,
    dryRun: args.dryRun,
    status: args.status,
  };

  if (!config.appId || !config.keyId || !config.issuerId) {
    throw new Error(
      'APP_STORE_CONNECT_APP_ID, APP_STORE_CONNECT_API_KEY_ID, and APP_STORE_CONNECT_API_ISSUER_ID are required.',
    );
  }

  const features = buildFeatureAttributes(args.features);

  if (config.dryRun) {
    console.log(`[dry-run] app ${config.appId} accessibility URL: ${config.accessibilityUrl}`);
    console.log(`[dry-run] device families: ${config.deviceFamilies.join(', ')}`);
    console.log(`[dry-run] publish declarations: ${config.publish ? 'yes' : 'no'}`);
    for (const deviceFamily of config.deviceFamilies) {
      console.log(
        `[dry-run] ${deviceFamily} feature support: ${JSON.stringify(
          featuresForDeviceFamily(features, deviceFamily),
        )}`,
      );
    }
    return;
  }

  const client = createAscClient(buildJwt(config));

  if (config.status) {
    const app = await client.get(`/apps/${config.appId}`, {
      'fields[apps]': 'accessibilityUrl',
    });
    const declarations = await client.get(`/apps/${config.appId}/accessibilityDeclarations`, {
      limit: 200,
      'fields[accessibilityDeclarations]': [
        'deviceFamily',
        'state',
        ...FEATURE_FIELDS,
      ].join(','),
    });
    console.log(
      JSON.stringify(
        {
          appId: config.appId,
          accessibilityUrl: app.data.attributes?.accessibilityUrl ?? null,
          declarations: (declarations.data ?? []).map(summarizeDeclaration),
        },
        null,
        2,
      ),
    );
    return;
  }

  await client.patch(`/apps/${config.appId}`, appAccessibilityUrlPayload(config));
  const declarationsResponse = await client.get(`/apps/${config.appId}/accessibilityDeclarations`, {
    limit: 200,
    'fields[accessibilityDeclarations]': [
      'deviceFamily',
      'state',
      ...FEATURE_FIELDS,
    ].join(','),
  });
  config.existingDeclarations = declarationsResponse.data ?? [];

  const results = [];
  for (const deviceFamily of config.deviceFamilies) {
    results.push(await upsertDeclaration({client, config, deviceFamily, features}));
  }

  console.log(`Updated accessibility URL for app ${config.appId}: ${config.accessibilityUrl}`);
  for (const result of results) {
    console.log(
      `Updated ${result.deviceFamily} accessibility declaration${result.id ? ` ${result.id}` : ''}: ${
        result.state ?? 'updated'
      }`,
    );
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
