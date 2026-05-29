import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { QualityTier } from '../../scene/quality';

/** Editor tool while in orbit camera mode. 'orbit' lets click-drag rotate
 *  the camera (current default). 'select' disables camera rotation so a
 *  click-drag on furniture moves it; click-drag on empty space does nothing. */
export type EditorTool = 'select' | 'orbit';

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean;
  editorTool: EditorTool;
  showFps: boolean;
  /** Graphics quality tier. Auto-detected on boot, auto-downgraded by the
   *  adaptive performance monitor, and user-overridable from the toolbar. */
  qualityTier: QualityTier;
  /** True once the user picks a tier manually — stops the adaptive monitor
   *  from overriding their choice. */
  qualityUserSet: boolean;
  setCatalogOpen: (open: boolean) => void;
  toggleCatalogOpen: () => void;
  setEditorTool: (tool: EditorTool) => void;
  toggleEditorTool: () => void;
  setShowFps: (show: boolean) => void;
  toggleShowFps: () => void;
  /** Manual tier change (marks qualityUserSet). */
  setQualityTier: (t: QualityTier) => void;
  /** Cycle Low → Medium → High → Low (manual). */
  cycleQuality: () => void;
  /** Adaptive auto-adjust (does not set qualityUserSet). */
  autoSetQualityTier: (t: QualityTier) => void;
}

export const UI_INITIAL: Pick<
  UiSlice,
  'catalogOpen' | 'editorTool' | 'showFps' | 'qualityTier' | 'qualityUserSet'
> = {
  catalogOpen: false,
  editorTool: 'orbit',
  showFps: false,
  qualityTier: 'medium',
  qualityUserSet: false,
};

const CYCLE: QualityTier[] = ['low', 'medium', 'high'];

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set) => ({
  ...UI_INITIAL,
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
  setEditorTool: (tool) => set({ editorTool: tool }),
  toggleEditorTool: () =>
    set((s) => ({ editorTool: s.editorTool === 'orbit' ? 'select' : 'orbit' })),
  setShowFps: (show) => set({ showFps: show }),
  toggleShowFps: () => set((s) => ({ showFps: !s.showFps })),
  setQualityTier: (t) => set({ qualityTier: t, qualityUserSet: true }),
  cycleQuality: () =>
    set((s) => ({
      qualityTier: CYCLE[(CYCLE.indexOf(s.qualityTier) + 1) % CYCLE.length],
      qualityUserSet: true,
    })),
  autoSetQualityTier: (t) =>
    set((s) => (s.qualityUserSet || s.qualityTier === t ? {} : { qualityTier: t })),
});
