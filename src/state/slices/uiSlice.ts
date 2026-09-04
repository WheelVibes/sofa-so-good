import { DEFAULT_WALL_REVEAL_STRENGTH } from '../../apartment/walls/wallRevealMath'
import type { LightMood } from '../../lighting/moodPresets'
import { setIblActive } from '../../materials/iblSignal'
import {
  clampExposure,
  clampSceneSaturation,
  clampSceneWarmth,
  DEFAULT_EXPOSURE,
  DEFAULT_SCENE_SATURATION,
  DEFAULT_SCENE_WARMTH,
} from '../../scene/look'
import type { AssetTier, DeviceClass, QualitySettings, RenderTier } from '../../scene/quality'
import { QUALITY_LABEL, RENDER_TIERS, resolveQuality } from '../../scene/quality'

/**
 * Mirror the tier's IBL state into the material layer.
 *
 * Metals have no diffuse term, so with no `scene.environment` they render pure
 * black — the material factories cap metalness while IBL is off. They read this
 * flag when a material is BUILT, and the shell's materials (interior door
 * leaves, 0.8 × 2.1 m) are built during the very first mount, long before
 * `SceneEnvironment`'s effect could set it. Pushing it from the store — at
 * module init below and on every tier change — closes that window.
 */
function syncIblFromTier(
  tier: RenderTier,
  overrides: Partial<QualitySettings> | undefined,
  device: DeviceClass,
): void {
  setIblActive(resolveQuality(tier, overrides, device).ibl)
}

// Seed it at module load, because the shell builds its materials before any React
// effect runs. NOTE the seeded tier is a LOWER BOUND, not the real boot tier: this
// used to say "the app always boots at 'performance'", which TIER-ADAPTIVE made
// false — `initialAutoTier` is `medium` and the ladder moves at runtime. Seeding
// `performance` (ibl off) is still the safe direction, since a metal that boots
// capped and is then un-capped by `SceneEnvironment`'s effect looks right either
// way, whereas the reverse renders black. Correctness across later tier changes
// does NOT rely on this seed — see IBL-CAP-LIVE in `materials/iblSignal.ts`.
// `weak` for the seed: the conservative end, matching the store's own initial
// `deviceClass`. The comment above explains why an under-capped seed is the safe
// direction here.
syncIblFromTier('performance', undefined, 'weak')

import { DEFAULT_TONE_MAPPING_SETTING, type ToneMappingSetting } from '../../scene/toneContext'
import type { DrawingLayer, DrawingLayerVisibility } from '../../ui/drawingLayers'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Whether furniture fixture lights are all on or all off. (The old 'auto'
 *  follow-the-sun mode was removed 2026-07-24 — users found lights turning
 *  themselves on surprising; legacy saves normalize via
 *  {@link normalizeLightsMode}.) */
export type LightsMode = 'on' | 'off'

/** Coerce a persisted lights mode (which may be the legacy 'auto', or junk)
 *  to the binary mode. Legacy 'auto' → 'off' (auto's daytime state). */
export function normalizeLightsMode(v: unknown): LightsMode {
  return v === 'on' ? 'on' : 'off'
}

/** Selectable 3D scene surroundings (see `scene/SceneBackdrop`). `sky` is the
 *  sun-driven procedural sky (RD-412), gated by the `proceduralSky` feature. */
export type BackdropKind = 'city' | 'dusk' | 'park' | 'hills' | 'sky' | 'custom' | 'none'

/** Interface density. 'simple' hides advanced/technical clusters (analysis Tools,
 *  the floor-plan editor) for a friendlier first experience; 'pro' shows all. */
type UiMode = 'simple' | 'pro'

/** Row density (P38, Pro-tier `densityMode` flag). 'comfortable' is the default
 *  vertical rhythm; 'compact' tightens vertical row padding only (via
 *  `[data-density='compact']` over `--row-pad-y`) — hit-target width is
 *  unaffected. Persisted via editorPrefs. */
export type Density = 'comfortable' | 'compact'

/** Boot lifecycle phase. `'hydrating'` until the async bootstrap (IDB user
 *  assets, packs, autosave) resolves; then `'ready'`. Drives the initial
 *  loading overlay. */
