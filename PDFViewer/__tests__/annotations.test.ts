import {
  createAnnotation,
  createCommentThread,
  deserializeAnnotationSidecar,
  serializeAnnotationSidecar,
} from '../src/domain/annotations';

describe('annotation sidecars', () => {
  it('serializes annotations and comments as non-destructive sidecar metadata', () => {
    const annotation = createAnnotation({
      id: 'highlight-1',
      documentId: 'future-work',
      pageIndex: 11,
      kind: 'highlight',
      color: '#F8D34B',
      bounds: {x: 122, y: 252, width: 318, height: 24},
      text: 'The hybrid model is no longer an experiment',
    });
    const thread = createCommentThread({
      id: 'thread-1',
      documentId: 'future-work',
      pageIndex: 11,
      anchorAnnotationId: annotation.id,
      comments: [
        {
          id: 'comment-1',
          author: 'Olivia Harper',
          body: 'Great point. This is a key takeaway.',
          createdAt: '2026-05-11T08:00:00.000Z',
        },
      ],
    });

    const serialized = serializeAnnotationSidecar({
      documentId: 'future-work',
      sourceFingerprint: 'sha256-fixture',
      annotations: [annotation],
      commentThreads: [thread],
    });
    const parsed = deserializeAnnotationSidecar(serialized);

    expect(serialized).toContain('"sourceFingerprint": "sha256-fixture"');
    expect(parsed.annotations[0]).toEqual(annotation);
    expect(parsed.commentThreads[0].comments[0].body).toBe(
      'Great point. This is a key takeaway.',
    );
  });
});
