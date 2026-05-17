import React from 'react';
import {StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {PdfCanvas} from '../src/components/PdfCanvas';
import {
  annotationBoundsForPageGesture,
  canonicalInkPathForPagePoints,
  createInitialViewerState,
} from '../src/domain';
import {demoDocuments} from '../src/domain/fixtures';

test('fallback PDF canvas fits inside the desktop reader viewport', async () => {
  const document = demoDocuments[0];
  const viewer = createInitialViewerState(document.id, document.pageCount);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas document={document} viewer={viewer} annotations={[]} />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  expect(StyleSheet.flatten(canvas.props.style)).toEqual(
    expect.objectContaining({
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden',
    }),
  );

  const scroll = renderer!.root.findByProps({testID: 'pdf-demo-scroll'});
  expect(StyleSheet.flatten(scroll.props.style)).toEqual(
    expect.objectContaining({
      flex: 1,
      width: '100%',
    }),
  );

  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const page = renderer!.root.findByProps({testID: 'pdf-demo-page-1'});
  const pageStyle = StyleSheet.flatten(page.props.style);
  expect(pageStyle).toEqual(
    expect.objectContaining({
      aspectRatio: 0.707,
      overflow: 'hidden',
      width: 376,
      padding: 42,
    }),
  );
  expect(pageStyle.minHeight).toBeUndefined();

  const chart = renderer!.root.findByProps({testID: 'pdf-canvas-chart'});
  expect(StyleSheet.flatten(chart.props.style)).toEqual(
    expect.objectContaining({
      height: 132,
      marginBottom: 16,
    }),
  );

  const donut = renderer!.root.findByProps({testID: 'pdf-canvas-donut'});
  expect(StyleSheet.flatten(donut.props.style)).toEqual(
    expect.objectContaining({
      width: 96,
      height: 96,
    }),
  );
});

test('fallback PDF canvas positions annotations from canonical page coordinates', async () => {
  const document = demoDocuments[0];
  const viewer = createInitialViewerState(document.id, document.pageCount);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[
          {
            id: 'test-highlight',
            documentId: document.id,
            pageIndex: 0,
            kind: 'highlight',
            color: '#F7D64A',
            bounds: {x: 138, y: 250, width: 310, height: 24},
            text: 'A precisely placed highlight',
            createdAt: '2026-05-11T08:00:00.000Z',
            updatedAt: '2026-05-11T08:00:00.000Z',
          },
        ]}
      />,
    );
  });

  const highlight = renderer!.root.findByProps({
    testID: 'pdf-annotation-test-highlight',
  });

  expect(StyleSheet.flatten(highlight.props.style)).toEqual(
    expect.objectContaining({
      left: '23.1933%',
      top: '29.6912%',
      width: '52.1008%',
      height: '2.8504%',
      backgroundColor: '#F7D64A',
    }),
  );
});

test('fallback PDF canvas renders transient search highlights separately from annotations', async () => {
  const document = demoDocuments[0];
  const viewer = createInitialViewerState(document.id, document.pageCount);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        searchHighlights={[
          {
            id: 'match-1',
            pageIndex: 0,
            bounds: {x: 128, y: 240, width: 220, height: 22},
          },
        ]}
      />,
    );
  });

  const highlight = renderer!.root.findByProps({
    testID: 'pdf-search-highlight-match-1',
  });

  expect(StyleSheet.flatten(highlight.props.style)).toEqual(
    expect.objectContaining({
      left: '21.5126%',
      top: '28.5036%',
      width: '36.9748%',
      height: '2.6128%',
      backgroundColor: 'rgba(247, 214, 74, 0.58)',
    }),
  );
});

test('fallback PDF canvas creates drag-sized highlight bounds', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'highlight' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-canvas-fallback'}).props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const page = renderer!.root.findByProps({testID: 'pdf-demo-page-1'});
  const hitbox = renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'});
  const pageStyle = StyleSheet.flatten(page.props.style);
  await ReactTestRenderer.act(() => {
    hitbox.props.onResponderGrant({
      nativeEvent: {locationX: 100, locationY: 120},
    });
    hitbox.props.onResponderRelease({
      nativeEvent: {locationX: 220, locationY: 145},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith({
    kind: 'highlight',
    pageIndex: 0,
    bounds: annotationBoundsForPageGesture({
      kind: 'highlight',
      pageSize: {
        width: pageStyle.width,
        height: pageStyle.width / 0.707,
      },
      start: {x: 100, y: 120},
      end: {x: 220, y: 145},
    }),
  });
  expect(onCreateAnnotation.mock.calls[0][0].bounds.width).toBeGreaterThan(160);
});

test('fallback PDF canvas previews the active signature at the pointer before stamping', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'signature' as const,
  };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        signaturePreviewText="Ben Ebsworth"
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const hitbox = renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'});
  await ReactTestRenderer.act(() => {
    hitbox.props.onResponderGrant({
      nativeEvent: {locationX: 210, locationY: 320},
    });
    hitbox.props.onResponderMove({
      nativeEvent: {locationX: 240, locationY: 340},
    });
  });

  const preview = renderer!.root.findByProps({
    testID: 'pdf-signature-preview',
  });

  expect(preview.props.children.props.children).toBe('Ben Ebsworth');
  expect(StyleSheet.flatten(preview.props.style)).toEqual(
    expect.objectContaining({
      left: 186,
      top: 316,
    }),
  );
});

test('fallback PDF canvas maps zoomed visual highlight gestures back to page coordinates', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'highlight' as const,
    zoom: 1.5,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-canvas-fallback'}).props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const page = renderer!.root.findByProps({testID: 'pdf-demo-page-1'});
  const hitbox = renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'});
  const pageStyle = StyleSheet.flatten(page.props.style);
  await ReactTestRenderer.act(() => {
    hitbox.props.onResponderGrant({
      nativeEvent: {locationX: 150, locationY: 210},
    });
    hitbox.props.onResponderRelease({
      nativeEvent: {locationX: 450, locationY: 214},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith({
    kind: 'highlight',
    pageIndex: 0,
    bounds: annotationBoundsForPageGesture({
      kind: 'highlight',
      pageSize: {
        width: pageStyle.width,
        height: pageStyle.width / 0.707,
      },
      start: {x: 100, y: 140},
      end: {x: 300, y: 142.66666666666666},
    }),
  });
});

test('fallback PDF canvas disables scrolling while a markup tool is active', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'highlight' as const,
  };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas document={document} viewer={viewer} annotations={[]} />,
    );
  });

  expect(renderer!.root.findByProps({testID: 'pdf-demo-scroll'}).props.scrollEnabled).toBe(false);
});

