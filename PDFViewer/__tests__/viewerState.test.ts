import {createInitialViewerState, viewerReducer} from '../src/domain/viewerState';

describe('viewer state', () => {
  it('clamps page and zoom updates to supported ranges', () => {
    const state = createInitialViewerState('q4-market-analysis', 32);

    const result = viewerReducer(state, {
      type: 'setPageAndZoom',
      pageIndex: 100,
      zoom: 4.5,
    });

    expect(result.pageIndex).toBe(31);
    expect(result.zoom).toBe(3);
  });

  it('switches tools and side panels explicitly', () => {
    const state = createInitialViewerState('future-work', 32);

    const result = viewerReducer(
      viewerReducer(state, {type: 'setTool', tool: 'highlight'}),
      {type: 'setInspectorTab', tab: 'comments'},
    );

    expect(result.activeTool).toBe('highlight');
    expect(result.inspectorTab).toBe('comments');
  });
});
