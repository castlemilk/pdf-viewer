#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createPrivateKey, sign} from 'node:crypto';

const ASC_API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--version':
        parsed.version = argv[++index];
        break;
      case '--build-number':
        parsed.buildNumber = argv[++index];
        break;
      case '--platform':
        parsed.platform = argv[++index];
        break;
      case '--group-name':
        parsed.groupName = argv[++index];
        break;
      case '--tester-emails':
        parsed.testerEmails = argv[++index];
        break;
      case '--no-testers':
        parsed.testerEmails = '';
        break;
      case '--strict-testers':
        parsed.strictTesters = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: scripts/rollout-testflight-internal.sh [--version VERSION] [--build-number NUMBER] [--platform MAC_OS|IOS] [--group-name NAME] [--tester-emails CSV] [--strict-testers]');
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseEmails(value) {
  if (!value) {
    return [];
  }
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
}

function normalizePlatform(value) {
  const normalized = String(value || 'MAC_OS').trim().toUpperCase();
  if (normalized === 'MACOS' || normalized === 'MAC') {
    return 'MAC_OS';
  }
  if (normalized === 'IPHONE' || normalized === 'IPHONEOS') {
    return 'IOS';
  }
  if (normalized !== 'MAC_OS' && normalized !== 'IOS') {
    throw new Error(`Unsupported TestFlight platform: ${value}`);
  }
  return normalized;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function readPrivateKey() {
  const inlineKey =
    readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY') ??
    readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY_P8');
  if (inlineKey) {
    return inlineKey;
  }

  const privateKeyPath = readEnv('APP_STORE_CONNECT_API_PRIVATE_KEY_PATH');
  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
    throw new Error('APP_STORE_CONNECT_API_PRIVATE_KEY or APP_STORE_CONNECT_API_PRIVATE_KEY_PATH is required.');
  }
  return fs.readFileSync(privateKeyPath, 'utf8');
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
    const json = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const detail =
        json?.errors?.map(error => error.detail || error.title).filter(Boolean).join('; ') ||
        `${response.status}`;
      throw new Error(`App Store Connect API ${method} ${pathname} failed: ${detail}`);
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

function createInternalGroupPayload({appId, groupName}) {
  return {
    data: {
      type: 'betaGroups',
      attributes: {
        name: groupName,
        isInternalGroup: true,
        hasAccessToAllBuilds: false,
        publicLinkEnabled: false,
        feedbackEnabled: true,
      },
      relationships: {
        app: {data: {type: 'apps', id: appId}},
      },
    },
  };
}

function createInvitationPayload({appId, email, role}) {
  const [first = 'Internal', ...rest] = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  return {
    data: {
      type: 'userInvitations',
      attributes: {
        email,
        firstName: first.charAt(0).toUpperCase() + first.slice(1),
        lastName: rest.length ? rest.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Tester',
        roles: [role],
        allAppsVisible: false,
        provisioningAllowed: false,
      },
      relationships: {
        visibleApps: {data: [{type: 'apps', id: appId}]},
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = readJsonIfExists(
    readEnv('APP_STORE_UPLOAD_METADATA_PATH') ??
      path.join(rootDir, 'dist', 'app-store', 'app-store-upload.json'),
  );

  const config = {
    appId: readEnv('APP_STORE_CONNECT_APP_ID'),
    keyId: readEnv('APP_STORE_CONNECT_API_KEY_ID'),
    issuerId: readEnv('APP_STORE_CONNECT_API_ISSUER_ID'),
    privateKey: readPrivateKey(),
    bundleId: readEnv('BUNDLE_ID') ?? 'com.benebsworth.acacia',
    version: args.version ?? readEnv('VERSION') ?? readEnv('APP_STORE_VERSION') ?? metadata.marketingVersion,
    buildNumber:
      args.buildNumber ??
      readEnv('BUILD_NUMBER') ??
      readEnv('APP_STORE_BUILD_NUMBER') ??
      metadata.buildNumber,
    platform: normalizePlatform(
      args.platform ?? readEnv('APP_STORE_PLATFORM') ?? metadata.platform ?? 'MAC_OS',
    ),
    groupName:
      args.groupName ??
      readEnv('APP_STORE_CONNECT_INTERNAL_GROUP_NAME') ??
      'Acacia Internal',
    testerEmails: parseEmails(
      args.testerEmails ?? readEnv('APP_STORE_CONNECT_INTERNAL_TESTER_EMAILS'),
    ),
    testerRole: readEnv('APP_STORE_CONNECT_INTERNAL_TESTER_ROLE') ?? 'MARKETING',
    strictTesters: args.strictTesters || readEnv('APP_STORE_CONNECT_STRICT_TESTERS') === '1',
  };

  if (!config.appId || !config.keyId || !config.issuerId || !config.version || !config.buildNumber) {
    throw new Error('App Store Connect app id, API credentials, version, and build number are required.');
  }

  const client = createAscClient(buildJwt(config));
  const buildResponse = await client.get('/builds', {
    'filter[app]': config.appId,
    'filter[version]': config.buildNumber,
    'filter[preReleaseVersion.version]': config.version,
    'filter[preReleaseVersion.platform]': config.platform,
    limit: 1,
    'fields[builds]': 'version,processingState,buildAudienceType',
  });
  const build = buildResponse?.data?.[0];
  if (!build) {
    throw new Error(`No ${config.platform} build found for ${config.version} (${config.buildNumber}).`);
  }

  const processingState = build.attributes?.processingState ?? 'UNKNOWN';
  if (!['VALID', 'PROCESSING'].includes(processingState)) {
    throw new Error(`Build ${config.version} (${config.buildNumber}) is not assignable: ${processingState}.`);
  }

  let updatedExportCompliance = false;
  const betaDetail = await client.get(`/builds/${build.id}/buildBetaDetail`);
  const internalBuildState = betaDetail?.data?.attributes?.internalBuildState;
  let finalBetaDetail = betaDetail;
  if (
    internalBuildState === 'MISSING_EXPORT_COMPLIANCE' ||
    build.attributes?.usesNonExemptEncryption === null
  ) {
    await client.patch(`/builds/${build.id}`, {
      data: {
        type: 'builds',
        id: build.id,
        attributes: {
          usesNonExemptEncryption: false,
        },
      },
    });
    updatedExportCompliance = true;
    finalBetaDetail = await client.get(`/builds/${build.id}/buildBetaDetail`);
  }
  const finalBetaAttributes = finalBetaDetail?.data?.attributes ?? {};

  const groupResponse = await client.get('/betaGroups', {
    'filter[app]': config.appId,
    'filter[name]': config.groupName,
    'filter[isInternalGroup]': 'true',
    limit: 1,
    'fields[betaGroups]': 'name,isInternalGroup',
  });

  let group = groupResponse?.data?.[0];
  let createdGroup = false;
  if (!group) {
    const created = await client.post(
      '/betaGroups',
      createInternalGroupPayload({appId: config.appId, groupName: config.groupName}),
    );
    group = created?.data;
    createdGroup = true;
  }

  if (!group?.id) {
    throw new Error('Unable to resolve internal beta group.');
  }

  const groupBuilds = await client.get(`/betaGroups/${group.id}/relationships/builds`, {
    limit: 200,
  });
  const alreadyLinked = (groupBuilds?.data ?? []).some(item => item.id === build.id);
  if (!alreadyLinked) {
    await client.post(`/betaGroups/${group.id}/relationships/builds`, {
      data: [{type: 'builds', id: build.id}],
    });
  }

  const groupTesters = await client.get(`/betaGroups/${group.id}/relationships/betaTesters`, {
    limit: 200,
  });
  const linkedTesterIds = new Set((groupTesters?.data ?? []).map(item => item.id));
  const linkedTesters = [];
  const invitedTesters = [];
  const pendingInvitations = [];
  const testerAssignmentErrors = [];

  for (const email of config.testerEmails) {
    try {
      const userLookup = await client.get('/users', {
        'filter[username]': email,
        limit: 1,
        'fields[users]': 'username,roles',
      });
      const existingUser = userLookup?.data?.[0];

      if (!existingUser) {
        const invitationLookup = await client.get('/userInvitations', {
          'filter[email]': email,
          limit: 1,
          'fields[userInvitations]': 'email',
        });
        if (!invitationLookup?.data?.[0]) {
          await client.post(
            '/userInvitations',
            createInvitationPayload({
              appId: config.appId,
              email,
              role: config.testerRole,
            }),
          );
          invitedTesters.push(email);
        }
        pendingInvitations.push(email);
        continue;
      }

      const testerLookup = await client.get('/betaTesters', {
        'filter[email]': email,
        limit: 200,
        'fields[betaTesters]': 'email',
      });
      const existingTesters = testerLookup?.data ?? [];
      const linkedExistingTester = existingTesters.find(tester => linkedTesterIds.has(tester.id));
      if (linkedExistingTester) {
        linkedTesters.push(email);
        continue;
      }

      let linkedExistingTesterToGroup = false;
      for (const existingTester of existingTesters) {
        try {
          await client.post(`/betaGroups/${group.id}/relationships/betaTesters`, {
            data: [{type: 'betaTesters', id: existingTester.id}],
          });
          linkedTesterIds.add(existingTester.id);
          linkedTesters.push(email);
          linkedExistingTesterToGroup = true;
          break;
        } catch (error) {
          // A beta tester resource can already exist for another app and still be
          // rejected for this group. Creating a group-scoped tester below lets
          // App Store Connect resolve the app-specific tester record.
        }
      }

      if (linkedExistingTesterToGroup) {
        continue;
      }

      const createdTester = await client.post('/betaTesters', {
        data: {
          type: 'betaTesters',
          attributes: {email},
          relationships: {
            betaGroups: {data: [{type: 'betaGroups', id: group.id}]},
          },
        },
      });
      const createdTesterId = createdTester?.data?.id;
      if (createdTesterId) {
        linkedTesterIds.add(createdTesterId);
      }
      linkedTesters.push(email);
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      testerAssignmentErrors.push({email, message});
      if (config.strictTesters) {
        throw error;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        appId: config.appId,
        bundleId: config.bundleId,
        version: config.version,
        buildNumber: config.buildNumber,
        platform: config.platform,
        buildId: build.id,
        processingState,
        internalBuildState: finalBetaAttributes.internalBuildState,
        externalBuildState: finalBetaAttributes.externalBuildState,
        usesNonExemptEncryption: finalBetaAttributes.usesNonExemptEncryption,
        updatedExportCompliance,
        groupId: group.id,
        groupName: config.groupName,
        createdGroup,
        linkedBuild: !alreadyLinked,
        testerEmails: config.testerEmails,
        linkedTesters,
        invitedTesters,
        pendingInvitations,
        testerAssignmentErrors,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
