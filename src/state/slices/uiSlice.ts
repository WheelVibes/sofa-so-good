import type { SliceCreator } from './types';
import type { RootState } from '../store';

/** Editor tool while in orbit camera mode. 'orbit' lets click-drag rotate
 *  the camera (current default). 'select' disables camera rotation so a
 *  click-drag on furniture moves it; click-drag on empty space does nothing. */
export type EditorTool = 'select' | 'orbit';

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean;
  editorTool: EditorTool;
  showFps: boolean;
  setCatalogOpen: (open: boolean) => void;
  toggleCatalogOpen: () => void;
  setEditorTool: (tool: EditorTool) => void;
  toggleEditorTool: () => void;
  setShowFps: (show: boolean) => void;
  toggleShowFps: () => void;
}

export const UI_INITIAL: Pick<UiSlice, 'catalogOpen' | 'editorTool' | 'showFps'> = {
  catalogOpen: false,
  editorTool: 'orbit',
  showFps: false,
};

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set) => ({
  ...UI_INITIAL,
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
  setEditorTool: (tool) => set({ editorTool: tool }),
  toggleEditorTool: () =>
    set((s) => ({ editorTool: s.editorTool === 'orbit' ? 'select' : 'orbit' })),
  setShowFps: (show) => set({ showFps: show }),
  toggleShowFps: () => set((s) => ({ showFps: !s.showFps })),
});
