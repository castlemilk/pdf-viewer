/* eslint-disable no-bitwise */
import {ProBackendClient, ProBackendError} from '../src/pro/proBackendClient';
import {
  encodeGetAccountRequest,
  encodeSyncLibraryRequest,
  encodeSyncAppStoreTransactionRequest,
  type ProAccountEntitlement,
} from '../src/pro/protobuf';

function utf8(value: string): number[] {
  return value.split('').map(character => character.charCodeAt(0));
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 127) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return bytes;
}

function stringField(fieldNumber: number, value: string): number[] {
  const bytes = utf8(value);
  return [...varint((fieldNumber << 3) | 2), ...varint(bytes.length), ...bytes];
}

function varintField(fieldNumber: number, value: number): number[] {
  return [...varint((fieldNumber << 3) | 0), ...varint(value)];
}

function messageField(fieldNumber: number, value: number[]): number[] {
  return [...varint((fieldNumber << 3) | 2), ...varint(value.length), ...value];
}

function createResponse(status: number, body: Uint8Array) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: jest.fn(async (): Promise<ArrayBuffer> => {
      const copy = new Uint8Array(body.byteLength);
      copy.set(body);
      return copy.buffer;
    }),
  };
}

type TestResponse = ReturnType<typeof createResponse>;
type TestFetch = jest.Mock<
  Promise<TestResponse>,
  [string, {body?: Uint8Array}]
>;

afterEach(() => {
  jest.restoreAllMocks();
});

test('requests purchase context using protobuf and Firebase bearer auth', async () => {
  const fetchMock: TestFetch = jest.fn(async (_url, _init) =>
    createResponse(
      200,
      Uint8Array.from([
        ...stringField(1, '2d6825b7-9df2-4ff8-a06f-401bd0696fc4'),
        ...stringField(2, 'com.benebsworth.acacia.pro.monthly'),
        ...stringField(3, 'com.benebsworth.acacia'),
      ]),
    ),
  );
  const client = new ProBackendClient({
    baseUrl: 'https://pro.acacia.test',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await expect(client.getPurchaseContext('firebase-token')).resolves.toEqual({
    appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    productIds: ['com.benebsworth.acacia.pro.monthly'],
    bundleId: 'com.benebsworth.acacia',
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://pro.acacia.test/v1/account:purchaseContext',
    expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/x-protobuf',
        Accept: 'application/x-protobuf',
      },
    }),
  );
  expect(
    Array.from(fetchMock.mock.calls[0][1].body ?? new Uint8Array()),
  ).toEqual([]);
});