type BootPhase = 'hydrating' | 'ready'

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean
  showFps: boolean
  /** Furniture motion toggle (bug #15): when false, continuously-animated pieces
   *  (ceiling / standing fan blades) hold still — for a calmer still view or to
   *  save battery. Persisted per-device via editorPrefs. Default on. */
  motionEnabled: boolean
  setMotionEnabled: (on: boolean) => void
  toggleMotion: () => void
  /** Graphics quality tier. Auto-detected on boot, auto-downgraded by the
   *  adaptive performance monitor, and user-overridable from the toolbar. */
  qualityTier: RenderTier
  /** True once the user picks a tier manually — stops the adaptive monitor
   *  from overriding their choice. */
  qualityUserSet: boolean
  /** Per-setting overrides layered on top of the active mode preset. */
  qualityOverrides: Partial<QualitySettings>
  /** Which variant of the active mode to render. Detected on boot and moved by
   *  the adaptive monitor; it scales a mode rather than replacing it, so a
   *  struggling machine drops resolution and effects without changing the mode
   *  the user chose. */
  deviceClass: DeviceClass
  /** GLB asset detail (mesh/texture LOD), decoupled from the render tier.
   *  `null` = Auto (follow `qualityTier`); an explicit tier pins asset detail
   *  independently and is immune to the FPS auto-downgrade. */
  assetTier: AssetTier | null
  /** Tone-mapping "look" (view transform) applied by the renderer — a per-device
   *  graphics preference, persisted via qualityPrefs. */
  toneMapping: ToneMappingSetting
  /** User exposure (brightness) multiplier on top of auto-exposure. Per-device,
   *  persisted via qualityPrefs. 1 = neutral. */
  exposure: number
  /** Scene white-balance bias (COLOR-GRADE): -1 coolest … 0 neutral … +1 warmest.
   *  Tints the analytical lights on every tier. Per-device, qualityPrefs. */
  sceneWarmth: number
  /** Scene saturation multiplier (COLOR-GRADE): 0 … 1 (default) … 2. Drives the
   *  High/Maximum post stack's HueSaturation pass. Per-device, qualityPrefs. */
  sceneSaturation: number
  /** Fixture lights mode (all on / all off). */
  lightsMode: LightsMode
  /** PHOTO-FILL: opt-in photographic light balance. Off by default — reducing
   *  the fill is the DEFAULT-GLOOM trade (`.86`), which is the user's call. */
  photographicLook: boolean
  /** Lighting mood preset (UX round-3 #3): one-tap brightness + colour-temperature
   *  adjustment layered on top of `lightsMode` (`lighting/moodPresets.ts`).
   *  `'none'` = Normal (no adjustment). Persisted with the design, like
   *  `lightsMode` (a saved lighting mood should round-trip). */
  lightMood: LightMood
  setLightMood: (m: LightMood) => void
  /** Whether ceiling light fixture geometry is shown (illumination is independent).
   *  Default false = fixtures hidden; point lights still emit when lights are on. */
  showCeilingFixtures: boolean
  setShowCeilingFixtures: (v: boolean) => void
  /** Single wall-fade strength (WALL-REVEAL-STRENGTH) for the orbit dollhouse /
   *  room editor — how transparent a camera-facing wall fades to. `0` = fully
   *  opaque, never fades; `1` = fades fully hidden; in between (step 0.05) is the
   *  MAX fade strength (head-on opacity floor `1 − strength`). Default
   *  `DEFAULT_WALL_REVEAL_STRENGTH` (0.95). Replaces the retired three-way
   *  translucent / auto-hide / opaque mode. */
  wallRevealStrength: number
  setWallRevealStrength: (v: number) => void
  /** Which walls the reveal applies to: 'exterior' = perimeter walls only
   *  (default — keeps interior partitions solid so the layout reads); 'all' =
   *  interior partitions fade too (full see-through dollhouse). Applied together
   *  with `wallRevealStrength`; irrelevant when the strength is `0` (no fade). */
  wallRevealScope: 'exterior' | 'all'
  setWallRevealScope: (s: 'exterior' | 'all') => void
  /** Which construction drawing-set layers (sheet groups) to include in the
   *  exported set; a layer absent here = included (the full set). Session-only. */
  drawingLayers: DrawingLayerVisibility
  setDrawingLayer: (layer: DrawingLayer, on: boolean) => void
  /** Snap dragged/placed furniture to the alignment grid, and show the grid
   *  overlay on the floor while it's on. */
  snapEnabled: boolean
  /** Alignment-grid cell size in metres (e.g. 0.1 = 10 cm, 1 = 1 m). */
  gridSize: number
  /** Selected scene backdrop — the equirectangular photo seen through windows in
   *  walk mode. Persisted via editorPrefs, like snap/units. */
  backdrop: BackdropKind
  setBackdrop: (b: BackdropKind) => void
  /** Selected CC0 HDRI environment id for image-based lighting (F3/R-HDRI), or
   *  `null` for the default procedural probe. Persisted via editorPrefs. */
  hdriId: string | null
  setHdri: (id: string | null) => void
  /** Live object URL of the user-uploaded `custom` backdrop photo, or null. Not
   *  persisted directly (the blob lives in IDB via `storage/walkBackdrop`; this
   *  URL is recreated on boot by `hydrateWalkBackdrop`). */
  customBackdropUrl: string | null
  setCustomBackdropUrl: (url: string | null) => void
  /** Interface density (simple hides advanced clusters). Persisted via editorPrefs. */
  uiMode: UiMode
  setUiMode: (m: UiMode) => void
  /** Row density (P38, `densityMode` flag, Pro-only UI). Persisted via editorPrefs. */
  density: Density
  setDensity: (d: Density) => void
  /** True while the full-screen client presentation (saved-views slideshow) runs. */
  presenting: boolean
  setPresenting: (v: boolean) => void
  /**
   * When true, the presentation appends the 360° tour stops as panorama slides
   * after the saved views (requires both `presentation` + `panoTour` flags; the
   * toggle is only visible when both are enabled). Ephemeral session preference.
   */
  presentationIncludeTour: boolean
  setPresentationIncludeTour: (v: boolean) => void
  /** Whether the "Start a new apartment" chooser is open (`NewPlanModal`).
   *  Lives here because the 2D editor's Plan menu, the File menu and ⌘K all
   *  open the same guarded chooser. */
  newPlanOpen: boolean
  setNewPlanOpen: (open: boolean) => void
  /** Whether the budget / shopping-list panel is open. */
  budgetOpen: boolean
  /** Whether the whole-renovation budget allocator panel is open (BSJ-1). */
  renoBudgetOpen: boolean
  /** Whether clearance checks (door-swing blocking) are shown. */
  clearanceOn: boolean
  /** Wall-types 3D overlay (`wallTypes3d` pro flag) — tints each wall by its
   *  structural classification (`wallTypeColor.ts`) in the orbit view AND the
   *  room editor. Session-only view toggle, like `clearanceOn` — never
   *  persisted, never in the save schema. */
  showWallTypes: boolean
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
  /** TIER-ADAPTIVE learned ceiling: the highest tier the adaptive ladder may
   *  reach on THIS device, recorded when a tier FAILS. `null` = nothing learned
   *  yet. Persisted per-device by `qualityPrefs` so a device that already proved
   *  it can't hold a tier never probes it again. */
  autoMaxDevice: DeviceClass | null
  /**
   * The adaptive ladder's LAST RUNG: cap the device pixel ratio at 1. `(z)`7.
   *
   * Separate from `deviceClass` because `realistic` carries `dprMax: 2` at BOTH classes, so the
   * class ladder cannot reach resolution at all — which is why `v0.31.7.86` measured the chain
   * bottoming out at 29.6 fps. Worth 4.5x (10.9 -> 49.6 fps), the largest lever in this arc, and
   * engaged only after the class ladder AND the shadow fallback are both spent.
   *
   * ## ✅ ACTUATED in `v0.31.7.162`, via `InteractiveDprController`
   *
   * `v0.31.7.144` measured two failed attempts — flipping this left the canvas at 2560x1600. An r3f
   * `setDpr` is **stomped** by `configure()` on every Canvas commit (that controller's docstring
   * records it from a July stack-trace), and clamping the Canvas `dpr` prop did not take either.
   *
   * It works now because the rung is folded into `InteractiveDprController.effectiveDpr()`, which
   * already owns the **raw `gl.setPixelRatio`** level, keeps `viewport.dpr` at the full clamp so
   * `configure()` has nothing to disagree with, and whose rAF loop **heals external stomps** every
   * frame. Verified: `glRatio 2 → 1`, canvas `2560x1600 → 1280x800`, and clean restoration.
   *
   * Measured value, `realistic` walk, two runs each — the win is in **drawn frames and long-frame
   * latency**, not in CPU submit time, which is what a fill-rate lever should look like:
   *
   * | | dpr 2 | dpr 1 |
   * | --- | --- | --- |
   * | drawn fps | 38.6 / 43.8 | **59.8 / 59.8** (vsync cap) |
   * | max frame | 182.9 / 153.4 ms | **16.9 / 12.7 ms** |
   * | p50 | 7.5 / 6.1 ms | 9.8 / 6.5 ms |
   *
   * One coupling to know: the rung rides `interactiveDegrade` (default **on**). With that flag off
   * the app has opted out of resolution degradation entirely, so the rung not firing is consistent.
   */
  dprHalved: boolean
  /** True once a SETTLED value has been restored from persisted prefs, so the
   *  one-time capability boot pick must not overwrite it (TIER-ADAPTIVE). */
  qualityAutoSettled: boolean
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
  /** Manual room order for the per-room editor switcher — a list of room ids.
   *  Empty (the default) means "alphabetical by name". Ids not present fall
   *  back to alphabetical after the ordered ones. Per-device (editorPrefs). */
  roomOrder: string[]
  /** Replace the manual room order (pass [] to reset to alphabetical). */
  setRoomOrder: (order: string[]) => void
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
  /** Cycle Performance → Realistic → Performance (manual). */
  cycleQuality: () => void
  /** Adaptive auto-adjust (does not set qualityUserSet). */
  autoSetQualityTier: (t: RenderTier) => void
  /** Adaptive device-class adjust (does not set qualityUserSet). */
  setDeviceClass: (d: DeviceClass) => void
  /** Record the TIER-ADAPTIVE learned ceiling (does not set qualityUserSet). */
  setDprHalved: (v: boolean) => void
  setAutoMaxDevice: (d: DeviceClass | null) => void
  /** Override a single quality setting (marks qualityUserSet). */
  setQualityOverride: <K extends keyof QualitySettings>(key: K, value: QualitySettings[K]) => void
  /** Drop all overrides so settings follow the tier preset again. */
  resetQualityOverrides: () => void
  /** Set the GLB asset detail tier (`null` = Auto / follow the render tier). */
  setAssetTier: (t: AssetTier | null) => void
  /** Set the tone-mapping look. */
  setToneMapping: (m: ToneMappingSetting) => void
  /** Set the user exposure multiplier (clamped to the supported range). */
  setExposure: (e: number) => void
  /** Set the scene white-balance bias (clamped; COLOR-GRADE). */
  setSceneWarmth: (w: number) => void
  /** Set the scene saturation multiplier (clamped; COLOR-GRADE). */
  setSceneSaturation: (s: number) => void
  setLightsMode: (m: LightsMode) => void
  setPhotographicLook: (v: boolean) => void
  /** Cycle Auto → On → Off → Auto. */
  cycleLightsMode: () => void
  setAutoShadowsOff: (v: boolean) => void
  toggleSnap: () => void
  /** Set the alignment-grid cell size (metres). */
  setGridSize: (m: number) => void
  /** Cycle the grid cell size through the preset sizes. */
  cycleGridSize: () => void
  toggleBudget: () => void
  /** Toggle the whole-renovation budget allocator panel (BSJ-1). */
  toggleRenoBudget: () => void
  toggleClearance: () => void
  toggleWallTypes: () => void
  setRecording: (v: boolean) => void
  /** Record a custom colour as recently-used (deduped, newest-first, capped at 10). */
  pushRecentColor: (hex: string) => void
  /** Record a material id as a recently-applied finish (deduped, capped at 8). */
  pushRecentFinish: (id: string) => void
}

