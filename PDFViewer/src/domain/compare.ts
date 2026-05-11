import type {CompareSummary, PageChange} from './types';

export function compareDocumentText(
  leftPages: string[],
  rightPages: string[],
): CompareSummary {
  const maxPages = Math.max(leftPages.length, rightPages.length);
  const pages: PageChange[] = [];

  for (let index = 0; index < maxPages; index += 1) {
    const left = normalizePage(leftPages[index]);
    const right = normalizePage(rightPages[index]);

    if (left === right) {
      continue;
    }

    if (left.length === 0) {
      pages.push({
        pageIndex: index,
        changeCount: 1,
        status: 'added',
        title: pageTitle(rightPages[index], `Page ${index + 1}`),
      });
      continue;
    }

    if (right.length === 0) {
      pages.push({
        pageIndex: index,
        changeCount: 1,
        status: 'removed',
        title: pageTitle(leftPages[index], `Page ${index + 1}`),
      });
      continue;
    }

    pages.push({
      pageIndex: index,
      changeCount: lineChangeCount(left, right),
      status: 'modified',
      title: pageTitle(rightPages[index], `Page ${index + 1}`),
    });
  }

  const added = pages.filter(page => page.status === 'added').length;
  const removed = pages.filter(page => page.status === 'removed').length;
  const modified = pages.filter(page => page.status === 'modified').length;

  return {
    added,
    removed,
    modified,
    totalChanges: added + removed + modified,
    pages,
  };
}

function normalizePage(value = '') {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function lineChangeCount(left: string, right: string) {
  const leftLines = new Set(left.split('\n'));
  const rightLines = new Set(right.split('\n'));
  let changed = 0;

  leftLines.forEach(line => {
    if (!rightLines.has(line)) {
      changed += 1;
    }
  });
  rightLines.forEach(line => {
    if (!leftLines.has(line)) {
      changed += 1;
    }
  });

  return Math.max(1, changed);
}

function pageTitle(value: string | undefined, fallback: string) {
  const firstLine = value?.split('\n').find(line => line.trim().length > 0);
  return firstLine?.trim() ?? fallback;
}
