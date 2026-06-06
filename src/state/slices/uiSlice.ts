import type { RoomId } from '../../apartment/types'
import type { AssetTier, QualitySettings, RenderTier } from '../../scene/quality'
import { RENDER_TIERS } from '../../scene/quality'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Editor tool while in orbit camera mode. 'orbit' lets click-drag rotate
 *  the camera (current default). 'select' disables camera rotation so a
 *  click-drag on furniture moves it; click-drag on empty space does nothing. */
export type EditorTool = 'select' | 'orbit'

/** Whether furniture fixture lights are driven automatically by the day/night
 *  cycle ('auto'), forced on (so windowless rooms read well in daylight), or
 *  forced off. */
export type LightsMode = 'auto' | 'on' | 'off'

/** Boot lifecycle phase. `'hydrating'` until the async bootstrap (IDB user
 *  assets, packs, autosave) resolves; then `'ready'`. Drives the initial
 *  loading overlay. */
export type BootPhase = 'hydrating' | 'ready'

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean
  editorTool: EditorTool
  showFps: boolean
  /** Graphics quality tier. Auto-detected on boot, auto-downgraded by the
   *  adaptive performance monitor, and user-overridable from the toolbar. */
  qualityTier: RenderTier
  /** True once the user picks a tier manually — stops the adaptive monitor
   *  from overriding their choice. */
  qualityUserSet: boolean
  /** Per-setting overrides layered on top of the active tier preset. */
  qualityOverrides: Partial<QualitySettings>
  /** GLB asset detail (mesh/texture LOD), decoupled from the render tier.
   *  `null` = Auto (follow `qualityTier`); an explicit tier pins asset detail
   *  independently and is immune to the FPS auto-downgrade. */
  assetTier: AssetTier | null
  /** Fixture lights mode (auto / forced on / forced off). */
  lightsMode: LightsMode
  /** Snap dragged/placed furniture to the alignment grid, and show the grid
   *  overlay on the floor while it's on. */
  snapEnabled: boolean
  /** Alignment-grid cell size in metres (e.g. 0.1 = 10 cm, 1 = 1 m). */
  gridSize: number
  /** Whether the budget / shopping-list panel is open. */
  budgetOpen: boolean
  /** Whether clearance checks (door-swing blocking) are shown. */
  clearanceOn: boolean
  /** True while recording the canvas to a downloadable video clip. */
  recording: boolean
  /** Recently-used custom finish colours (hex), most-recent first. Ephemeral. */
  recentColors: string[]
  /** Adaptive last-resort: when the FPS guard is already at the Low tier and
   *  still can't hold 30fps, it sheds the sun-shadow pass (the biggest
   *  remaining cost). Not a user setting; reset when a tier is picked manually. */
  autoShadowsOff: boolean
  /** Bumped whenever a DLC/catalog furniture material finishes building into
   *  the shared cache, so memoised furniture re-renders to pick it up. */
  materialEpoch: number
  /** Signal that a furniture material was (re)built and is now in the cache. */
  bumpMaterialEpoch: () => void
  /** True while the showcase AccumulativeShadows ground plane is converging.
   *  Used to suppress per-item ContactShadow blobs so contacts don't
   *  double-darken. Ephemeral runtime state — never persisted. */
  showcaseAccumulating: boolean
  setShowcaseAccumulating: (v: boolean) => void
  /** Boot lifecycle phase — `'hydrating'` until the async bootstrap resolves. */
  bootPhase: BootPhase
  /** Mark the boot bootstrap finished (flips the initial loading overlay off). */
  setBootReady: () => void
  /** Epoch (ms) of the last successful auto-save, or null if none yet this
   *  session. Surfaced as a reassuring "Auto-saved …" line. Ephemeral. */
  lastSavedAt: number | null
  setLastSavedAt: (t: number) => void
  /** True once the 3D scene has painted its first solid frames (shaders +
   *  procedural textures warm, any restored GLBs streamed in). The boot loading
   *  screen is held until this AND `bootPhase==='ready'`, so the scene is
   *  already nice when revealed. Non-front-facing UI (catalog, remote browse)
   *  loads lazily afterward and never gates this. Ephemeral. */
  sceneReady: boolean
  setSceneReady: (v: boolean) => void
  /** Transition loading overlay (orbit↔walk, room editor enter/exit). The
   *  initial-boot overlay is driven by `bootPhase`, not this. Ephemeral. */
  loading: { active: boolean; label: string }
  /** Show the transition loading overlay with a phase label. */
  showLoading: (label: string) => void
  /** Hide the transition loading overlay (min-display time is handled by the
   *  overlay component, so callers can call this on the next tick). */
  hideLoading: () => void
  /** Per-room editor: isolates a single room (IKEA-planner style). Ephemeral. */
  roomEditor: { active: boolean; roomId: RoomId | null }
  /** Enter the room editor for `roomId`: pins Performance + Original assets
   *  (remembering prior tiers), resets camera to orbit. */
  enterRoomEditor: (roomId: RoomId) => void
  /** Leave the room editor, restoring the render + asset tiers in effect on enter. */
  exitRoomEditor: () => void
  setCatalogOpen: (open: boolean) => void
  toggleCatalogOpen: () => void
  setEditorTool: (tool: EditorTool) => void
  toggleEditorTool: () => void
  setShowFps: (show: boolean) => void
  toggleShowFps: () => void
  /** Manual tier change — clears overrides and marks qualityUserSet. */
  setQualityTier: (t: RenderTier) => void
  /** Cycle Performance → Medium → High → Maximum → Performance (manual). */
  cycleQuality: () => void
  /** Adaptive auto-adjust (does not set qualityUserSet). */
  autoSetQualityTier: (t: RenderTier) => void
  /** Override a single quality setting (marks qualityUserSet). */
  setQualityOverride: <K extends keyof QualitySettings>(key: K, value: QualitySettings[K]) => void
  /** Drop all overrides so settings follow the tier preset again. */
  resetQualityOverrides: () => void
  /** Set the GLB asset detail tier (`null` = Auto / follow the render tier). */
  setAssetTier: (t: AssetTier | null) => void
  setLightsMode: (m: LightsMode) => void
  /** Cycle Auto → On → Off → Auto. */
  cycleLightsMode: () => void
  setAutoShadowsOff: (v: boolean) => void
  toggleSnap: () => void
  /** Set the alignment-grid cell size (metres). */
  setGridSize: (m: number) => void
  /** Cycle the grid cell size through the preset sizes. */
  cycleGridSize: () => void
  toggleBudget: () => void
  toggleClearance: () => void
  setRecording: (v: boolean) => void
  /** Record a custom colour as recently-used (deduped, capped at 8). */
  pushRecentColor: (hex: string) => void
}

