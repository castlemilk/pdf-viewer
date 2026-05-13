import React from 'react';
import {StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {PdfCanvas} from '../src/components/PdfCanvas';
import {createInitialViewerState} from '../src/domain';
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

  const viewport = renderer!.root.findByProps({testID: 'pdf-canvas-viewport'});
  expect(StyleSheet.flatten(viewport.props.style)).toEqual(
    expect.objectContaining({
      flex: 1,
      width: '100%',
      minHeight: 0,
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'hidden',
    }),
  );

  await ReactTestRenderer.act(() => {
    canvas.props.onLayout({
      nativeEvent: {layout: {width: 760, height: 580}},
    });
  });

  const page = renderer!.root.findByProps({testID: 'pdf-canvas-page'});
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
