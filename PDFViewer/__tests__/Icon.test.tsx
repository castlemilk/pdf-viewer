import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {ICON_PATHS, Icon} from '../src/components/Icon';

test('renders the Acacia SVG icon registry through a stable React Native component', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <Icon name="search" size={18} color="#111110" />,
    );
  });

  expect(ICON_PATHS.search).toContain('circle');
  expect(renderer.root.findByProps({testID: 'icon-search'}).props).toEqual(
    expect.objectContaining({
      accessibilityLabel: 'search icon',
    }),
  );
  expect(JSON.stringify(renderer.toJSON())).toContain('#111110');
});

test('uses a visible missing-icon fallback instead of silently rendering nothing', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <Icon name={'not-real' as keyof typeof ICON_PATHS} size={14} />,
    );
  });

  expect(renderer.root.findByProps({testID: 'icon-missing-not-real'})).toBeTruthy();
});