export const UI_INITIAL: Pick<
  UiSlice,
  | 'catalogOpen'
  | 'editorTool'
  | 'showFps'
  | 'qualityTier'
  | 'qualityUserSet'
  | 'qualityOverrides'
  | 'assetTier'
  | 'lightsMode'
  | 'autoShadowsOff'
  | 'snapEnabled'
  | 'gridSize'
  | 'budgetOpen'
  | 'clearanceOn'
  | 'recording'
  | 'recentColors'
  | 'materialEpoch'
  | 'showcaseAccumulating'
  | 'roomEditor'
  | 'bootPhase'
  | 'sceneReady'
  | 'loading'
  | 'lastSavedAt'
> = {
  catalogOpen: false,
  editorTool: 'orbit',
  showFps: false,
  qualityTier: 'performance',
  qualityUserSet: false,
  qualityOverrides: {},
  assetTier: null,
  lightsMode: 'auto',
  autoShadowsOff: false,
  snapEnabled: false,
  gridSize: 0.5,
  budgetOpen: false,
  clearanceOn: false,
  recording: false,
  recentColors: [],
  materialEpoch: 0,
  showcaseAccumulating: false,
  roomEditor: { active: false, roomId: null },
  bootPhase: 'hydrating',
  sceneReady: false,
  loading: { active: false, label: '' },
  lastSavedAt: null,
}

/** Preset alignment-grid cell sizes (metres) the size button cycles through. */
export const GRID_SIZES = [0.1, 0.25, 0.5, 1] as const

const CYCLE: RenderTier[] = RENDER_TIERS
const LIGHTS_CYCLE: LightsMode[] = ['auto', 'on', 'off']

/** Render/asset tiers in effect when the room editor was entered, restored on exit. */
let priorTiers: { tier: RenderTier; userSet: boolean; asset: AssetTier | null } | null = null

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set, get) => ({
  ...UI_INITIAL,
  setBootReady: () => set({ bootPhase: 'ready' }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  showLoading: (label) => set({ loading: { active: true, label } }),
  hideLoading: () => set((s) => ({ loading: { ...s.loading, active: false } })),
  enterRoomEditor: (roomId) => {
    const s = get()
    priorTiers = { tier: s.qualityTier, userSet: s.qualityUserSet, asset: s.assetTier }
    set({
      roomEditor: { active: true, roomId },
      qualityTier: 'performance',
      qualityUserSet: true,
      qualityOverrides: {},
      assetTier: 'high',
      cameraMode: 'orbit',
      loading: { active: true, label: 'Entering room…' },
    })
  },
  exitRoomEditor: () => {
    const restore = priorTiers
    priorTiers = null
    set({
      roomEditor: { active: false, roomId: null },
      loading: { active: true, label: 'Exiting room…' },
      ...(restore
        ? { qualityTier: restore.tier, qualityUserSet: restore.userSet, assetTier: restore.asset }
        : {}),
    })
  },
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
  setEditorTool: (tool) => set({ editorTool: tool }),
  toggleEditorTool: () =>
    set((s) => ({ editorTool: s.editorTool === 'orbit' ? 'select' : 'orbit' })),
  setShowFps: (show) => set({ showFps: show }),
  toggleShowFps: () => set((s) => ({ showFps: !s.showFps })),
  bumpMaterialEpoch: () => set((s) => ({ materialEpoch: s.materialEpoch + 1 })),
  setShowcaseAccumulating: (v) => set({ showcaseAccumulating: v }),
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
  setAssetTier: (t) => set({ assetTier: t }),
  setLightsMode: (m) => set({ lightsMode: m }),
  cycleLightsMode: () =>
    set((s) => ({
      lightsMode: LIGHTS_CYCLE[(LIGHTS_CYCLE.indexOf(s.lightsMode) + 1) % LIGHTS_CYCLE.length],
    })),
  setAutoShadowsOff: (v) => set({ autoShadowsOff: v }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setGridSize: (m) => set({ gridSize: m }),
  cycleGridSize: () =>
    set((s) => {
      const i = GRID_SIZES.indexOf(s.gridSize as (typeof GRID_SIZES)[number])
      return { gridSize: GRID_SIZES[(i + 1) % GRID_SIZES.length] }
    }),
  toggleBudget: () => set((s) => ({ budgetOpen: !s.budgetOpen })),
  toggleClearance: () => set((s) => ({ clearanceOn: !s.clearanceOn })),
  setRecording: (v) => set({ recording: v }),
  pushRecentColor: (hex) =>
    set((s) => ({
      recentColors: [
        hex,
        ...s.recentColors.filter((c) => c.toLowerCase() !== hex.toLowerCase()),
      ].slice(0, 8),
    })),
})
