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

export type GetAccountResponse = {
  account?: ProAccountEntitlement;
};

export type SyncAppStoreTransactionResponse = {
  account?: ProAccountEntitlement;
};

export type CloudPdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CloudPdfPoint = {
  x: number;
  y: number;
};

export type CloudDocument = {
  id: string;
  title: string;
  author: string;
  pageCount: number;
  sizeBytes: number;
  progress: number;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string;
  tags: string[];
  collectionIds: string[];
  favorite: boolean;
  shared: boolean;
  thumbnailTone: string;
  versionLabel: string;
  revision?: number;
};

export type CloudAnnotation = {
  id: string;
  documentId: string;
  pageIndex: number;
  kind: string;
  color: string;
  bounds: CloudPdfRect;
  points?: CloudPdfPoint[];
  text?: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
};

export type CloudLibrarySnapshot = {
  documents: CloudDocument[];
  annotations: CloudAnnotation[];
  revision?: number;
  updatedAt?: string;
};

export type SyncLibraryResponse = {
  snapshot?: CloudLibrarySnapshot;
  account?: ProAccountEntitlement;
};

export type UploadDocumentContentResponse = {
  documentId: string;
  sizeBytes: number;
  account?: ProAccountEntitlement;
};

export type DownloadDocumentContentResponse = {
  documentId: string;
  data: Uint8Array;
  contentType: string;
  sizeBytes: number;
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

export function encodeGetAccountRequest(): Uint8Array {
  return new Uint8Array();
}

export function encodeSyncAppStoreTransactionRequest(
  signedTransactionJws: string,
): Uint8Array {
  return encodeFields([stringField(1, signedTransactionJws)]);
}

export function encodeSyncLibraryRequest(
  snapshot: CloudLibrarySnapshot,
): Uint8Array {
  return encodeFields([messageField(1, encodeCloudLibrarySnapshot(snapshot))]);
}

export function encodeUploadDocumentContentRequest(input: {
  documentId: string;
  data: Uint8Array;
  contentType: string;
}): Uint8Array {
  return encodeFields([
    stringField(1, input.documentId),
    bytesField(2, input.data),
    stringField(3, input.contentType),
  ]);
}

export function encodeDownloadDocumentContentRequest(
  documentId: string,
): Uint8Array {
  return encodeFields([stringField(1, documentId)]);
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

export function decodeGetAccountResponse(body: Uint8Array): GetAccountResponse {
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

export function decodeSyncLibraryResponse(
  body: Uint8Array,
): SyncLibraryResponse {
  const response: SyncLibraryResponse = {};

  for (const field of decodeFields(body)) {
    if (!isBytes(field)) {
      continue;
    }

    switch (field.fieldNumber) {
      case 1:
        response.snapshot = decodeCloudLibrarySnapshot(field.value);
        break;
      case 2:
        response.account = decodeAccountEntitlement(field.value);
        break;
    }
  }

  return response;
}

export function decodeUploadDocumentContentResponse(
  body: Uint8Array,
): UploadDocumentContentResponse {
  const response: UploadDocumentContentResponse = {
    documentId: '',
    sizeBytes: 0,
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          response.documentId = decodeUtf8(field.value);
        }
        break;
      case 2:
        if (typeof field.value === 'number') {
          response.sizeBytes = field.value;
        }
        break;
      case 3:
        if (isBytes(field)) {
          response.account = decodeAccountEntitlement(field.value);
        }
        break;
    }
  }

  return response;
}

export function decodeDownloadDocumentContentResponse(
  body: Uint8Array,
): DownloadDocumentContentResponse {
  const response: DownloadDocumentContentResponse = {
    documentId: '',
    data: new Uint8Array(),
    contentType: '',
    sizeBytes: 0,
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          response.documentId = decodeUtf8(field.value);
        }
        break;
      case 2:
        if (isBytes(field)) {
          response.data = field.value;
        }
        break;
      case 3:
        if (isBytes(field)) {
          response.contentType = decodeUtf8(field.value);
        }
        break;
      case 4:
        if (typeof field.value === 'number') {
          response.sizeBytes = field.value;
        }
        break;
    }
  }

  return response;
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

function encodeCloudLibrarySnapshot(snapshot: CloudLibrarySnapshot): number[] {
  return [
    ...snapshot.documents.map(document =>
      messageField(1, encodeCloudDocument(document)),
    ).flat(),
    ...snapshot.annotations.map(annotation =>
      messageField(2, encodeCloudAnnotation(annotation)),
    ).flat(),
    ...(snapshot.revision !== undefined
      ? varintField(3, snapshot.revision)
      : []),
    ...(snapshot.updatedAt ? stringField(4, snapshot.updatedAt) : []),
  ];
}

