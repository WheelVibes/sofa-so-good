import {
  clampExposure,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAPPING,
  type ToneMappingMode,
} from '../../scene/look'
import type { AssetTier, QualitySettings, RenderTier } from '../../scene/quality'
import { RENDER_TIERS } from '../../scene/quality'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Whether furniture fixture lights are driven automatically by the day/night
 *  cycle ('auto'), forced on (so windowless rooms read well in daylight), or
 *  forced off. */
export type LightsMode = 'auto' | 'on' | 'off'

/** Selectable 3D scene surroundings (see `scene/SceneBackdrop`). */
export type BackdropKind = 'city' | 'park' | 'hills' | 'none'

/** Interface density. 'simple' hides advanced/technical clusters (analysis Tools,
 *  the floor-plan editor) for a friendlier first experience; 'pro' shows all. */
export type UiMode = 'simple' | 'pro'

/** Boot lifecycle phase. `'hydrating'` until the async bootstrap (IDB user
 *  assets, packs, autosave) resolves; then `'ready'`. Drives the initial
 *  loading overlay. */
export type BootPhase = 'hydrating' | 'ready'

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean
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
  /** Tone-mapping "look" (view transform) applied by the renderer — a per-device
   *  graphics preference, persisted via qualityPrefs. */
  toneMapping: ToneMappingMode
  /** User exposure (brightness) multiplier on top of auto-exposure. Per-device,
   *  persisted via qualityPrefs. 1 = neutral. */
  exposure: number
  /** Fixture lights mode (auto / forced on / forced off). */
  lightsMode: LightsMode
  /** Snap dragged/placed furniture to the alignment grid, and show the grid
   *  overlay on the floor while it's on. */
  snapEnabled: boolean
  /** Alignment-grid cell size in metres (e.g. 0.1 = 10 cm, 1 = 1 m). */
  gridSize: number
  /** Selected 3D scene backdrop (surroundings outside the flat). Persisted via
   *  editorPrefs, like snap/units. */
  backdrop: BackdropKind
  setBackdrop: (b: BackdropKind) => void
  /** Interface density (simple hides advanced clusters). Persisted via editorPrefs. */
  uiMode: UiMode
  setUiMode: (m: UiMode) => void
  /** True while the full-screen client presentation (saved-views slideshow) runs. */
  presenting: boolean
  setPresenting: (v: boolean) => void
  /** Whether the budget / shopping-list panel is open. */
  budgetOpen: boolean
  /** Whether clearance checks (door-swing blocking) are shown. */
  clearanceOn: boolean
  /** True while recording the canvas to a downloadable video clip. */
  recording: boolean
  /** Recently-used custom finish colours (hex), most-recent first. Ephemeral. */
  recentColors: string[]
  /** Recently-applied finish material ids (most-recent first, capped). Speeds
   *  re-applying a finish across rooms. Ephemeral. */
  recentFinishes: string[]
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
  /** Per-room editor: isolates a single room (IKEA-planner style). Ephemeral.
   *  `roomId` is a default-apartment RoomId or, on a custom plan, a plan room id. */
  roomEditor: { active: boolean; roomId: string | null }
  /** Enter the room editor for `roomId`: pins Performance + Original assets
   *  (remembering prior tiers), resets camera to orbit. */
  enterRoomEditor: (roomId: string) => void
  /** Leave the room editor, restoring the render + asset tiers in effect on enter. */
  exitRoomEditor: () => void
  setCatalogOpen: (open: boolean) => void
  toggleCatalogOpen: () => void
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
  /** Set the tone-mapping look. */
  setToneMapping: (m: ToneMappingMode) => void
  /** Set the user exposure multiplier (clamped to the supported range). */
  setExposure: (e: number) => void
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
  /** Record a material id as a recently-applied finish (deduped, capped at 8). */
  pushRecentFinish: (id: string) => void
}

export const UI_INITIAL: Pick<
  UiSlice,
  | 'catalogOpen'
  | 'showFps'
  | 'qualityTier'
  | 'qualityUserSet'
  | 'qualityOverrides'
  | 'assetTier'
  | 'toneMapping'
  | 'exposure'
  | 'lightsMode'
  | 'autoShadowsOff'
  | 'backdrop'
  | 'uiMode'
  | 'snapEnabled'
  | 'gridSize'
  | 'presenting'
  | 'budgetOpen'
  | 'clearanceOn'
  | 'recording'
  | 'recentColors'
  | 'recentFinishes'
  | 'materialEpoch'
  | 'showcaseAccumulating'
  | 'roomEditor'
  | 'bootPhase'
  | 'sceneReady'
  | 'loading'
  | 'lastSavedAt'
> = {
  catalogOpen: false,
  showFps: false,
  qualityTier: 'performance',
  qualityUserSet: false,
  qualityOverrides: {},
  assetTier: null,
  toneMapping: DEFAULT_TONE_MAPPING,
  exposure: DEFAULT_EXPOSURE,
  lightsMode: 'auto',
  autoShadowsOff: false,
  snapEnabled: false,
  gridSize: 0.5,
  backdrop: 'city' as BackdropKind,
  uiMode: 'simple' as UiMode,
  presenting: false,
  budgetOpen: false,
  clearanceOn: false,
  recording: false,
  recentColors: [],
  recentFinishes: [],
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
    // Orbit/walk over the whole flat are view-only, so any selection made in
    // the editor must clear — otherwise a stale Inspector/Finish picker would
    // linger with no way to dismiss it (nothing is selectable outside the editor).
    get().selectItem(null)
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
  setToneMapping: (toneMapping) => set({ toneMapping }),
  setExposure: (e) => set({ exposure: clampExposure(e) }),
  setLightsMode: (m) => set({ lightsMode: m }),
  setPresenting: (presenting) => set({ presenting }),
  cycleLightsMode: () =>
    set((s) => ({
      lightsMode: LIGHTS_CYCLE[(LIGHTS_CYCLE.indexOf(s.lightsMode) + 1) % LIGHTS_CYCLE.length],
    })),
  setAutoShadowsOff: (v) => set({ autoShadowsOff: v }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setGridSize: (m) => set({ gridSize: m }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setUiMode: (uiMode) => {
    set({ uiMode })
    // Pro features are gated on the mode, so re-resolve the flag map when it flips.
    get().reresolveFeatureFlags()
  },
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
  pushRecentFinish: (id) =>
    set((s) => ({ recentFinishes: [id, ...s.recentFinishes.filter((f) => f !== id)].slice(0, 8) })),
})
