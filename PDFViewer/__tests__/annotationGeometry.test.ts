import {
  annotationBoundsForPageGesture,
  annotationBoundsToFallbackStyle,
} from '../src/domain';

test('annotation geometry clamps sidecar bounds to the visible page', () => {
  expect(
    annotationBoundsToFallbackStyle({
      x: 580,
      y: 830,
      width: 100,
      height: 40,
    }),
  ).toEqual({
    left: '97.479%',
    top: '98.5748%',
    width: '2.521%',
    height: '1.4252%',
  });
});

test('click highlight bounds stay centered on the clicked page point', () => {
  expect(
    annotationBoundsForPageGesture({
      kind: 'highlight',
      pageSize: {width: 620, height: 877},
      start: {x: 310, y: 350},
    }),
  ).toEqual({
    x: 218,
    y: 324,
    width: 160,
    height: 24,
  });
});

test('drag highlight bounds follow the dragged text range instead of using a fixed stamp', () => {
  expect(
    annotationBoundsForPageGesture({
      kind: 'highlight',
      pageSize: {width: 620, height: 877},
      start: {x: 150, y: 220},
      end: {x: 430, y: 256},
    }),
  ).toEqual({
    x: 144,
    y: 211,
    width: 269,
    height: 35,
  });
});

test('horizontal drag highlight bounds are centered on the pointer path', () => {
  expect(
    annotationBoundsForPageGesture({
      kind: 'highlight',
      pageSize: {width: 620, height: 877},
      start: {x: 150, y: 220},
      end: {x: 430, y: 223},
    }),
  ).toEqual({
    x: 144,
    y: 201,
    width: 269,
    height: 24,
  });
});

test('signature stamps center on the clicked pointer position', () => {
  expect(
    annotationBoundsForPageGesture({
      kind: 'signature',
      pageSize: {width: 620, height: 877},
      start: {x: 310, y: 350},
    }),
  ).toEqual({
    x: 208,
    y: 312,
    width: 180,
    height: 48,
  });
});
