import {
  type EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';
import type {Annotation, CompareSummary, DocumentRecord, PdfRect} from '../domain/types';

export type ImportedPdf = {
  id: string;
  title: string;
  author: string;
  pageCount: number;
  sizeMb: number;
  createdAt: string;
  modifiedAt: string;
  path: string;
  bookmark: string;
};

type NativePdfKitBridge = {
  openPdf?: () => Promise<ImportedPdf | undefined>;
  seedDemoPdfs?: () => Promise<ImportedPdf[]>;
  loadDocumentMetadata?: (path: string) => Promise<ImportedPdf>;
  readDocumentBase64?: (path: string, bookmark: string) => Promise<string>;
  search?: (
    path: string,
    bookmark: string,
    query: string,
  ) => Promise<Array<{pageIndex: number; snippet: string; bounds?: PdfRect[]}>>;
  exportPageImage?: (
    path: string,
    bookmark: string,
    pageIndex: number,
    format: 'png' | 'jpg',
  ) => Promise<string>;
  renderPageThumbnail?: (
    path: string,
    bookmark: string,
    pageIndex: number,
    documentId: string,
  ) => Promise<string>;
  exportPageText?: (
    path: string,
    bookmark: string,
    pageIndex: number,
  ) => Promise<string>;
  exportAnnotatedCopy?: (
    path: string,
    bookmark: string,
    annotations: Annotation[],
  ) => Promise<string>;
  exportMarkdown?: (
    path: string,
    bookmark: string,
  ) => Promise<string>;
  compareDocuments?: (
    leftPath: string,
    rightPath: string,
  ) => Promise<CompareSummary>;
  readSidecar?: (documentId: string) => Promise<string | undefined>;
  writeSidecar?: (documentId: string, value: string) => Promise<boolean>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

const nativeBridge = NativeModules.PdfKitBridge as
  | NativePdfKitBridge
  | undefined;

export const PdfKitBridge = {
  async openPdf() {
    return nativeBridge?.openPdf?.();
  },

  async seedDemoPdfs() {
    return nativeBridge?.seedDemoPdfs?.() ?? [];
  },

  addOpenedPdfListener(
    listener: (imported: ImportedPdf) => void,
  ): EmitterSubscription | undefined {
    if (!nativeBridge) {
      return undefined;
    }

    const emitter = new NativeEventEmitter(nativeBridge as any);
    return emitter.addListener('AcaciaPdfOpenedFromMenu', listener);
  },

  async loadDocumentMetadata(path: string) {
    return nativeBridge?.loadDocumentMetadata?.(path);
  },

  async readDocumentBase64(path: string, bookmark = '') {
    return nativeBridge?.readDocumentBase64?.(path, bookmark);
  },

  async search(path: string, query: string, bookmark = '') {
    return nativeBridge?.search?.(path, bookmark, query) ?? [];
  },

  async exportPageImage(
    path: string,
    pageIndex: number,
    bookmark = '',
    format: 'png' | 'jpg' = 'png',
  ) {
    return nativeBridge?.exportPageImage?.(path, bookmark, pageIndex, format);
  },

  async renderPageThumbnail(
    path: string,
    pageIndex: number,
    bookmark = '',
    documentId = 'document',
  ) {
    return nativeBridge?.renderPageThumbnail?.(
      path,
      bookmark,
      pageIndex,
      documentId,
    );
  },

  async exportPageText(path: string, pageIndex: number, bookmark = '') {
    return nativeBridge?.exportPageText?.(path, bookmark, pageIndex);
  },

  async exportAnnotatedCopy(
    path: string,
    annotations: Annotation[],
    bookmark = '',
  ) {
    return nativeBridge?.exportAnnotatedCopy?.(path, bookmark, annotations);
  },

  async exportMarkdown(path: string, bookmark = '') {
    return nativeBridge?.exportMarkdown?.(path, bookmark);
  },

  async compareDocuments(leftPath: string, rightPath: string) {
    return nativeBridge?.compareDocuments?.(leftPath, rightPath);
  },

  async readSidecar(documentId: string) {
    return nativeBridge?.readSidecar?.(documentId);
  },

  async writeSidecar(documentId: string, value: string) {
    return nativeBridge?.writeSidecar?.(documentId, value) ?? false;
  },
};

export function importedPdfToDocument(imported: ImportedPdf): DocumentRecord {
  return {
    id: imported.id,
    title: imported.title,
    author: imported.author || 'Local Document',
    kind: 'pdf',
    pageCount: imported.pageCount,
    sizeMb: imported.sizeMb,
    progress: 0,
    createdAt: imported.createdAt,
    modifiedAt: imported.modifiedAt,
    lastOpenedAt: new Date().toISOString(),
    tags: ['work'],
    collectionIds: ['archive'],
    favorite: false,
    shared: false,
    thumbnailTone: 'paper',
    path: imported.path,
    bookmark: imported.bookmark,
  };
}
