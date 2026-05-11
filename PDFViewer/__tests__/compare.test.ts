import {compareDocumentText} from '../src/domain/compare';

describe('document compare', () => {
  it('summarizes added, removed, and modified pages from extracted page text', () => {
    const summary = compareDocumentText(
      [
        'Market Overview\nGlobal markets closed with steady growth.',
        'Risks\nSupply constraints remain elevated.',
        'Outlook\nMargin expansion expected.',
      ],
      [
        'Market Overview\nGlobal markets closed with strong growth.',
        'Risks\nSupply constraints remain elevated.',
        'Outlook\nMargin expansion expected.',
        'Appendix\nNew revenue table.',
      ],
    );

    expect(summary.totalChanges).toBe(2);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(0);
    expect(summary.modified).toBe(1);
    expect(summary.pages.map(page => page.pageIndex)).toEqual([0, 3]);
  });
});
