#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createPrivateKey, sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ASC_API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCREENSHOT_DISPLAY_TYPES = new Set([
  'APP_IPHONE_67',
  'APP_IPHONE_61',
  'APP_IPHONE_65',
  'APP_IPHONE_58',
  'APP_IPHONE_55',
  'APP_IPHONE_47',
  'APP_IPHONE_40',
  'APP_IPHONE_35',
  'APP_IPAD_PRO_3GEN_129',
  'APP_IPAD_PRO_3GEN_11',
  'APP_IPAD_PRO_129',
  'APP_IPAD_105',
  'APP_IPAD_97',
  'APP_DESKTOP',
  'APP_WATCH_ULTRA',
  'APP_WATCH_SERIES_10',
  'APP_WATCH_SERIES_7',
  'APP_WATCH_SERIES_4',
  'APP_WATCH_SERIES_3',
  'APP_APPLE_TV',
  'APP_APPLE_VISION_PRO',
]);

function parseArgs(argv) {
  const parsed = {
    platform: process.env.APP_STORE_PLATFORM || 'MAC_OS',
    locale: process.env.APP_STORE_SCREENSHOTS_LOCALE || undefined,
    displayType: process.env.APP_STORE_SCREENSHOTS_DISPLAY_TYPE || 'APP_DESKTOP',
    screenshotsDir:
      process.env.APP_STORE_SCREENSHOTS_DIR ||
      path.join(rootDir, 'publishing', 'screenshots', 'app-store'),
    replace: process.env.APP_STORE_SCREENSHOTS_APPEND !== '1',
    createLocalization: process.env.APP_STORE_SCREENSHOTS_CREATE_LOCALIZATION === '1',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--version':
        parsed.version = argv[++index];
        break;
      case '--platform':
        parsed.platform = argv[++index];
        break;
      case '--locale':
        parsed.locale = argv[++index];
        break;
      case '--create-localization':
        parsed.createLocalization = true;
        break;
      case '--display-type':
        parsed.displayType = argv[++index];
        break;
      case '--screenshots-dir':
        parsed.screenshotsDir = argv[++index];
        break;
      case '--append':
      case '--no-replace':
        parsed.replace = false;
        break;
      case '--replace':
        parsed.replace = true;
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log(
          'Usage: scripts/upload-app-store-screenshots.sh [--version VERSION] [--platform MAC_OS|IOS] [--locale LOCALE] [--create-localization] [--display-type APP_DESKTOP] [--screenshots-dir DIR] [--append] [--dry-run]',
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePlatform(value) {
  const platform = String(value || 'MAC_OS').trim().toUpperCase();
  if (platform === 'MAC' || platform === 'MACOS') {
    return 'MAC_OS';
  }
  if (platform === 'IPHONE' || platform === 'IPHONEOS') {
    return 'IOS';
  }
  if (platform !== 'MAC_OS' && platform !== 'IOS') {
    throw new Error(`Unsupported App Store platform: ${value}`);
  }
  return platform;
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
    delete(pathname) {
      return request('DELETE', pathname);
    },
  };
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function collectScreenshots(screenshotsDir) {
  if (!fs.existsSync(screenshotsDir)) {
    throw new Error(`Screenshots folder does not exist: ${screenshotsDir}`);
  }

  const files = fs
    .readdirSync(screenshotsDir)
    .filter(fileName => /\.(png|jpe?g)$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map(fileName => path.join(screenshotsDir, fileName));

  if (files.length < 1 || files.length > 10) {
    throw new Error(`App Store screenshot upload requires 1 to 10 images; found ${files.length}.`);
  }

  return files.map(filePath => {
    const stats = fs.statSync(filePath);
    const dimensions = readPngDimensions(filePath);
    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      width: dimensions?.width,
      height: dimensions?.height,
    };
  });
}

function createLocalizationPayload({versionId, locale}) {
  return {
    data: {
      type: 'appStoreVersionLocalizations',
      attributes: {locale},
      relationships: {
        appStoreVersion: {data: {type: 'appStoreVersions', id: versionId}},
      },
    },
  };
}

function createScreenshotSetPayload({localizationId, displayType}) {
  return {
    data: {
      type: 'appScreenshotSets',
      attributes: {screenshotDisplayType: displayType},
      relationships: {
        appStoreVersionLocalization: {
          data: {type: 'appStoreVersionLocalizations', id: localizationId},
        },
      },
    },
  };
}

function createScreenshotPayload({screenshotSetId, fileName, fileSize}) {
  return {
    data: {
      type: 'appScreenshots',
      attributes: {fileName, fileSize},
      relationships: {
        appScreenshotSet: {data: {type: 'appScreenshotSets', id: screenshotSetId}},
      },
    },
  };
}

function markScreenshotUploadedPayload({screenshotId}) {
  return {
    data: {
      type: 'appScreenshots',
      id: screenshotId,
      attributes: {uploaded: true},
    },
  };
}

function screenshotOrderPayload(screenshotIds) {
  return {
    data: screenshotIds.map(id => ({type: 'appScreenshots', id})),
  };
}

async function getAppStoreVersion({client, appId, version, platform}) {
  const response = await client.get(`/apps/${appId}/appStoreVersions`, {
    'filter[versionString]': version,
    'filter[platform]': platform,
    'fields[appStoreVersions]': 'versionString,platform,appStoreState',
    limit: 10,
  });
  const match = response?.data?.find(
    item =>
      item.attributes?.versionString === version && item.attributes?.platform === platform,
  );
  if (!match) {
    throw new Error(`No ${platform} App Store version row found for ${version}.`);
  }
  return match;
}

async function getOrCreateLocalization({client, versionId, locale, createLocalization}) {
  const response = await client.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
    'fields[appStoreVersionLocalizations]': 'locale',
    limit: 200,
  });
  const localizations = response?.data || [];
  const existing = localizations.find(item => item.attributes?.locale === locale);
  if (existing) {
    return {localization: existing, created: false};
  }

  if (!locale && localizations[0]) {
    return {localization: localizations[0], created: false};
  }

  const availableLocales = localizations
    .map(item => item.attributes?.locale)
    .filter(Boolean)
    .join(', ');
  if (!createLocalization) {
    throw new Error(
      locale
        ? `No App Store localization found for ${locale}. Available locales: ${availableLocales || 'none'}.`
        : 'No App Store localization exists. Pass --create-localization with --locale to create one.',
    );
  }
  if (!locale) {
    throw new Error('--create-localization requires --locale.');
  }

  const created = await client.post(
    '/appStoreVersionLocalizations',
    createLocalizationPayload({versionId, locale}),
  );
  return {localization: created.data, created: true};
}

async function getOrCreateScreenshotSet({client, localizationId, displayType}) {
  const response = await client.get(`/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`, {
    'filter[screenshotDisplayType]': displayType,
    'fields[appScreenshotSets]': 'screenshotDisplayType',
    limit: 50,
  });
  const existing = response?.data?.find(
    item => item.attributes?.screenshotDisplayType === displayType,
  );
  if (existing) {
    return {screenshotSet: existing, created: false};
  }

  const created = await client.post(
    '/appScreenshotSets',
    createScreenshotSetPayload({localizationId, displayType}),
  );
  return {screenshotSet: created.data, created: true};
}

async function listScreenshots({client, screenshotSetId}) {
  const response = await client.get(`/appScreenshotSets/${screenshotSetId}/appScreenshots`, {
    'fields[appScreenshots]': 'fileName,fileSize,assetDeliveryState',
    limit: 50,
  });
  return response?.data || [];
}

function headersFromUploadOperation(operation) {
  const headers = {};
  const operationHeaders = operation.requestHeaders || operation.headers || [];
  for (const header of operationHeaders) {
    if (header.name && header.value !== undefined) {
      headers[header.name] = header.value;
    }
  }
  return headers;
}

async function uploadFileWithOperations({uploadOperations, filePath}) {
  const fileBuffer = fs.readFileSync(filePath);
  for (const operation of uploadOperations) {
    const offset = Number(operation.offset || 0);
    const length = Number(operation.length || fileBuffer.length - offset);
    const chunk = fileBuffer.subarray(offset, offset + length);
    const response = await fetch(operation.url, {
      method: operation.method || 'PUT',
      headers: headersFromUploadOperation(operation),
      body: chunk,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Screenshot asset upload failed for ${path.basename(filePath)}: ${response.status} ${text}`,
      );
    }
  }
}

async function uploadScreenshot({client, screenshotSetId, screenshot}) {
  const created = await client.post(
    '/appScreenshots',
    createScreenshotPayload({
      screenshotSetId,
      fileName: screenshot.fileName,
      fileSize: screenshot.fileSize,
    }),
  );
  const screenshotId = created.data?.id;
  const uploadOperations = created.data?.attributes?.uploadOperations || [];
  if (!screenshotId || !uploadOperations.length) {
    throw new Error(`App Store Connect did not return upload operations for ${screenshot.fileName}.`);
  }

  await uploadFileWithOperations({uploadOperations, filePath: screenshot.filePath});
  await client.patch(
    `/appScreenshots/${screenshotId}`,
    markScreenshotUploadedPayload({screenshotId}),
  );
  return screenshotId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = {
    appId: readEnv('APP_STORE_CONNECT_APP_ID'),
    keyId: readEnv('APP_STORE_CONNECT_API_KEY_ID'),
    issuerId: readEnv('APP_STORE_CONNECT_API_ISSUER_ID'),
    privateKey: readPrivateKey(),
    version:
      args.version ||
      readEnv('APP_STORE_VERSION') ||
      JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version,
    platform: normalizePlatform(args.platform),
    locale: args.locale,
    displayType: args.displayType,
    screenshotsDir: path.resolve(args.screenshotsDir),
    replace: args.replace,
    createLocalization: args.createLocalization,
    dryRun: args.dryRun,
  };

  if (!config.appId || !config.keyId || !config.issuerId) {
    throw new Error('App Store Connect app id and API credentials are required.');
  }
  if (!SCREENSHOT_DISPLAY_TYPES.has(config.displayType)) {
    throw new Error(`Unsupported screenshot display type: ${config.displayType}`);
  }

  const screenshots = collectScreenshots(config.screenshotsDir);
  const token = buildJwt(config);
  const client = createAscClient(token);
  const version = await getAppStoreVersion({
    client,
    appId: config.appId,
    version: config.version,
    platform: config.platform,
  });
  const {localization, created: localizationCreated} = await getOrCreateLocalization({
    client,
    versionId: version.id,
    locale: config.locale,
    createLocalization: config.createLocalization,
  });
  const {screenshotSet, created: screenshotSetCreated} = await getOrCreateScreenshotSet({
    client,
    localizationId: localization.id,
    displayType: config.displayType,
  });
  const existingScreenshots = await listScreenshots({client, screenshotSetId: screenshotSet.id});

  if (config.dryRun) {
    console.log(
      `${JSON.stringify(
        {
          appId: config.appId,
          version: config.version,
          platform: config.platform,
          locale: localization.attributes?.locale,
          displayType: config.displayType,
          screenshotSetId: screenshotSet.id,
          replace: config.replace,
          existingScreenshots: existingScreenshots.length,
          screenshots,
          dryRun: true,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (config.replace) {
    for (const screenshot of existingScreenshots) {
      await client.delete(`/appScreenshots/${screenshot.id}`);
    }
  }

  const uploadedScreenshots = [];
  for (const screenshot of screenshots) {
    const screenshotId = await uploadScreenshot({
      client,
      screenshotSetId: screenshotSet.id,
      screenshot,
    });
    uploadedScreenshots.push({...screenshot, id: screenshotId});
  }
  await client.patch(
    `/appScreenshotSets/${screenshotSet.id}/relationships/appScreenshots`,
    screenshotOrderPayload(uploadedScreenshots.map(screenshot => screenshot.id)),
  );

  console.log(
    `${JSON.stringify(
      {
        appId: config.appId,
        version: config.version,
        platform: config.platform,
        locale: localization.attributes?.locale,
        displayType: config.displayType,
        appStoreVersionId: version.id,
        appStoreVersionState: version.attributes?.appStoreState,
        localizationId: localization.id,
        localizationCreated,
        screenshotSetId: screenshotSet.id,
        screenshotSetCreated,
        replacedScreenshots: config.replace ? existingScreenshots.length : 0,
        uploadedScreenshots: uploadedScreenshots.map(screenshot => ({
          id: screenshot.id,
          fileName: screenshot.fileName,
          fileSize: screenshot.fileSize,
          width: screenshot.width,
          height: screenshot.height,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
