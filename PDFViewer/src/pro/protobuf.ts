/* eslint-disable no-bitwise */
export const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';

export type ProPlan = 'free' | 'pro';
export type ProEntitlementSource =
  | 'unspecified'
  | 'default'
  | 'admin'
  | 'app_store';

export type ProAccountEntitlement = {
  firebaseUid: string;
  email: string;
  plan: ProPlan;
  active: boolean;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  customerId: string;
  appStoreOriginalTransactionId: string;
  source: ProEntitlementSource;
  features: string[];
  appAccountToken: string;
};

export type GetPurchaseContextResponse = {
  appAccountToken: string;
  productIds: string[];
  bundleId: string;
};

export type SyncAppStoreTransactionResponse = {
  account?: ProAccountEntitlement;
};

export type ProErrorResponse = {
  code: string;
  message: string;
};

type Field = {
  fieldNumber: number;
  wireType: number;
  value: Uint8Array | number;
};

export function encodeGetPurchaseContextRequest(): Uint8Array {
  return new Uint8Array();
}

export function encodeSyncAppStoreTransactionRequest(
  signedTransactionJws: string,
): Uint8Array {
  return encodeFields([stringField(1, signedTransactionJws)]);
}

export function decodeGetPurchaseContextResponse(
  body: Uint8Array,
): GetPurchaseContextResponse {
  const response: GetPurchaseContextResponse = {
    appAccountToken: '',
    productIds: [],
    bundleId: '',
  };

  for (const field of decodeFields(body)) {
    if (field.wireType !== 2 || typeof field.value === 'number') {
      continue;
    }

    switch (field.fieldNumber) {
      case 1:
        response.appAccountToken = decodeUtf8(field.value);
        break;
      case 2:
        response.productIds.push(decodeUtf8(field.value));
        break;
      case 3:
        response.bundleId = decodeUtf8(field.value);
        break;
    }
  }

  return response;
}

export function decodeSyncAppStoreTransactionResponse(
  body: Uint8Array,
): SyncAppStoreTransactionResponse {
  for (const field of decodeFields(body)) {
    if (
      field.fieldNumber === 1 &&
      field.wireType === 2 &&
      typeof field.value !== 'number'
    ) {
      return {account: decodeAccountEntitlement(field.value)};
    }
  }

  return {};
}

export function decodeErrorResponse(body: Uint8Array): ProErrorResponse {
  const response: ProErrorResponse = {code: '', message: ''};

  for (const field of decodeFields(body)) {
    if (field.wireType !== 2 || typeof field.value === 'number') {
      continue;
    }

    switch (field.fieldNumber) {
      case 1:
        response.code = decodeUtf8(field.value);
        break;
      case 2:
        response.message = decodeUtf8(field.value);
        break;
    }
  }

  return response;
}

function decodeAccountEntitlement(body: Uint8Array): ProAccountEntitlement {
  const account: ProAccountEntitlement = {
    firebaseUid: '',
    email: '',
    plan: 'free',
    active: false,
    storageQuotaBytes: 0,
    storageUsedBytes: 0,
    customerId: '',
    appStoreOriginalTransactionId: '',
    source: 'unspecified',
    features: [],
    appAccountToken: '',
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          account.firebaseUid = decodeUtf8(field.value);
        }
        break;
      case 2:
        if (isBytes(field)) {
          account.email = decodeUtf8(field.value);
        }
        break;
      case 3:
        if (typeof field.value === 'number') {
          account.plan = field.value === 2 ? 'pro' : 'free';
        }
        break;
      case 4:
        if (typeof field.value === 'number') {
          account.active = field.value !== 0;
        }
        break;
      case 5:
        if (typeof field.value === 'number') {
          account.storageQuotaBytes = field.value;
        }
        break;
      case 6:
        if (typeof field.value === 'number') {
          account.storageUsedBytes = field.value;
        }
        break;
      case 7:
        if (isBytes(field)) {
          account.customerId = decodeUtf8(field.value);
        }
        break;
      case 8:
        if (isBytes(field)) {
          account.appStoreOriginalTransactionId = decodeUtf8(field.value);
        }
        break;
      case 9:
        if (typeof field.value === 'number') {
          account.source = decodeEntitlementSource(field.value);
        }
        break;
      case 12:
        if (isBytes(field)) {
          account.features.push(decodeUtf8(field.value));
        }
        break;
      case 13:
        if (isBytes(field)) {
          account.appAccountToken = decodeUtf8(field.value);
        }
        break;
    }
  }

  return account;
}

function decodeEntitlementSource(value: number): ProEntitlementSource {
  switch (value) {
    case 1:
      return 'default';
    case 2:
      return 'admin';
    case 3:
      return 'app_store';
    default:
      return 'unspecified';
  }
}

function isBytes(field: Field): field is Field & {value: Uint8Array} {
  return field.wireType === 2 && typeof field.value !== 'number';
}

function stringField(fieldNumber: number, value: string): number[] {
  const bytes = encodeUtf8(value);
  return [
    ...encodeVarint((fieldNumber << 3) | 2),
    ...encodeVarint(bytes.length),
    ...bytes,
  ];
}

function encodeFields(fields: number[][]): Uint8Array {
  return Uint8Array.from(fields.flat());
}

function decodeFields(body: Uint8Array): Field[] {
  const fields: Field[] = [];
  let offset = 0;

  while (offset < body.length) {
    const key = readVarint(body, offset);
    offset = key.offset;
    const fieldNumber = key.value >> 3;
    const wireType = key.value & 0x07;

    switch (wireType) {
      case 0: {
        const value = readVarint(body, offset);
        offset = value.offset;
        fields.push({fieldNumber, wireType, value: value.value});
        break;
      }
      case 2: {
        const length = readVarint(body, offset);
        offset = length.offset;
        const end = offset + length.value;
        fields.push({
          fieldNumber,
          wireType,
          value: body.slice(offset, end),
        });
        offset = end;
        break;
      }
      default:
        throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }

  return fields;
}

function readVarint(body: Uint8Array, start: number) {
  let result = 0;
  let multiplier = 1;
  let offset = start;

  while (offset < body.length) {
    const byte = body[offset];
    result += (byte & 0x7f) * multiplier;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return {value: result, offset};
    }

    multiplier *= 128;
  }

  throw new Error('Truncated protobuf varint');
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;

  while (remaining > 127) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }

  bytes.push(remaining);
  return bytes;
}

function encodeUtf8(value: string): number[] {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < value.length
    ) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint =
          0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  let output = '';
  let offset = 0;

  while (offset < bytes.length) {
    const first = bytes[offset];

    if (first < 0x80) {
      output += String.fromCharCode(first);
      offset += 1;
    } else if ((first & 0xe0) === 0xc0) {
      const second = bytes[offset + 1];
      output += String.fromCharCode(
        ((first & 0x1f) << 6) | (second & 0x3f),
      );
      offset += 2;
    } else if ((first & 0xf0) === 0xe0) {
      const second = bytes[offset + 1];
      const third = bytes[offset + 2];
      output += String.fromCharCode(
        ((first & 0x0f) << 12) |
          ((second & 0x3f) << 6) |
          (third & 0x3f),
      );
      offset += 3;
    } else {
      const second = bytes[offset + 1];
      const third = bytes[offset + 2];
      const fourth = bytes[offset + 3];
      const codePoint =
        ((first & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      const adjusted = codePoint - 0x10000;
      output += String.fromCharCode(
        0xd800 + (adjusted >> 10),
        0xdc00 + (adjusted & 0x3ff),
      );
      offset += 4;
    }
  }

  return output;
}
