import {NativeModules} from 'react-native';
import type {Annotation, CompareSummary, DocumentRecord} from '../domain/types';

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
  loadDocumentMetadata?: (path: string) => Promise<ImportedPdf>;
  search?: (
    path: string,
    bookmark: string,
    query: string,
  ) => Promise<Array<{pageIndex: number; snippet: string}>>;
  exportPageImage?: (
    path: string,
    bookmark: string,
    pageIndex: number,
    format: 'png' | 'jpg',
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
  compareDocuments?: (
    leftPath: string,
    rightPath: string,
  ) => Promise<CompareSummary>;
  readSidecar?: (documentId: string) => Promise<string | undefined>;
  writeSidecar?: (documentId: string, value: string) => Promise<boolean>;
};

const nativeBridge = NativeModules.PdfKitBridge as
  | NativePdfKitBridge
  | undefined;

export const PdfKitBridge = {
  async openPdf() {
    return nativeBridge?.openPdf?.();
  },

  async loadDocumentMetadata(path: string) {
    return nativeBridge?.loadDocumentMetadata?.(path);
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
