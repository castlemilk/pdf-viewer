/* eslint-disable no-bitwise */
import {
  decodeErrorResponse,
  decodeDeleteAccountResponse,
  decodeGetAccountResponse,
  decodeGetPurchaseContextResponse,
  decodeRevokeAppleSignInTokenResponse,
  decodeSyncLibraryResponse,
  decodeSyncAppStoreTransactionResponse,
  encodeDeleteAccountRequest,
  encodeGetAccountRequest,
  encodeGetPurchaseContextRequest,
  encodeRevokeAppleSignInTokenRequest,
  encodeSyncLibraryRequest,
  encodeSyncAppStoreTransactionRequest,
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

test('encodes an empty purchase context request as an empty protobuf message', () => {
  expect(Array.from(encodeGetPurchaseContextRequest())).toEqual([]);
});

test('decodes purchase context response fields needed for StoreKit purchase', () => {
  const body = Uint8Array.from([
    ...stringField(1, '2d6825b7-9df2-4ff8-a06f-401bd0696fc4'),
    ...stringField(2, 'com.benebsworth.acacia.pro.monthly'),
    ...stringField(2, 'com.benebsworth.acacia.pro.yearly'),
    ...stringField(3, 'com.benebsworth.acacia'),
  ]);

  expect(decodeGetPurchaseContextResponse(body)).toEqual({
    appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    productIds: [
      'com.benebsworth.acacia.pro.monthly',
      'com.benebsworth.acacia.pro.yearly',
    ],
    bundleId: 'com.benebsworth.acacia',
  });
});

test('encodes empty get account request and decodes account entitlement', () => {
  const quotaBytes = 20 * 1024 * 1024 * 1024;
  const account: number[] = [
    ...stringField(1, 'firebase-user-1'),
    ...stringField(2, 'eshe@example.com'),
    ...varintField(3, 2),
    ...varintField(4, 1),
    ...varintField(5, quotaBytes),
    ...varintField(6, 1073741824),
    ...stringField(7, 'customer-token'),
    ...stringField(8, '1000001234567890'),
    ...varintField(9, 3),
    ...stringField(12, 'review_threads'),
    ...stringField(13, '2d6825b7-9df2-4ff8-a06f-401bd0696fc4'),
  ];

  expect(Array.from(encodeGetAccountRequest())).toEqual([]);
  expect(
    decodeGetAccountResponse(Uint8Array.from(messageField(1, account))),
  ).toEqual({
    account: {
      firebaseUid: 'firebase-user-1',
      email: 'eshe@example.com',
      plan: 'pro',
      active: true,
      storageQuotaBytes: quotaBytes,
      storageUsedBytes: 1073741824,
      customerId: 'customer-token',
      appStoreOriginalTransactionId: '1000001234567890',
      source: 'app_store',
      features: ['review_threads'],
      appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    },
  });
});

test('encodes empty delete account request and decodes deletion response', () => {
  expect(Array.from(encodeDeleteAccountRequest())).toEqual([]);
  expect(
    decodeDeleteAccountResponse(Uint8Array.from(varintField(1, 1))),
  ).toEqual({deleted: true});
});

test('encodes Apple authorization code revocation request and decodes response', () => {
  expect(
    Array.from(encodeRevokeAppleSignInTokenRequest('apple-auth-code')),
  ).toEqual(stringField(1, 'apple-auth-code'));
  expect(
    decodeRevokeAppleSignInTokenResponse(Uint8Array.from(varintField(1, 1))),
  ).toEqual({revoked: true});
});

test('encodes signed StoreKit transaction JWS for backend sync', () => {
  expect(Array.from(encodeSyncAppStoreTransactionRequest('signed-jws'))).toEqual(
    stringField(1, 'signed-jws'),
  );
});

test('decodes synced app store transaction response into account entitlement', () => {
  const quotaBytes = 20 * 1024 * 1024 * 1024;
  const account: number[] = [
    ...stringField(1, 'firebase-user-1'),
    ...stringField(2, 'eshe@example.com'),
    ...varintField(3, 2),
    ...varintField(4, 1),
    ...varintField(5, quotaBytes),
    ...stringField(7, 'customer-token'),
    ...stringField(8, '1000001234567890'),
    ...varintField(9, 3),
    ...stringField(12, 'review_threads'),
    ...stringField(12, 'cloud_storage'),
    ...stringField(13, '2d6825b7-9df2-4ff8-a06f-401bd0696fc4'),
  ];

  expect(
    decodeSyncAppStoreTransactionResponse(
      Uint8Array.from(messageField(1, account)),
    ),
  ).toEqual({
    account: {
      firebaseUid: 'firebase-user-1',
      email: 'eshe@example.com',
      plan: 'pro',
      active: true,
      storageQuotaBytes: quotaBytes,
      storageUsedBytes: 0,
      customerId: 'customer-token',
      appStoreOriginalTransactionId: '1000001234567890',
      source: 'app_store',
      features: ['review_threads', 'cloud_storage'],
      appAccountToken: '2d6825b7-9df2-4ff8-a06f-401bd0696fc4',
    },
  });
});

test('decodes backend protobuf errors', () => {
  const body = Uint8Array.from([
    ...stringField(1, 'not_configured'),
    ...stringField(2, 'app store transaction verification is not configured'),
  ]);

  expect(decodeErrorResponse(body)).toEqual({
    code: 'not_configured',
    message: 'app store transaction verification is not configured',
  });
});

test('encodes cloud library snapshot for Pro sync', () => {
  const encoded = Array.from(
    encodeSyncLibraryRequest({
      documents: [
        {
          id: 'q4-market-analysis',
          title: 'Q4 Market Analysis',
          author: 'Analytics',
          pageCount: 32,
          sizeBytes: 838860,
          progress: 0.25,
          createdAt: '2026-05-20T10:00:00.000Z',
          modifiedAt: '2026-05-21T10:00:00.000Z',
          lastOpenedAt: '2026-05-22T10:00:00.000Z',
          tags: ['work'],
          collectionIds: ['q4-reports'],
          favorite: true,
          shared: false,
          thumbnailTone: 'paper',
          versionLabel: '1.0',
        },
      ],
      annotations: [
        {
          id: 'highlight-1',
          documentId: 'q4-market-analysis',
          pageIndex: 2,
          kind: 'highlight',
          color: '#F8D867',
          bounds: {x: 10.25, y: 20.5, width: 160, height: 18.75},
          points: [{x: 10.25, y: 20.5}],
          text: 'steady growth',
          createdAt: '2026-05-22T11:00:00.000Z',
          updatedAt: '2026-05-22T11:30:00.000Z',
        },
      ],
      revision: 7,
      updatedAt: '2026-05-22T12:00:00.000Z',
    }),
  );

  const rect = [
    ...varintField(1, 10250),
    ...varintField(2, 20500),
    ...varintField(3, 160000),
    ...varintField(4, 18750),
  ];
  const point = [...varintField(1, 10250), ...varintField(2, 20500)];
  const document = [
    ...stringField(1, 'q4-market-analysis'),
    ...stringField(2, 'Q4 Market Analysis'),
    ...stringField(3, 'Analytics'),
    ...varintField(4, 32),
    ...varintField(5, 838860),
    ...varintField(6, 250),
    ...stringField(7, '2026-05-20T10:00:00.000Z'),
    ...stringField(8, '2026-05-21T10:00:00.000Z'),
    ...stringField(9, '2026-05-22T10:00:00.000Z'),
    ...stringField(10, 'work'),
    ...stringField(11, 'q4-reports'),
    ...varintField(12, 1),
    ...varintField(13, 0),
    ...stringField(14, 'paper'),
    ...stringField(15, '1.0'),
  ];
  const annotation = [
    ...stringField(1, 'highlight-1'),
    ...stringField(2, 'q4-market-analysis'),
    ...varintField(3, 2),
    ...stringField(4, 'highlight'),
    ...stringField(5, '#F8D867'),
    ...messageField(6, rect),
    ...messageField(7, point),
    ...stringField(8, 'steady growth'),
    ...stringField(9, '2026-05-22T11:00:00.000Z'),
    ...stringField(10, '2026-05-22T11:30:00.000Z'),
  ];
  const snapshot = [
    ...messageField(1, document),
    ...messageField(2, annotation),
    ...varintField(3, 7),
    ...stringField(4, '2026-05-22T12:00:00.000Z'),
  ];

  expect(encoded).toEqual(messageField(1, snapshot));
});

test('decodes cloud library sync response', () => {
  const document = [
    ...stringField(1, 'roadmap'),
    ...stringField(2, 'Product Roadmap'),
    ...stringField(3, 'Product'),
    ...varintField(4, 44),
    ...varintField(5, 1200000),
    ...varintField(6, 600),
    ...stringField(7, '2026-05-01T10:00:00.000Z'),
    ...stringField(8, '2026-05-02T10:00:00.000Z'),
    ...stringField(9, '2026-05-03T10:00:00.000Z'),
    ...stringField(10, 'work'),
    ...stringField(11, 'briefs'),
    ...varintField(12, 0),
    ...varintField(13, 1),
    ...stringField(14, 'navy'),
    ...stringField(15, '2.0'),
    ...varintField(16, 9),
  ];
  const bounds = [
    ...varintField(1, 1000),
    ...varintField(2, 2000),
    ...varintField(3, 3000),
    ...varintField(4, 4000),
  ];
  const annotation = [
    ...stringField(1, 'note-1'),
    ...stringField(2, 'roadmap'),
    ...varintField(3, 3),
    ...stringField(4, 'note'),
    ...stringField(5, '#2E74F5'),
    ...messageField(6, bounds),
    ...stringField(8, 'Follow up'),
    ...stringField(9, '2026-05-03T11:00:00.000Z'),
    ...stringField(10, '2026-05-03T11:30:00.000Z'),
    ...varintField(11, 10),
  ];
  const snapshot = [
    ...messageField(1, document),
    ...messageField(2, annotation),
    ...varintField(3, 12),
    ...stringField(4, '2026-05-04T10:00:00.000Z'),
  ];

  expect(
    decodeSyncLibraryResponse(Uint8Array.from(messageField(1, snapshot))),
  ).toEqual({
    snapshot: {
      documents: [
        {
          id: 'roadmap',
          title: 'Product Roadmap',
          author: 'Product',
          pageCount: 44,
          sizeBytes: 1200000,
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
          revision: 9,
        },
      ],
      annotations: [
        {
          id: 'note-1',
          documentId: 'roadmap',
          pageIndex: 3,
          kind: 'note',
          color: '#2E74F5',
          bounds: {x: 1, y: 2, width: 3, height: 4},
          points: [],
          text: 'Follow up',
          createdAt: '2026-05-03T11:00:00.000Z',
          updatedAt: '2026-05-03T11:30:00.000Z',
          revision: 10,
        },
      ],
      revision: 12,
      updatedAt: '2026-05-04T10:00:00.000Z',
    },
  });
});
