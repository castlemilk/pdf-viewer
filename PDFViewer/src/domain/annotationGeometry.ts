import type {AnnotationKind, PdfPoint, PdfRect} from './types';

export const PDF_CANONICAL_PAGE = {
  width: 595,
  height: 842,
} as const;

type PagePoint = {
  x: number;
  y: number;
};

type PageSize = {
  width: number;
  height: number;
};

type InteractiveAnnotationKind = Extract<
  AnnotationKind,
  'highlight' | 'note' | 'drawing' | 'signature'
>;

export function annotationBoundsForPageGesture({
  kind,
  pageSize,
  start,
  end,
}: {
  kind: InteractiveAnnotationKind;
  pageSize: PageSize;
  start: PagePoint;
  end?: PagePoint;
}): PdfRect {
  if (kind === 'highlight' && end && hasMeaningfulDrag(start, end)) {
    return canonicalBoundsForDrag(start, end, pageSize);
  }

  if (kind === 'signature') {
    return signatureAnnotationBounds(start, pageSize);
  }

  return centeredAnnotationBounds(kind, start, pageSize);
}

export function annotationSizeForKind(kind: InteractiveAnnotationKind) {
  switch (kind) {
    case 'signature':
      return {width: 180, height: 48};
    case 'note':
      return {width: 190, height: 54};
    case 'drawing':
      return {width: 120, height: 80};
    case 'highlight':
    default:
      return {width: 160, height: 24};
  }
}

export function canonicalInkPathForPagePoints({
  pageSize,
  points,
}: {
  pageSize: PageSize;
  points: PagePoint[];
}): PdfPoint[] {
  return points.map(point => roundedPoint(pagePointToCanonical(point, pageSize)));
}

export function annotationBoundsForCanonicalPoints(points: PdfPoint[]): PdfRect {
  if (points.length === 0) {
    return {x: 0, y: 0, width: 24, height: 24};
  }

  const padding = 12;
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));

  return clampAnnotationBounds({
    x: Math.round(minX - padding),
    y: Math.round(minY - padding),
    width: Math.round(maxX - minX + padding * 2),
    height: Math.round(maxY - minY + padding * 2),
  });
}

export function annotationBoundsToFallbackStyle(bounds: PdfRect) {
  const left = toPercent(bounds.x, PDF_CANONICAL_PAGE.width);
  const top = toPercent(bounds.y, PDF_CANONICAL_PAGE.height);
  const width = clamp(
    toPercent(bounds.width, PDF_CANONICAL_PAGE.width),
    0,
    100 - left,
  );
  const height = clamp(
    toPercent(bounds.height, PDF_CANONICAL_PAGE.height),
    0,
    100 - top,
  );

  return {
    left: formatPercent(left),
    top: formatPercent(top),
    width: formatPercent(width),
    height: formatPercent(height),
  };
}

function roundedPoint(point: PagePoint): PdfPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function centeredAnnotationBounds(
  kind: InteractiveAnnotationKind,
  point: PagePoint,
  pageSize: PageSize,
): PdfRect {
  const size = annotationSizeForKind(kind);
  const canonicalPoint = pagePointToCanonical(point, pageSize);

  return clampAnnotationBounds({
    x: Math.round(canonicalPoint.x - size.width / 2),
    y: Math.round(canonicalPoint.y - size.height / 2),
    width: size.width,
    height: size.height,
  });
}

function signatureAnnotationBounds(point: PagePoint, pageSize: PageSize): PdfRect {
  const size = annotationSizeForKind('signature');
  const canonicalAnchor = pagePointToCanonical(point, pageSize);

  return clampAnnotationBounds({
    x: Math.round(canonicalAnchor.x - size.width / 2),
    y: Math.round(canonicalAnchor.y - size.height / 2),
    width: size.width,
    height: size.height,
  });
}

function canonicalBoundsForDrag(
  start: PagePoint,
  end: PagePoint,
  pageSize: PageSize,
): PdfRect {
  const startPoint = pagePointToCanonical(start, pageSize);
  const endPoint = pagePointToCanonical(end, pageSize);
  const minimumHighlightLength = annotationSizeForKind('highlight').height;
  const width = Math.max(
    Math.abs(endPoint.x - startPoint.x),
    minimumHighlightLength,
  );
  const height = Math.max(
    Math.abs(endPoint.y - startPoint.y),
    minimumHighlightLength,
  );
  const x = centeredMinimumRangeStart(
    startPoint.x,
    endPoint.x,
    minimumHighlightLength,
  );
  const y = centeredMinimumRangeStart(
    startPoint.y,
    endPoint.y,
    minimumHighlightLength,
  );

  return clampAnnotationBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });
}

function centeredMinimumRangeStart(
  first: number,
  second: number,
  minimumLength: number,
) {
  const length = Math.abs(second - first);

  if (length >= minimumLength) {
    return Math.min(first, second);
  }

  return (first + second) / 2 - minimumLength / 2;
}

function pagePointToCanonical(point: PagePoint, pageSize: PageSize) {
  const safeWidth = Math.max(1, pageSize.width);
  const safeHeight = Math.max(1, pageSize.height);

  return {
    x: (point.x / safeWidth) * PDF_CANONICAL_PAGE.width,
    y: (point.y / safeHeight) * PDF_CANONICAL_PAGE.height,
  };
}

function clampAnnotationBounds(bounds: PdfRect): PdfRect {
  const width = clamp(bounds.width, 4, PDF_CANONICAL_PAGE.width);
  const height = clamp(bounds.height, 4, PDF_CANONICAL_PAGE.height);

  return {
    x: clamp(bounds.x, 0, PDF_CANONICAL_PAGE.width - width),
    y: clamp(bounds.y, 0, PDF_CANONICAL_PAGE.height - height),
    width,
    height,
  };
}

function hasMeaningfulDrag(start: PagePoint, end: PagePoint) {
  return Math.abs(end.x - start.x) >= 6 || Math.abs(end.y - start.y) >= 6;
}

function toPercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return clamp((value / total) * 100, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(4))}%`;
}
