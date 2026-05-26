import {
  decodeErrorResponse,
  decodeGetAccountResponse,
  decodeGetPurchaseContextResponse,
  decodeDownloadDocumentContentResponse,
  decodeSyncLibraryResponse,
  decodeSyncAppStoreTransactionResponse,
  decodeUploadDocumentContentResponse,
  encodeDownloadDocumentContentRequest,
  encodeGetAccountRequest,
  encodeGetPurchaseContextRequest,
  encodeSyncLibraryRequest,
  encodeSyncAppStoreTransactionRequest,
  encodeUploadDocumentContentRequest,
  PROTOBUF_CONTENT_TYPE,
  type CloudLibrarySnapshot,
  type DownloadDocumentContentResponse,
  type GetAccountResponse,
  type GetPurchaseContextResponse,
  type SyncLibraryResponse,
  type SyncAppStoreTransactionResponse,
  type UploadDocumentContentResponse,
} from './protobuf';

type FetchImpl = typeof fetch;

export class ProBackendError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ProBackendError';
    this.code = code;
    this.status = status;
  }
}

export type ProBackendClientConfig = {
  baseUrl: string;
  fetchImpl?: FetchImpl;
};

export class ProBackendClient {
  private readonly baseUrl: string;
  private readonly fetchImpl?: FetchImpl;

  constructor(config: ProBackendClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  async getAccount(firebaseIDToken: string): Promise<GetAccountResponse> {
    return this.postProtobuf(
      '/v1/account:get',
      firebaseIDToken,
      encodeGetAccountRequest(),
      decodeGetAccountResponse,
    );
  }

  async getPurchaseContext(
    firebaseIDToken: string,
  ): Promise<GetPurchaseContextResponse> {
    return this.postProtobuf(
      '/v1/account:purchaseContext',
      firebaseIDToken,
      encodeGetPurchaseContextRequest(),
      decodeGetPurchaseContextResponse,
    );
  }

  async syncAppStoreTransaction(
    firebaseIDToken: string,
    signedTransactionJws: string,
  ): Promise<SyncAppStoreTransactionResponse> {
    return this.postProtobuf(
      '/v1/app_store/transactions:sync',
      firebaseIDToken,
      encodeSyncAppStoreTransactionRequest(signedTransactionJws),
      decodeSyncAppStoreTransactionResponse,
    );
  }

  async syncLibrary(
    firebaseIDToken: string,
    snapshot: CloudLibrarySnapshot,
  ): Promise<SyncLibraryResponse> {
    return this.postProtobuf(
      '/v1/library:sync',
      firebaseIDToken,
      encodeSyncLibraryRequest(snapshot),
      decodeSyncLibraryResponse,
    );
  }

  async uploadDocumentContent(
    firebaseIDToken: string,
    input: {
      documentId: string;
      data: Uint8Array;
      contentType: string;
    },
  ): Promise<UploadDocumentContentResponse> {
    return this.postProtobuf(
      '/v1/documents/content:upload',
      firebaseIDToken,
      encodeUploadDocumentContentRequest(input),
      decodeUploadDocumentContentResponse,
    );
  }

  async downloadDocumentContent(
    firebaseIDToken: string,
    documentId: string,
  ): Promise<DownloadDocumentContentResponse> {
    return this.postProtobuf(
      '/v1/documents/content:download',
      firebaseIDToken,
      encodeDownloadDocumentContentRequest(documentId),
      decodeDownloadDocumentContentResponse,
    );
  }

  private async postProtobuf<T>(
    path: string,
    firebaseIDToken: string,
    body: Uint8Array,
    decode: (body: Uint8Array) => T,
  ): Promise<T> {
    if (!this.fetchImpl) {
      throw new ProBackendError(
        'network_unavailable',
        'Network requests are not available in this build.',
        0,
      );
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firebaseIDToken}`,
        'Content-Type': PROTOBUF_CONTENT_TYPE,
        Accept: PROTOBUF_CONTENT_TYPE,
      },
      body: body as unknown as RequestInit['body'],
    });
    const responseBody = new Uint8Array(await response.arrayBuffer());

    if (!response.ok) {
      const error = decodeErrorResponse(responseBody);
      throw new ProBackendError(
        error.code || 'http_error',
        error.message || `Request failed with status ${response.status}`,
        response.status,
      );
    }

    return decode(responseBody);
  }
}