export const UI_INITIAL: Pick<
  UiSlice,
  | 'catalogOpen'
  | 'showFps'
  | 'motionEnabled'
  | 'qualityTier'
  | 'qualityUserSet'
  | 'qualityOverrides'
  | 'assetTier'
  | 'toneMapping'
  | 'exposure'
  | 'sceneWarmth'
  | 'sceneSaturation'
  | 'lightsMode'
  | 'lightMood'
  | 'showCeilingFixtures'
  | 'wallRevealStrength'
  | 'wallRevealScope'
  | 'drawingLayers'
  | 'autoShadowsOff'
  | 'autoMaxDevice'
  | 'dprHalved'
  | 'deviceClass'
  | 'qualityAutoSettled'
  | 'backdrop'
  | 'hdriId'
  | 'customBackdropUrl'
  | 'uiMode'
  | 'density'
  | 'snapEnabled'
  | 'gridSize'
  | 'presenting'
  | 'presentationIncludeTour'
  | 'budgetOpen'
  | 'renoBudgetOpen'
  | 'clearanceOn'
  | 'showWallTypes'
  | 'recording'
  | 'recentColors'
  | 'recentFinishes'
  | 'materialEpoch'
  | 'photographicLook'
  | 'showcaseAccumulating'
  | 'roomEditor'
  | 'roomOrder'
  | 'newPlanOpen'
  | 'bootPhase'
  | 'sceneReady'
  | 'loading'
  | 'lastSavedAt'