function encodeCloudDocument(document: CloudDocument): number[] {
  return [
    ...stringField(1, document.id),
    ...stringField(2, document.title),
    ...stringField(3, document.author),
    ...varintField(4, document.pageCount),
    ...varintField(5, document.sizeBytes),
    ...varintField(6, Math.round(document.progress * 1000)),
    ...stringField(7, document.createdAt),
    ...stringField(8, document.modifiedAt),
    ...stringField(9, document.lastOpenedAt),
    ...document.tags.map(tag => stringField(10, tag)).flat(),
    ...document.collectionIds.map(id => stringField(11, id)).flat(),
    ...varintField(12, document.favorite ? 1 : 0),
    ...varintField(13, document.shared ? 1 : 0),
    ...stringField(14, document.thumbnailTone),
    ...stringField(15, document.versionLabel),
    ...(document.revision !== undefined
      ? varintField(16, document.revision)
      : []),
  ];
}

function encodeCloudAnnotation(annotation: CloudAnnotation): number[] {
  return [
    ...stringField(1, annotation.id),
    ...stringField(2, annotation.documentId),
    ...varintField(3, annotation.pageIndex),
    ...stringField(4, annotation.kind),
    ...stringField(5, annotation.color),
    ...messageField(6, encodeCloudPdfRect(annotation.bounds)),
    ...(annotation.points ?? [])
      .map(point => messageField(7, encodeCloudPdfPoint(point)))
      .flat(),
    ...(annotation.text ? stringField(8, annotation.text) : []),
    ...stringField(9, annotation.createdAt),
    ...stringField(10, annotation.updatedAt),
    ...(annotation.revision !== undefined
      ? varintField(11, annotation.revision)
      : []),
  ];
}

function encodeCloudPdfRect(rect: CloudPdfRect): number[] {
  return [
    ...varintField(1, milli(rect.x)),
    ...varintField(2, milli(rect.y)),
    ...varintField(3, milli(rect.width)),
    ...varintField(4, milli(rect.height)),
  ];
}

function encodeCloudPdfPoint(point: CloudPdfPoint): number[] {
  return [
    ...varintField(1, milli(point.x)),
    ...varintField(2, milli(point.y)),
  ];
}

function decodeCloudLibrarySnapshot(body: Uint8Array): CloudLibrarySnapshot {
  const snapshot: CloudLibrarySnapshot = {
    documents: [],
    annotations: [],
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          snapshot.documents.push(decodeCloudDocument(field.value));
        }
        break;
      case 2:
        if (isBytes(field)) {
          snapshot.annotations.push(decodeCloudAnnotation(field.value));
        }
        break;
      case 3:
        if (typeof field.value === 'number') {
          snapshot.revision = field.value;
        }
        break;
      case 4:
        if (isBytes(field)) {
          snapshot.updatedAt = decodeUtf8(field.value);
        }
        break;
    }
  }

  return snapshot;
}

function decodeCloudDocument(body: Uint8Array): CloudDocument {
  const document: CloudDocument = {
    id: '',
    title: '',
    author: '',
    pageCount: 0,
    sizeBytes: 0,
    progress: 0,
    createdAt: '',
    modifiedAt: '',
    lastOpenedAt: '',
    tags: [],
    collectionIds: [],
    favorite: false,
    shared: false,
    thumbnailTone: '',
    versionLabel: '',
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          document.id = decodeUtf8(field.value);
        }
        break;
      case 2:
        if (isBytes(field)) {
          document.title = decodeUtf8(field.value);
        }
        break;
      case 3:
        if (isBytes(field)) {
          document.author = decodeUtf8(field.value);
        }
        break;
      case 4:
        if (typeof field.value === 'number') {
          document.pageCount = field.value;
        }
        break;
      case 5:
        if (typeof field.value === 'number') {
          document.sizeBytes = field.value;
        }
        break;
      case 6:
        if (typeof field.value === 'number') {
          document.progress = field.value / 1000;
        }
        break;
      case 7:
        if (isBytes(field)) {
          document.createdAt = decodeUtf8(field.value);
        }
        break;
      case 8:
        if (isBytes(field)) {
          document.modifiedAt = decodeUtf8(field.value);
        }
        break;
      case 9:
        if (isBytes(field)) {
          document.lastOpenedAt = decodeUtf8(field.value);
        }
        break;
      case 10:
        if (isBytes(field)) {
          document.tags.push(decodeUtf8(field.value));
        }
        break;
      case 11:
        if (isBytes(field)) {
          document.collectionIds.push(decodeUtf8(field.value));
        }
        break;
      case 12:
        if (typeof field.value === 'number') {
          document.favorite = field.value !== 0;
        }
        break;
      case 13:
        if (typeof field.value === 'number') {
          document.shared = field.value !== 0;
        }
        break;
      case 14:
        if (isBytes(field)) {
          document.thumbnailTone = decodeUtf8(field.value);
        }
        break;
      case 15:
        if (isBytes(field)) {
          document.versionLabel = decodeUtf8(field.value);
        }
        break;
      case 16:
        if (typeof field.value === 'number') {
          document.revision = field.value;
        }
        break;
    }
  }

  return document;
}

