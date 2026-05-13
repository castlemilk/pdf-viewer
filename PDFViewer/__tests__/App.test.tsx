/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

function pressSidebarItem(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const navId = `nav-${label.toLowerCase()}`;
  const navItem = renderer.root.findByProps({testID: navId});

  navItem.props.onPress();
}

function visibleGridDocumentIds(renderer: ReactTestRenderer.ReactTestRenderer) {
  const grid = renderer.root.findByProps({testID: 'recent-grid'});

  return Array.from(
    new Set(
      grid
        .findAll(
          instance =>
            typeof instance.props.testID === 'string' &&
            instance.props.testID.startsWith('doc-card-'),
        )
        .map(instance => instance.props.testID),
    ),
  );
}

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

test('renders a compact mobile shell when requested', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('mobile-library-screen');
  expect(JSON.stringify(renderer?.toJSON())).toContain('Acacia');

  const documentRow = renderer!.root.findByProps({
    testID: 'mobile-doc-row-q4-market-analysis',
  });

  await ReactTestRenderer.act(() => {
    documentRow.props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('mobile-viewer-screen');
  expect(output).toContain('Page 1 of 32');
  expect(output).toContain('Highlight');
});

test('mobile viewer controls page, zoom, and highlight state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-page-next'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 2 of 32');
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-label'}).props.children,
  ).toEqual([2, ' / ', 32]);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-page-previous'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 1 of 32');
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-label'}).props.children,
  ).toEqual([1, ' / ', 32]);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-zoom-in'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'mobile-zoom-label'}).props.children,
  ).toEqual([110, '%']);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Comments');
  expect(output).toContain('Local non-destructive highlight');
  expect(output).toContain('comment-item-local-highlight');
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

test('desktop document clicks open the reader and controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Viewer screen Q4 Market Analysis Report',
  );
  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 1 of 32');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-page-next'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 2 of 32');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-zoom-in'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'viewer-zoom-label'}).props.children,
  ).toEqual([110, '%']);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-highlight'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Comments');
  expect(output).toContain('Local non-destructive highlight');
});

test('desktop library view mode toggle swaps recent documents between grid and list', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('recent-grid');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'view-mode-list'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('recent-table');
  expect(output).toContain('doc-row-q4-market-analysis');
});

test('desktop library favorite, sort, and filter controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-favorite-action'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Remove Favorite');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'sort-last-opened-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Sort: Modified');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'library-search-input'})
      .props.onChangeText('roadmap');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Product Roadmap 2025');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'filter-button'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'library-search-input'}).props.value,
  ).toBe('');
});

test('desktop sidebar scopes recent favorite and shared documents', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Favorites');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Favorite Documents');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-product-roadmap',
    'doc-card-future-work',
  ]);

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Shared');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Shared Documents');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-competitive-landscape',
    'doc-card-board-minutes-apr',
  ]);

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Recent');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Recently Opened');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-q4-market-analysis',
    'doc-card-competitive-landscape',
    'doc-card-product-roadmap',
    'doc-card-annual-financial-report',
    'doc-card-future-work',
  ]);
});

test('desktop viewer bookmark and compare sync controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-bookmark'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Bookmark on page 1');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-compare-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Sync On');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'sync-scroll-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Sync Off');
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