> = {
  catalogOpen: false,
  showFps: false,
  motionEnabled: true,
  qualityTier: 'performance',
  qualityUserSet: false,
  qualityOverrides: {},
  // `weak` until a live GL context is inspected: the safe floor, and the same
  // choice the retired `detectCapabilityCeiling` made with no context.
  deviceClass: 'weak' as DeviceClass,
  assetTier: null,
  toneMapping: DEFAULT_TONE_MAPPING_SETTING,
  exposure: DEFAULT_EXPOSURE,
  sceneWarmth: DEFAULT_SCENE_WARMTH,
  sceneSaturation: DEFAULT_SCENE_SATURATION,
  lightsMode: 'off',
  photographicLook: false,
  lightMood: 'none' as LightMood,
  showCeilingFixtures: false,
  wallRevealStrength: DEFAULT_WALL_REVEAL_STRENGTH,
  wallRevealScope: 'exterior' as const,
  drawingLayers: {} as DrawingLayerVisibility,
  autoShadowsOff: false,
  autoMaxDevice: null,
  dprHalved: false,
  qualityAutoSettled: false,
  snapEnabled: false,
  gridSize: 0.5,
  // WINDOW-SKY-DEFAULT (v0.31.5.92): `'sky'`, not `'city'`. The static `city`
  // preset is authored at ONE time of day and paints warm lit tower windows at
  // every hour, so with the curtains open (v0.31.5.88) the default flat showed a
  // night skyline at 13:00 — measured identical to 0.1 rgb between 09:00 and
  // 13:00. `'sky'` is the sun-driven analytic backdrop, so the view out of the
  // window tracks the clock the interior is already graded by.
  backdrop: 'sky' as BackdropKind,
  hdriId: null as string | null,
  customBackdropUrl: null,
  uiMode: 'simple' as UiMode,
  density: 'comfortable' as Density,
  presenting: false,
  presentationIncludeTour: false,
  newPlanOpen: false,
  budgetOpen: false,
  renoBudgetOpen: false,
  clearanceOn: false,
  showWallTypes: false,
  recording: false,
  recentColors: [],
  recentFinishes: [],
  materialEpoch: 0,
  showcaseAccumulating: false,
  roomEditor: { active: false, roomId: null },
  roomOrder: [],
  bootPhase: 'hydrating',
  sceneReady: false,
  loading: { active: false, label: '' },
  lastSavedAt: null,
}