test('fallback PDF canvas scrolls demo pages without reflowing page layout on zoom', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    zoom: 1.4,
  };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas document={document} viewer={viewer} annotations={[]} />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});

  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  expect(renderer!.root.findByProps({testID: 'pdf-demo-scroll'})).toBeTruthy();
  expect(renderer!.root.findByProps({testID: 'pdf-demo-page-1'})).toBeTruthy();
  expect(renderer!.root.findByProps({testID: 'pdf-demo-page-2'})).toBeTruthy();

  const page = renderer!.root.findByProps({testID: 'pdf-demo-page-1'});
  const pageStyle = StyleSheet.flatten(page.props.style);
  expect(pageStyle.width).toBe(376);

  const scaledFrame = renderer!.root.findByProps({
    testID: 'pdf-demo-page-frame-1',
  });
  const frameStyle = StyleSheet.flatten(scaledFrame.props.style);
  expect(frameStyle.width).toBe(526.4);
  expect(frameStyle.height).toBeCloseTo(744.5545, 3);
});

test('fallback PDF canvas exposes demo page text as selectable content', async () => {
  const document = demoDocuments[0];
  const viewer = createInitialViewerState(document.id, document.pageCount);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas document={document} viewer={viewer} annotations={[]} />,
    );
  });

  expect(
    renderer!.root.findByProps({testID: 'pdf-demo-title-1'}).props.selectable,
  ).toBe(true);
  expect(
    renderer!.root.findByProps({testID: 'pdf-demo-body-1'}).props.selectable,
  ).toBe(true);
});

test('fallback PDF canvas creates highlight annotations at the clicked page position', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'highlight' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 190, locationY: 260},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'highlight',
      pageIndex: 0,
      bounds: expect.objectContaining({
        x: 221,
        y: 400,
        width: 160,
        height: 24,
      }),
    }),
  );
});

test('fallback PDF canvas creates signature stamps from the clicked page position', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'signature' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  expect(renderer!.root.findByProps({testID: 'pdf-tool-hint'})).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 210, locationY: 320},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'signature',
      pageIndex: 0,
      bounds: {
        x: 351,
        y: 483,
        width: 180,
        height: 48,
      },
    }),
  );
});

test('fallback PDF canvas creates note annotations from the clicked page position', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'comment' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 210, locationY: 320},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'note',
      pageIndex: 0,
      bounds: {
        x: 237,
        y: 480,
        width: 190,
        height: 54,
      },
    }),
  );
});

test('fallback PDF canvas creates drawing annotations from the clicked page position', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'pen' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 210, locationY: 320},
    });
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'drawing',
      pageIndex: 0,
      bounds: {
        x: 272,
        y: 467,
        width: 120,
        height: 80,
      },
    }),
  );
});

test('fallback PDF canvas creates freehand drawing paths from pen drags', async () => {
  const document = demoDocuments[0];
  const viewer = {
    ...createInitialViewerState(document.id, document.pageCount),
    activeTool: 'pen' as const,
  };
  const onCreateAnnotation = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PdfCanvas
        document={document}
        viewer={viewer}
        annotations={[]}
        onCreateAnnotation={onCreateAnnotation}
      />,
    );
  });

  const canvas = renderer!.root.findByProps({testID: 'pdf-canvas-fallback'});
  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const hitbox = renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'});
  const page = renderer!.root.findByProps({testID: 'pdf-demo-page-1'});
  const pageStyle = StyleSheet.flatten(page.props.style);
  await ReactTestRenderer.act(() => {
    hitbox.props.onResponderGrant({
      nativeEvent: {locationX: 180, locationY: 220},
    });
    hitbox.props.onResponderMove({
      nativeEvent: {locationX: 220, locationY: 245},
    });
    hitbox.props.onResponderMove({
      nativeEvent: {locationX: 265, locationY: 230},
    });
    hitbox.props.onResponderRelease({
      nativeEvent: {locationX: 310, locationY: 260},
    });
  });

  const expectedPoints = canonicalInkPathForPagePoints({
    pageSize: {
      width: pageStyle.width,
      height: pageStyle.width / 0.707,
    },
    points: [
      {x: 180, y: 220},
      {x: 220, y: 245},
      {x: 265, y: 230},
      {x: 310, y: 260},
    ],
  });

  expect(onCreateAnnotation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'drawing',
      pageIndex: 0,
      points: expectedPoints,
      bounds: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    }),
  );
});
