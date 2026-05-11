import type {Annotation, AnnotationSidecar, CommentThread} from './types';

type AnnotationInput = Omit<Annotation, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

type CommentThreadInput = CommentThread;

export function createAnnotation(input: AnnotationInput): Annotation {
  const timestamp = input.createdAt ?? new Date().toISOString();

  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

export function createCommentThread(
  input: CommentThreadInput,
): CommentThread {
  return input;
}

export function serializeAnnotationSidecar(
  sidecar: Omit<AnnotationSidecar, 'schemaVersion'> & {schemaVersion?: 1},
): string {
  return `${JSON.stringify({...sidecar, schemaVersion: 1}, null, 2)}\n`;
}

export function deserializeAnnotationSidecar(value: string): AnnotationSidecar {
  const parsed = JSON.parse(value) as AnnotationSidecar;

  if (parsed.schemaVersion !== 1) {
    throw new Error('Unsupported annotation sidecar schema');
  }

  return parsed;
}
