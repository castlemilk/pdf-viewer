#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createHash, createPrivateKey, sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ASC_API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PREVIEW_TYPES = new Set([
  'IPHONE_67',
  'IPHONE_61',
  'IPHONE_65',
  'IPHONE_58',
  'IPHONE_55',
  'IPHONE_47',
  'IPHONE_40',
  'IPHONE_35',
  'IPAD_PRO_3GEN_129',
  'IPAD_PRO_3GEN_11',
  'IPAD_PRO_129',
  'IPAD_105',
  'IPAD_97',
  'DESKTOP',
  'APPLE_TV',
  'APPLE_VISION_PRO',
]);

function parseArgs(argv) {
  const parsed = {
    platform: process.env.APP_STORE_PLATFORM || 'IOS',
    locale: process.env.APP_STORE_PREVIEWS_LOCALE || undefined,
    previewType: process.env.APP_STORE_PREVIEW_TYPE || 'IPHONE_67',
    previewsDir:
      process.env.APP_STORE_PREVIEWS_DIR ||
      path.join(rootDir, 'publishing', 'app-previews', 'iphone-67'),
    replace: process.env.APP_STORE_PREVIEWS_APPEND !== '1',
    createLocalization: process.env.APP_STORE_PREVIEWS_CREATE_LOCALIZATION === '1',
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
      case '--preview-type':
        parsed.previewType = argv[++index];
        break;
      case '--previews-dir':
        parsed.previewsDir = argv[++index];
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
          'Usage: scripts/upload-app-store-previews.sh [--version VERSION] [--platform IOS|MAC_OS] [--locale LOCALE] [--create-localization] [--preview-type IPHONE_67] [--previews-dir DIR] [--append] [--dry-run]',
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
  const platform = String(value || 'IOS').trim().toUpperCase();
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

function collectPreviews(previewsDir) {
  if (!fs.existsSync(previewsDir)) {
    throw new Error(`App previews folder does not exist: ${previewsDir}`);
  }

  const files = fs
    .readdirSync(previewsDir)
    .filter(fileName => /\.(mp4|m4v|mov)$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map(fileName => path.join(previewsDir, fileName));

  if (files.length < 1 || files.length > 3) {
    throw new Error(`App Store preview upload requires 1 to 3 videos; found ${files.length}.`);
  }

  return files.map(filePath => {
    const buffer = fs.readFileSync(filePath);
    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: buffer.length,
      sourceFileChecksum: createHash('md5').update(buffer).digest('hex'),
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

function createPreviewSetPayload({localizationId, previewType}) {
  return {
    data: {
      type: 'appPreviewSets',
      attributes: {previewType},
      relationships: {
        appStoreVersionLocalization: {
          data: {type: 'appStoreVersionLocalizations', id: localizationId},
        },
      },
    },
  };
}

function createPreviewPayload({previewSetId, fileName, fileSize}) {
  return {
    data: {
      type: 'appPreviews',
      attributes: {fileName, fileSize},
      relationships: {
        appPreviewSet: {data: {type: 'appPreviewSets', id: previewSetId}},
      },
    },
  };
}

function markPreviewUploadedPayload({previewId, sourceFileChecksum}) {
  return {
    data: {
      type: 'appPreviews',
      id: previewId,
      attributes: {
        uploaded: true,
        sourceFileChecksum,
      },
    },
  };
}

function previewOrderPayload(previewIds) {
  return {
    data: previewIds.map(id => ({type: 'appPreviews', id})),
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

async function getOrCreatePreviewSet({client, localizationId, previewType}) {
  const response = await client.get(`/appStoreVersionLocalizations/${localizationId}/appPreviewSets`, {
    'filter[previewType]': previewType,
    'fields[appPreviewSets]': 'previewType',
    limit: 50,
  });
  const existing = response?.data?.find(
    item => item.attributes?.previewType === previewType,
  );
  if (existing) {
    return {previewSet: existing, created: false};
  }

  const created = await client.post(
    '/appPreviewSets',
    createPreviewSetPayload({localizationId, previewType}),
  );
  return {previewSet: created.data, created: true};
}

async function listPreviews({client, previewSetId}) {
  const response = await client.get(`/appPreviewSets/${previewSetId}/appPreviews`, {
    'fields[appPreviews]': 'fileName,fileSize,assetDeliveryState,videoDeliveryState,sourceFileChecksum,videoUrl',
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
        `App preview asset upload failed for ${path.basename(filePath)}: ${response.status} ${text}`,
      );
    }
  }
}

async function uploadPreview({client, previewSetId, preview}) {
  const created = await client.post(
    '/appPreviews',
    createPreviewPayload({
      previewSetId,
      fileName: preview.fileName,
      fileSize: preview.fileSize,
    }),
  );
  const previewId = created.data?.id;
  const uploadOperations = created.data?.attributes?.uploadOperations || [];
  if (!previewId || !uploadOperations.length) {
    throw new Error(`App Store Connect did not return upload operations for ${preview.fileName}.`);
  }

  await uploadFileWithOperations({uploadOperations, filePath: preview.filePath});
  await client.patch(
    `/appPreviews/${previewId}`,
    markPreviewUploadedPayload({
      previewId,
      sourceFileChecksum: preview.sourceFileChecksum,
    }),
  );
  return previewId;
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
    previewType: String(args.previewType || '').trim().toUpperCase(),
    previewsDir: path.resolve(args.previewsDir),
    replace: args.replace,
    createLocalization: args.createLocalization,
    dryRun: args.dryRun,
  };

  if (!config.appId || !config.keyId || !config.issuerId) {
    throw new Error('App Store Connect app id and API credentials are required.');
  }
  if (!PREVIEW_TYPES.has(config.previewType)) {
    throw new Error(`Unsupported app preview type: ${config.previewType}`);
  }

  const previews = collectPreviews(config.previewsDir);
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
  const {previewSet, created: previewSetCreated} = await getOrCreatePreviewSet({
    client,
    localizationId: localization.id,
    previewType: config.previewType,
  });
  const existingPreviews = await listPreviews({client, previewSetId: previewSet.id});

  if (config.dryRun) {
    console.log(
      `${JSON.stringify(
        {
          appId: config.appId,
          version: config.version,
          platform: config.platform,
          locale: localization.attributes?.locale,
          previewType: config.previewType,
          previewSetId: previewSet.id,
          replace: config.replace,
          existingPreviews: existingPreviews.length,
          previews,
          dryRun: true,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (config.replace) {
    for (const preview of existingPreviews) {
      await client.delete(`/appPreviews/${preview.id}`);
    }
  }

  const uploadedPreviews = [];
  for (const preview of previews) {
    const previewId = await uploadPreview({
      client,
      previewSetId: previewSet.id,
      preview,
    });
    uploadedPreviews.push({...preview, id: previewId});
  }
  await client.patch(
    `/appPreviewSets/${previewSet.id}/relationships/appPreviews`,
    previewOrderPayload(uploadedPreviews.map(preview => preview.id)),
  );

  console.log(
    `${JSON.stringify(
      {
        appId: config.appId,
        version: config.version,
        platform: config.platform,
        locale: localization.attributes?.locale,
        previewType: config.previewType,
        appStoreVersionId: version.id,
        appStoreVersionState: version.attributes?.appStoreState,
        localizationId: localization.id,
        localizationCreated,
        previewSetId: previewSet.id,
        previewSetCreated,
        replacedPreviews: config.replace ? existingPreviews.length : 0,
        uploadedPreviews: uploadedPreviews.map(preview => ({
          id: preview.id,
          fileName: preview.fileName,
          fileSize: preview.fileSize,
          sourceFileChecksum: preview.sourceFileChecksum,
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
