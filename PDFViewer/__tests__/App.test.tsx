/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the PDF library shell with core document workflows', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Library');
  expect(output).toContain('Continue Reading');
  expect(output).toContain('Recent Documents');
  expect(output).toContain('Q4 Market Analysis Report');
  expect(output).toContain('Open File');
  expect(output).toContain('Compare');
});

test('opens the first matching search result from the inspector', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const searchInput = renderer!.root.findByProps({
    testID: 'library-search-input',
  });

  await ReactTestRenderer.act(() => {
    searchInput.props.onChangeText('roadmap');
  });

  const openAction = renderer!.root.findByProps({
    testID: 'inspector-open-action',
  });

  await ReactTestRenderer.act(() => {
    openAction.props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Product Roadmap 2025');
});

test('opens directly into the viewer info screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="viewer-info" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Q4 Market Analysis Report');
  expect(output).toContain('Page 8 of 32');
  expect(output).toContain('Info');
});

test('opens directly into the comments screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="comments" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Future of Work Report');
  expect(output).toContain('Page 12 of 32');
  expect(output).toContain('Comments');
});

test('opens directly into the compare screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="compare" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Compare screen Q4 Market Analysis Report');
  expect(output).toContain('Changes panel');
  expect(output).toContain('Added');
  expect(output).toContain('Page 8 of 32');
});
