/* eslint-disable no-bitwise */
import {
  decodeErrorResponse,
  decodeGetPurchaseContextResponse,
  decodeSyncAppStoreTransactionResponse,
  encodeGetPurchaseContextRequest,
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
  return [(fieldNumber << 3) | 2, ...varint(bytes.length), ...bytes];
}

function varintField(fieldNumber: number, value: number): number[] {
  return [(fieldNumber << 3) | 0, ...varint(value)];
}

function messageField(fieldNumber: number, value: number[]): number[] {
  return [(fieldNumber << 3) | 2, ...varint(value.length), ...value];
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
