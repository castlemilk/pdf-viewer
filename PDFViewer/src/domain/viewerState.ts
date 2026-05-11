import type {InspectorTab, ViewerState, ViewerTool} from './types';

export type ViewerAction =
  | {type: 'setPage'; pageIndex: number}
  | {type: 'setZoom'; zoom: number}
  | {type: 'setPageAndZoom'; pageIndex: number; zoom: number}
  | {type: 'setTool'; tool: ViewerTool}
  | {type: 'setInspectorTab'; tab: InspectorTab}
  | {type: 'setSearchQuery'; query: string}
  | {type: 'toggleThumbnails'};

export function createInitialViewerState(
  documentId: string,
  pageCount: number,
): ViewerState {
  return {
    documentId,
    pageCount,
    pageIndex: 0,
    zoom: 1,
    activeTool: 'select',
    inspectorTab: 'info',
    showThumbnails: true,
    searchQuery: '',
  };
}

export function viewerReducer(
  state: ViewerState,
  action: ViewerAction,
): ViewerState {
  switch (action.type) {
    case 'setPage':
      return {...state, pageIndex: clampPage(action.pageIndex, state.pageCount)};
    case 'setZoom':
      return {...state, zoom: clampZoom(action.zoom)};
    case 'setPageAndZoom':
      return {
        ...state,
        pageIndex: clampPage(action.pageIndex, state.pageCount),
        zoom: clampZoom(action.zoom),
      };
    case 'setTool':
      return {...state, activeTool: action.tool};
    case 'setInspectorTab':
      return {...state, inspectorTab: action.tab};
    case 'setSearchQuery':
      return {...state, searchQuery: action.query};
    case 'toggleThumbnails':
      return {...state, showThumbnails: !state.showThumbnails};
    default:
      return state;
  }
}

function clampPage(pageIndex: number, pageCount: number) {
  return Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)));
}

function clampZoom(zoom: number) {
  return Math.max(0.25, Math.min(zoom, 3));
}