/** Preset alignment-grid cell sizes (metres). Finer steps (down to 25 mm) allow
 *  precise wall/opening snapping; coarser ones keep rough sketching fast. */
export const GRID_SIZES = [0.025, 0.05, 0.1, 0.25, 0.5, 1] as const

const CYCLE: RenderTier[] = RENDER_TIERS
const LIGHTS_CYCLE: LightsMode[] = ['on', 'off']

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set, get) => ({
  ...UI_INITIAL,
  setBootReady: () => set({ bootPhase: 'ready' }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  showLoading: (label) => set({ loading: { active: true, label } }),
  hideLoading: () => set((s) => ({ loading: { ...s.loading, active: false } })),
  setRoomOrder: (order) => set({ roomOrder: [...order] }),
  enterRoomEditor: (roomId) => {
    // Graphics settings are GLOBAL + persistent (bugs #13/#16): the per-room
    // editor no longer forces its own quality/asset tier — it inherits whatever
    // tier the user set for orbit, and never clobbers the persisted value. (It
    // previously pinned `performance`/`high` and restored on exit via a
    // module-level snapshot, which lost the user's setting on reload and could
    // strand the walkthrough transition when tiers churned on every enter/exit.)
    set({
      roomEditor: { active: true, roomId },
      cameraMode: 'orbit',
      loading: { active: true, label: 'Entering room…' },
      // Enter a fresh room with nothing pre-selected — a selection carried in
      // from another room would show a stale Inspector for a piece you can't see.
      selectedItemId: null,
      selectedItemIds: [],
    })
  },
  setDprHalved: (v: boolean) => {
    set({ dprHalved: v })
  },
  exitRoomEditor: () => {
    // Orbit/walk over the whole flat are view-only, so any selection made in
    // the editor must clear — otherwise a stale Inspector/Finish picker would
    // linger with no way to dismiss it (nothing is selectable outside the editor).
    get().selectItem(null)
    set({
      roomEditor: { active: false, roomId: null },
      loading: { active: true, label: 'Exiting room…' },
    })
  },
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
  setShowFps: (show) => set({ showFps: show }),
  toggleShowFps: () => set((s) => ({ showFps: !s.showFps })),
  setMotionEnabled: (motionEnabled) => set({ motionEnabled }),
  toggleMotion: () => set((s) => ({ motionEnabled: !s.motionEnabled })),
  bumpMaterialEpoch: () => set((s) => ({ materialEpoch: s.materialEpoch + 1 })),
  setShowcaseAccumulating: (v) => set({ showcaseAccumulating: v }),
  setQualityTier: (t) => {
    // Loud in DEV on an unknown mode. `resolveQuality` falls back to the FLATTEST
    // preset for a tier it does not recognise -- correct for a value persisted by
    // an older build, silent and wrong for a caller that simply passed the wrong
    // string. The two-mode collapse turned 63 dev probes' `TIER=medium` /
    // `TIER=maximum` defaults into exactly that: they kept running and quietly
    // measured flat shading. A persisted legacy value never reaches here (it is
    // mapped at load by `qualityPrefs`'s LEGACY_TIERS), so anything invalid at this
    // point is a bug in the caller.
    if (import.meta.env.DEV && !RENDER_TIERS.includes(t)) {
      console.error(
        `setQualityTier: unknown mode ${JSON.stringify(t)}. Valid: ${RENDER_TIERS.join(' | ')}. ` +
          'Rendering will fall back to the flattest preset, which silently invalidates any ' +
          'measurement taken from it.',
      )
    }
    const changed = get().qualityTier !== t
    // Keep the material layer's IBL flag in step. Metals with no environment to
    // reflect render black, so `getMetalMaterial`/`getSolidMaterial` cap
    // metalness while this is false — and they must see the right value at the
    // moment a material is BUILT, which for the shell (door leaves, 0.8 × 2.1 m)
    // is during the first mount, well before SceneEnvironment's effect runs.
    syncIblFromTier(t, get().qualityOverrides, get().deviceClass)
    set({ qualityTier: t, qualityUserSet: true, qualityOverrides: {}, autoShadowsOff: false })
    // Rebuilding the renderer under a new tier (new shadow maps, post effects,
    // asset swaps…) can visibly freeze the frame for a beat, especially
    // stepping up to Maximum — mask it with the transition overlay so the
    // user sees feedback instead of a stuck settings panel. Only on an actual
    // change (re-clicking the active tier is a no-op, no flash); readiness-based
    // hide (App.tsx's scheduleTransitionHide effect, keyed on loading.active)
    // reveals again once the scene has rendered a few frames under the new tier.
    if (changed) get().showLoading(`Applying ${QUALITY_LABEL[t]} quality…`)
  },
  cycleQuality: () =>
    set((s) => ({
      qualityTier: CYCLE[(CYCLE.indexOf(s.qualityTier) + 1) % CYCLE.length],
      qualityUserSet: true,
      qualityOverrides: {},
      autoShadowsOff: false,
    })),
  autoSetQualityTier: (t) => {
    syncIblFromTier(t, get().qualityOverrides, get().deviceClass)
    set((s) => (s.qualityUserSet || s.qualityTier === t ? {} : { qualityTier: t }))
  },
  setQualityOverride: (key, value) =>
    set((s) => ({
      qualityOverrides: { ...s.qualityOverrides, [key]: value },
      qualityUserSet: true,
    })),
  resetQualityOverrides: () => set({ qualityOverrides: {} }),
  setAssetTier: (t) => set({ assetTier: t }),
  setToneMapping: (toneMapping) => set({ toneMapping }),
  setExposure: (e) => set({ exposure: clampExposure(e) }),
  setSceneWarmth: (w) => set({ sceneWarmth: clampSceneWarmth(w) }),
  setSceneSaturation: (sat) => set({ sceneSaturation: clampSceneSaturation(sat) }),
  setLightsMode: (m) => set({ lightsMode: m }),
  setPhotographicLook: (v) => set({ photographicLook: v }),
  setLightMood: (m) => set({ lightMood: m }),
  setShowCeilingFixtures: (v) => set({ showCeilingFixtures: v }),
  setWallRevealStrength: (v) => set({ wallRevealStrength: Math.min(1, Math.max(0, v)) }),
  setWallRevealScope: (s) => set({ wallRevealScope: s }),
  setDrawingLayer: (layer, on) =>
    set((s) => ({ drawingLayers: { ...s.drawingLayers, [layer]: on } })),
  setPresenting: (presenting) => set({ presenting }),
  setPresentationIncludeTour: (presentationIncludeTour) => set({ presentationIncludeTour }),
  cycleLightsMode: () =>
    set((s) => ({
      lightsMode: LIGHTS_CYCLE[(LIGHTS_CYCLE.indexOf(s.lightsMode) + 1) % LIGHTS_CYCLE.length],
    })),
  setAutoShadowsOff: (v) => set({ autoShadowsOff: v }),
  setAutoMaxDevice: (d) => set({ autoMaxDevice: d }),
  setDeviceClass: (d) => {
    // Must resync IBL like a mode change does: `ibl` is false in
    // performance/weak and true in performance/capable, so a class step changes
    // it. Without this the flag goes stale in exactly the way the
    // `syncIblFromTier` note above describes — materials read the wrong value at
    // BUILD time and there is no effect that comes back to fix them.
    syncIblFromTier(get().qualityTier, get().qualityOverrides, d)
    set({ deviceClass: d })
  },
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setGridSize: (m) => set({ gridSize: m }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setHdri: (hdriId) => set({ hdriId }),
  setCustomBackdropUrl: (url) =>
    set((s) => {
      // Revoke the previous live URL so swapping photos doesn't leak blobs.
      if (s.customBackdropUrl && s.customBackdropUrl !== url) {
        try {
          URL.revokeObjectURL(s.customBackdropUrl)
        } catch {
          /* not a revocable URL */
        }
      }
      return { customBackdropUrl: url }
    }),
  setUiMode: (uiMode) => {
    set({ uiMode })
    // Pro features are gated on the mode, so re-resolve the flag map when it flips.
    get().reresolveFeatureFlags()
  },
  setDensity: (density) => set({ density }),
  cycleGridSize: () =>
    set((s) => {
      const i = GRID_SIZES.indexOf(s.gridSize as (typeof GRID_SIZES)[number])
      return { gridSize: GRID_SIZES[(i + 1) % GRID_SIZES.length] }
    }),
  setNewPlanOpen: (open) => set({ newPlanOpen: open }),
  toggleBudget: () => set((s) => ({ budgetOpen: !s.budgetOpen })),
  toggleRenoBudget: () => set((s) => ({ renoBudgetOpen: !s.renoBudgetOpen })),
  toggleClearance: () => set((s) => ({ clearanceOn: !s.clearanceOn })),
  toggleWallTypes: () => set((s) => ({ showWallTypes: !s.showWallTypes })),
  setRecording: (v) => set({ recording: v }),
  pushRecentColor: (hex) =>
    set((s) => ({
      recentColors: [
        hex,
        ...s.recentColors.filter((c) => c.toLowerCase() !== hex.toLowerCase()),
      ].slice(0, 10),
    })),
  pushRecentFinish: (id) =>
    set((s) => ({ recentFinishes: [id, ...s.recentFinishes.filter((f) => f !== id)].slice(0, 8) })),
})