test('fetches account entitlement using protobuf and Firebase bearer auth', async () => {
  const quotaBytes = 20 * 1024 * 1024 * 1024;
  const accountBody: number[] = [
    ...stringField(1, 'firebase-user-1'),
    ...stringField(2, 'eshe@example.com'),
    ...varintField(3, 2),
    ...varintField(4, 1),
    ...varintField(5, quotaBytes),
    ...varintField(6, 1073741824),
    ...varintField(9, 3),
    ...stringField(12, 'cloud_storage'),
  ];
  const fetchMock: TestFetch = jest.fn(async (_url, _init) =>
    createResponse(200, Uint8Array.from(messageField(1, accountBody))),
  );
  const client = new ProBackendClient({
    baseUrl: 'https://pro.acacia.test/',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await expect(client.getAccount('firebase-token')).resolves.toEqual({
    account: expect.objectContaining({
      firebaseUid: 'firebase-user-1',
      email: 'eshe@example.com',
      plan: 'pro',
      active: true,
      storageQuotaBytes: quotaBytes,
      storageUsedBytes: 1073741824,
      source: 'app_store',
      features: ['cloud_storage'],
    }),
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://pro.acacia.test/v1/account:get',
    expect.objectContaining({
      method: 'POST',
      body: encodeGetAccountRequest(),
    }),
  );
});

test('syncs signed StoreKit JWS and decodes Pro entitlement', async () => {
  const quotaBytes = 20 * 1024 * 1024 * 1024;
  const account: ProAccountEntitlement = {
    firebaseUid: 'firebase-user-1',
    email: 'eshe@example.com',
    plan: 'pro',
    active: true,
    storageQuotaBytes: quotaBytes,
    storageUsedBytes: 0,
    customerId: 'customer-token',
    appStoreOriginalTransactionId: '1000001234567890',
    source: 'app_store',
    features: ['review_threads'],
    appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
  };
  const accountBody: number[] = [
    ...stringField(1, account.firebaseUid),
    ...stringField(2, account.email),
    ...varintField(3, 2),
    ...varintField(4, 1),
    ...varintField(5, quotaBytes),
    ...stringField(7, account.customerId),
    ...stringField(8, account.appStoreOriginalTransactionId),
    ...varintField(9, 3),
    ...stringField(12, account.features[0] ?? ''),
    ...stringField(13, account.appAccountToken),
  ];
  const fetchMock: TestFetch = jest.fn(async (_url, _init) =>
    createResponse(200, Uint8Array.from(messageField(1, accountBody))),
  );
  const client = new ProBackendClient({
    baseUrl: 'https://pro.acacia.test/',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await expect(
    client.syncAppStoreTransaction('firebase-token', 'signed-jws'),
  ).resolves.toEqual({account});

  expect(fetchMock).toHaveBeenCalledWith(
    'https://pro.acacia.test/v1/app_store/transactions:sync',
    expect.objectContaining({
      method: 'POST',
      body: encodeSyncAppStoreTransactionRequest('signed-jws'),
    }),
  );
});

test('throws backend protobuf error details for failed requests', async () => {
  const fetchMock: TestFetch = jest.fn(async (_url, _init) =>
    createResponse(
      503,
      Uint8Array.from([
        ...stringField(1, 'not_configured'),
        ...stringField(2, 'app account token secret is not configured'),
      ]),
    ),
  );
  const client = new ProBackendClient({
    baseUrl: 'https://pro.acacia.test',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await expect(client.getPurchaseContext('firebase-token')).rejects.toEqual(
    new ProBackendError(
      'not_configured',
      'app account token secret is not configured',
      503,
    ),
  );
});

test('syncs cloud library snapshot using protobuf and Firebase bearer auth', async () => {
  const snapshot = {
    documents: [
      {
        id: 'roadmap',
        title: 'Product Roadmap',
        author: 'Product',
        pageCount: 44,
        sizeBytes: 1258291,
        progress: 0.6,
        createdAt: '2026-05-01T10:00:00.000Z',
        modifiedAt: '2026-05-02T10:00:00.000Z',
        lastOpenedAt: '2026-05-03T10:00:00.000Z',
        tags: ['work'],
        collectionIds: ['briefs'],
        favorite: false,
        shared: true,
        thumbnailTone: 'navy',
        versionLabel: '2.0',
      },
    ],
    annotations: [],
    revision: 2,
    updatedAt: '2026-05-04T10:00:00.000Z',
  };
  const responseSnapshot = [
    ...messageField(1, [
      ...stringField(1, 'roadmap'),
      ...stringField(2, 'Product Roadmap'),
      ...stringField(3, 'Product'),
      ...varintField(4, 44),
      ...varintField(5, 1258291),
      ...varintField(6, 600),
      ...stringField(7, '2026-05-01T10:00:00.000Z'),
      ...stringField(8, '2026-05-02T10:00:00.000Z'),
      ...stringField(9, '2026-05-03T10:00:00.000Z'),
      ...stringField(10, 'work'),
      ...stringField(11, 'briefs'),
      ...varintField(13, 1),
      ...stringField(14, 'navy'),
      ...stringField(15, '2.0'),
      ...varintField(16, 3),
    ]),
    ...varintField(3, 3),
    ...stringField(4, '2026-05-04T10:01:00.000Z'),
  ];
  const fetchMock: TestFetch = jest.fn(async (_url, _init) =>
    createResponse(200, Uint8Array.from(messageField(1, responseSnapshot))),
  );
  const client = new ProBackendClient({
    baseUrl: 'https://pro.acacia.test/',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await expect(
    client.syncLibrary('firebase-token', snapshot),
  ).resolves.toEqual({
    snapshot: {
      documents: [
        expect.objectContaining({
          id: 'roadmap',
          revision: 3,
        }),
      ],
      annotations: [],
      revision: 3,
      updatedAt: '2026-05-04T10:01:00.000Z',
    },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://pro.acacia.test/v1/library:sync',
    expect.objectContaining({
      method: 'POST',
      body: encodeSyncLibraryRequest(snapshot),
    }),
  );
});