function decodeCloudAnnotation(body: Uint8Array): CloudAnnotation {
  const annotation: CloudAnnotation = {
    id: '',
    documentId: '',
    pageIndex: 0,
    kind: '',
    color: '',
    bounds: {x: 0, y: 0, width: 0, height: 0},
    points: [],
    text: '',
    createdAt: '',
    updatedAt: '',
  };

  for (const field of decodeFields(body)) {
    switch (field.fieldNumber) {
      case 1:
        if (isBytes(field)) {
          annotation.id = decodeUtf8(field.value);
        }
        break;
      case 2:
        if (isBytes(field)) {
          annotation.documentId = decodeUtf8(field.value);
        }
        break;
      case 3:
        if (typeof field.value === 'number') {
          annotation.pageIndex = field.value;
        }
        break;
      case 4:
        if (isBytes(field)) {
          annotation.kind = decodeUtf8(field.value);
        }
        break;
      case 5:
        if (isBytes(field)) {
          annotation.color = decodeUtf8(field.value);
        }
        break;
      case 6:
        if (isBytes(field)) {
          annotation.bounds = decodeCloudPdfRect(field.value);
        }
        break;
      case 7:
        if (isBytes(field)) {
          annotation.points?.push(decodeCloudPdfPoint(field.value));
        }
        break;
      case 8:
        if (isBytes(field)) {
          annotation.text = decodeUtf8(field.value);
        }
        break;
      case 9:
        if (isBytes(field)) {
          annotation.createdAt = decodeUtf8(field.value);
        }
        break;
      case 10:
        if (isBytes(field)) {
          annotation.updatedAt = decodeUtf8(field.value);
        }
        break;
      case 11:
        if (typeof field.value === 'number') {
          annotation.revision = field.value;
        }
        break;
    }
  }

  return annotation;
}

function decodeCloudPdfRect(body: Uint8Array): CloudPdfRect {
  const rect: CloudPdfRect = {x: 0, y: 0, width: 0, height: 0};

  for (const field of decodeFields(body)) {
    if (typeof field.value !== 'number') {
      continue;
    }
    switch (field.fieldNumber) {
      case 1:
        rect.x = field.value / 1000;
        break;
      case 2:
        rect.y = field.value / 1000;
        break;
      case 3:
        rect.width = field.value / 1000;
        break;
      case 4:
        rect.height = field.value / 1000;
        break;
    }
  }

  return rect;
}

function decodeCloudPdfPoint(body: Uint8Array): CloudPdfPoint {
  const point: CloudPdfPoint = {x: 0, y: 0};

  for (const field of decodeFields(body)) {
    if (typeof field.value !== 'number') {
      continue;
    }
    switch (field.fieldNumber) {
      case 1:
        point.x = field.value / 1000;
        break;
      case 2:
        point.y = field.value / 1000;
        break;
    }
  }

  return point;
}

function isBytes(field: Field): field is Field & {value: Uint8Array} {
  return field.wireType === 2 && typeof field.value !== 'number';
}

function milli(value: number): number {
  return Math.max(0, Math.round(value * 1000));
}

function stringField(fieldNumber: number, value: string): number[] {
  const bytes = encodeUtf8(value);
  return [
    ...encodeVarint((fieldNumber << 3) | 2),
    ...encodeVarint(bytes.length),
    ...bytes,
  ];
}

function bytesField(fieldNumber: number, bytes: Uint8Array): number[] {
  return [
    ...encodeVarint((fieldNumber << 3) | 2),
    ...encodeVarint(bytes.length),
    ...Array.from(bytes),
  ];
}

function messageField(fieldNumber: number, value: number[]): number[] {
  return [
    ...encodeVarint((fieldNumber << 3) | 2),
    ...encodeVarint(value.length),
    ...value,
  ];
}

function varintField(fieldNumber: number, value: number): number[] {
  return [...encodeVarint((fieldNumber << 3) | 0), ...encodeVarint(value)];
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
