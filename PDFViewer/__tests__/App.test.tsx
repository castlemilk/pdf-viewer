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
