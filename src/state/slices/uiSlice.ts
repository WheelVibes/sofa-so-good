import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { QualityTier, QualitySettings } from '../../scene/quality';

/** Editor tool while in orbit camera mode. 'orbit' lets click-drag rotate
 *  the camera (current default). 'select' disables camera rotation so a
 *  click-drag on furniture moves it; click-drag on empty space does nothing. */
export type EditorTool = 'select' | 'orbit';

/** Whether furniture fixture lights are driven automatically by the day/night
 *  cycle ('auto'), forced on (so windowless rooms read well in daylight), or
 *  forced off. */
export type LightsMode = 'auto' | 'on' | 'off';

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
  /** Per-setting overrides layered on top of the active tier preset. */
  qualityOverrides: Partial<QualitySettings>;
  /** Fixture lights mode (auto / forced on / forced off). */
  lightsMode: LightsMode;
  /** Adaptive last-resort: when the FPS guard is already at the Low tier and
   *  still can't hold 30fps, it sheds the sun-shadow pass (the biggest
   *  remaining cost). Not a user setting; reset when a tier is picked manually. */
  autoShadowsOff: boolean;
  setCatalogOpen: (open: boolean) => void;
  toggleCatalogOpen: () => void;
  setEditorTool: (tool: EditorTool) => void;
  toggleEditorTool: () => void;
  setShowFps: (show: boolean) => void;
  toggleShowFps: () => void;
  /** Manual tier change — clears overrides and marks qualityUserSet. */
  setQualityTier: (t: QualityTier) => void;
  /** Cycle Low → Medium → High → Low (manual). */
  cycleQuality: () => void;
  /** Adaptive auto-adjust (does not set qualityUserSet). */
  autoSetQualityTier: (t: QualityTier) => void;
  /** Override a single quality setting (marks qualityUserSet). */
  setQualityOverride: <K extends keyof QualitySettings>(key: K, value: QualitySettings[K]) => void;
  /** Drop all overrides so settings follow the tier preset again. */
  resetQualityOverrides: () => void;
  setLightsMode: (m: LightsMode) => void;
  /** Cycle Auto → On → Off → Auto. */
  cycleLightsMode: () => void;
  setAutoShadowsOff: (v: boolean) => void;
}

export const UI_INITIAL: Pick<
  UiSlice,
  | 'catalogOpen'
  | 'editorTool'
  | 'showFps'
  | 'qualityTier'
  | 'qualityUserSet'
  | 'qualityOverrides'
  | 'lightsMode'
  | 'autoShadowsOff'
> = {
  catalogOpen: false,
  editorTool: 'orbit',
  showFps: false,
  qualityTier: 'medium',
  qualityUserSet: false,
  qualityOverrides: {},
  lightsMode: 'auto',
  autoShadowsOff: false,
};

const CYCLE: QualityTier[] = ['low', 'medium', 'high'];
const LIGHTS_CYCLE: LightsMode[] = ['auto', 'on', 'off'];

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set) => ({
  ...UI_INITIAL,
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
  setEditorTool: (tool) => set({ editorTool: tool }),
  toggleEditorTool: () =>
    set((s) => ({ editorTool: s.editorTool === 'orbit' ? 'select' : 'orbit' })),
  setShowFps: (show) => set({ showFps: show }),
  toggleShowFps: () => set((s) => ({ showFps: !s.showFps })),
  setQualityTier: (t) =>
    set({ qualityTier: t, qualityUserSet: true, qualityOverrides: {}, autoShadowsOff: false }),
  cycleQuality: () =>
    set((s) => ({
      qualityTier: CYCLE[(CYCLE.indexOf(s.qualityTier) + 1) % CYCLE.length],
      qualityUserSet: true,
      qualityOverrides: {},
      autoShadowsOff: false,
    })),
  autoSetQualityTier: (t) =>
    set((s) => (s.qualityUserSet || s.qualityTier === t ? {} : { qualityTier: t })),
  setQualityOverride: (key, value) =>
    set((s) => ({
      qualityOverrides: { ...s.qualityOverrides, [key]: value },
      qualityUserSet: true,
    })),
  resetQualityOverrides: () => set({ qualityOverrides: {} }),
  setLightsMode: (m) => set({ lightsMode: m }),
  cycleLightsMode: () =>
    set((s) => ({
      lightsMode: LIGHTS_CYCLE[(LIGHTS_CYCLE.indexOf(s.lightsMode) + 1) % LIGHTS_CYCLE.length],
    })),
  setAutoShadowsOff: (v) => set({ autoShadowsOff: v }),
});
