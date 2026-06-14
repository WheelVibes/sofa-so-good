/**
 * Central feature-flag registry — the single source of truth for what ships to
 * production. Every gateable feature has one entry here with a production
 * `default`. `devOnly` flags are forced **off** in a production build regardless
 * of any override (so dev/QA-only surfaces can never leak to prod).
 *
 * Defaults can be overridden at runtime for local dev / QA / staging via:
 *   - localStorage `hdb_feature_flags` — a JSON map `{ "report": false }`
 *   - a URL param `?ff=report:off,walkthrough:on`
 * Overrides are **ignored in a production build**, so a shipped build always
 * reflects this registry — flip a flag here (and redeploy) to change prod.
 *
 * Pure + dependency-free so it can be unit-tested and read from anywhere
 * (components via the `featureFlags` store slice + `useFeature`, non-React code
 * via `isFeatureEnabled`).
 */

export type FeatureFlag =
  | 'report'
  | 'walkthrough'
  | 'sunStudy'
  | 'measure'
  | 'budget'
  | 'clearanceChecks'
  | 'versions'
  | 'history'
  | 'shareExport'
  | 'floorPlanEditor'
  | 'smartStart'
  | 'textBrief'
  | 'panorama'
  | 'panoTour'
  | 'renderPresets'
  | 'hqRender'
  | 'vrWalkthrough'
  | 'savedViews'
  | 'backdrops'
  | 'packs'
  | 'remoteMaterials'
  | 'modelUpload'
  | 'aiPhotoreal'
  | 'aiWalls'
  | 'ikeaLive'
  | 'livePrices'
  | 'drawings'
  | 'daylight'
  | 'designScore'
  | 'accessibility'
  | 'moodboard'
  | 'paletteFromPhoto'
  | 'dxfExport'
  | 'boq'
  | 'sceneExport3d'
  | 'batchRender'
  | 'shopExport'
  | 'suggestions'
  | 'electricalPlan'
  | 'mountHeights'
  | 'copyAppearance'
  | 'userSets'
  | 'designerPicks'
  | 'ceilingDesign'
  | 'presentation'
  | 'pbrSurfaces'
  | 'comments'
  | 'finishDnd'
  | 'parametricFurniture'
  | 'kitchenCabinets'
  | 'renderCompare'
  | 'crownMolding'
  | 'windowGlassTint'
  | 'curtainLightEffect'
  | 'walkCameraControls'
  | 'replaceSimilar'
  | 'customBackdrop'
  | 'planLabels'
  | 'plumbingPlan'
  | 'itemAsLight'
  | 'aiLayout'
  | 'planPolyline'
  | 'tiltFurniture'
  | 'catalogModelInfo'
  | 'curvedWalls'
  | 'slopingWalls'
  | 'viewInAr'
  | 'floorTexture'
  | 'planCompass'

export interface FlagDef {
  /** Short human label for the dev flags panel. */
  label: string
  /** What the flag gates. */
  description: string
  /** Production default when no override applies. */
  default: boolean
  /** Forced off in a production build (a dev/QA-only surface). */
  devOnly?: boolean
  /**
   * UI tier: `simple` features are part of the minimal core experience and show
   * in both Simple and Pro mode; `pro` features are advanced/professional and are
   * **forced off in Simple mode** (the app's default), keeping the simple UI
   * uncluttered. Every flag must declare a tier (see CLAUDE.md).
   */
  tier: 'simple' | 'pro'
}

/** The registry. Order here is the display order in the dev panel.
 *  `tier` categorises each feature for Simple/Pro mode (see CLAUDE.md): Simple =
 *  the minimal core design loop (furnish, finish, view, share, budget); Pro =
 *  everything analytical/professional/advanced, hidden in Simple mode. */
export const FEATURE_FLAGS: Record<FeatureFlag, FlagDef> = {
  report: {
    label: 'Design report',
    description: 'Printable PDF report (Tools / Share)',
    default: true,
    tier: 'pro',
  },
  walkthrough: {
    label: 'Walkthrough',
    description: 'Auto camera tour + recording',
    default: true,
    tier: 'simple',
  },
  sunStudy: { label: 'Sun study', description: 'Time-lapse sun path', default: true, tier: 'pro' },
  measure: {
    label: 'Measure',
    description: 'Tape / area measure tool',
    default: true,
    tier: 'pro',
  },
  budget: {
    label: 'Budget',
    description: 'Shopping list + budget panel',
    default: true,
    tier: 'simple',
  },
  clearanceChecks: {
    label: 'Clearance checks',
    description: 'Door-swing / fit checks',
    default: true,
    tier: 'pro',
  },
  versions: {
    label: 'Versions',
    description: 'Save / restore / compare snapshots',
    default: true,
    tier: 'pro',
  },
  history: {
    label: 'Edit history',
    description: 'Undo timeline panel',
    default: true,
    tier: 'pro',
  },
  shareExport: {
    label: 'Share & export',
    description: 'Share modal (link / PNG / file)',
    default: true,
    tier: 'simple',
  },
  floorPlanEditor: {
    label: 'Floor-plan editor',
    description: '2D plan editor',
    default: true,
    tier: 'simple',
  },
  smartStart: {
    label: 'Smart Start',
    description: 'One-click furnish wizard',
    default: true,
    tier: 'simple',
  },
  textBrief: {
    label: 'Describe-it brief',
    description: 'Free-text brief matched to a Smart Start style + budget',
    default: true,
    tier: 'simple',
  },
  panorama: {
    label: '360° panorama',
    description: 'Equirect 360° capture with drag-to-look viewer + PNG export',
    default: true,
    tier: 'pro',
  },
  panoTour: {
    label: '360° tour',
    description: 'Linked multi-room panorama tour with clickable room-to-room hotspots',
    default: true,
    tier: 'pro',
  },
  renderPresets: {
    label: 'Render presets',
    description: 'One-tap sun + tone + exposure photo modes in the Scene menu',
    default: true,
    tier: 'simple',
  },
  hqRender: {
    label: 'HQ render',
    description: 'Progressive path-traced photoreal still (three-gpu-pathtracer)',
    default: true,
    tier: 'pro',
  },
  vrWalkthrough: {
    label: 'VR walkthrough',
    description: 'WebXR immersive walkthrough on supported headsets',
    default: true,
    tier: 'pro',
  },
  savedViews: {
    label: 'Saved views',
    description: 'Camera bookmarks',
    default: true,
    tier: 'simple',
  },
  backdrops: {
    label: 'Backdrops',
    description: 'Selectable equirectangular photo view through windows in walk mode (city/dusk/…)',
    default: true,
    tier: 'simple',
  },
  packs: {
    label: 'Content packs',
    description: 'Downloadable furniture/material packs',
    default: true,
    tier: 'pro',
  },
  remoteMaterials: {
    label: 'Online materials',
    description: 'CC0 material browser',
    default: true,
    tier: 'pro',
  },
  modelUpload: {
    label: 'Model upload',
    description: 'Import GLB / OBJ / … models',
    default: true,
    tier: 'pro',
  },
  aiPhotoreal: {
    label: 'AI photoreal export',
    description: 'BYO-key image-to-image (experimental)',
    default: true,
    tier: 'pro',
  },
  aiWalls: {
    label: 'AI wall recognition',
    description: 'Vision-model plan tracing (experimental)',
    default: true,
    tier: 'pro',
  },
  ikeaLive: {
    label: 'IKEA live scrape',
    description: 'Local scraper pack (needs a sidecar)',
    default: true,
    devOnly: true,
    tier: 'pro',
  },
  livePrices: {
    label: 'Live SG retailer prices',
    description: 'Live price lookup — IKEA/Courts/HipVan/Castlery (needs a sidecar)',
    default: true,
    devOnly: true,
    tier: 'pro',
  },
  drawings: {
    label: 'Drawings',
    description: 'Wall elevations + lighting plan panel',
    default: true,
    tier: 'pro',
  },
  daylight: {
    label: 'Daylight check',
    description: 'Window glazing & ventilation per room',
    default: true,
    tier: 'pro',
  },
  designScore: {
    label: 'Design score',
    description: 'Aggregate layout-quality grade + fixes',
    default: true,
    tier: 'pro',
  },
  accessibility: {
    label: 'Accessibility check',
    description: 'Door widths + wheelchair turning space',
    default: true,
    tier: 'pro',
  },
  moodboard: {
    label: 'Moodboard',
    description: 'Shareable style-board export',
    default: true,
    tier: 'pro',
  },
  paletteFromPhoto: {
    label: 'Palette from photo',
    description: 'Extract a palette from an image → finishes',
    default: true,
    tier: 'pro',
  },
  dxfExport: {
    label: 'DXF export',
    description: '2D plan → DXF for CAD/contractor handoff',
    default: true,
    tier: 'pro',
  },
  boq: {
    label: 'Quote (BOQ)',
    description: 'Bill-of-quantities quote export',
    default: true,
    tier: 'pro',
  },
  // Whole-scene 3D export (Q-3DEXPORT / SweetHome3DJS ObjWriter+glTF parity). The
  // furnished home → glTF/GLB (+ OBJ) for Blender / AR / Coohom hand-off. Pure
  // client-side three GLTFExporter/OBJExporter (dynamic-imported) → prod-safe, no
  // sidecar. A portability/hand-off export like dxfExport/boq → pro tier.
  sceneExport3d: {
    label: 'Export 3D model',
    description: 'Whole furnished scene → glTF/GLB (+ OBJ) for Blender / AR / Coohom',
    default: true,
    tier: 'pro',
  },
  batchRender: {
    label: 'Render all views',
    description: 'Batch-export a PNG of every saved camera view in one click (SweetHome3D parity)',
    default: true,
    tier: 'pro',
  },
  shopExport: {
    label: 'Shopping list export',
    description: 'Shoppable buy-list HTML — items, prices, per-retailer totals',
    default: true,
    tier: 'simple',
  },
  suggestions: {
    label: 'Design suggestions',
    description: 'Contextual "what to add" hints in Design score',
    default: true,
    tier: 'pro',
  },
  electricalPlan: {
    label: 'Electrical plan',
    description: 'Power / data / switch layout in the drawing set',
    default: true,
    tier: 'pro',
  },
  mountHeights: {
    label: 'Mount-height presets',
    description: 'One-tap standard heights for wall/ceiling items',
    default: true,
    tier: 'pro',
  },
  copyAppearance: {
    label: 'Copy appearance',
    description: 'Copy/paste finish between items + recolour a category',
    default: true,
    tier: 'pro',
  },
  userSets: {
    label: 'My sets',
    description: 'Save a selection as a reusable furniture set',
    default: true,
    tier: 'pro',
  },
  designerPicks: {
    label: 'Designer picks',
    description: 'Curated one-tap floor/wall finishes in the picker',
    default: true,
    tier: 'simple',
  },
  ceilingDesign: {
    label: 'Ceiling design',
    description: 'Per-room tray / coffered / dropped ceilings',
    default: true,
    tier: 'pro',
  },
  presentation: {
    label: 'Presentation mode',
    description: 'Full-screen saved-views slideshow with notes',
    default: true,
    tier: 'pro',
  },
  pbrSurfaces: {
    label: 'Realistic surfaces',
    description: 'Higher-fidelity procedural furniture textures (wood/painted/fabric)',
    default: true,
    tier: 'simple',
  },
  comments: {
    label: 'Comments',
    description: 'Pinned design comments — notes anchored in the 3D scene',
    default: true,
    tier: 'pro',
  },
  finishDnd: {
    label: 'Drag-to-apply finishes',
    description: 'Drag a finish swatch onto the 3D scene or the Objects list to apply it',
    default: true,
    tier: 'simple',
  },
  // An authoring tool (CLAUDE.md: authoring tools are pro-tier), prod-safe
  // pure code → ships on by default.
  parametricFurniture: {
    label: 'Custom-size furniture',
    description: 'Generate shelving / wardrobes / sideboards to exact dimensions',
    default: true,
    tier: 'pro',
  },
  // Parametric kitchen cabinet run (C270). Authoring tool → pro tier.
  // Pure procedural geometry → prod-safe, default on.
  kitchenCabinets: {
    label: 'Custom kitchen cabinets',
    description: 'Generate a parametric kitchen base-cabinet run with optional upper cabinets',
    default: true,
    tier: 'pro',
  },
  // Analytical/professional feature (comparing render presets → pro tier, F4 tail).
  // Prod-safe pure code → default on.
  renderCompare: {
    label: 'Render preset compare',
    description: 'A/B compare two render presets with a draggable before/after divider',
    default: true,
    tier: 'pro',
  },
  // Decorative wall–ceiling trim (T2). Pure procedural geometry, no external
  // assets → prod-safe. Crown molding is a core finish detail visible in casual
  // use, so it belongs in Simple tier.
  crownMolding: {
    label: 'Crown molding',
    description: 'Decorative trim strip at the wall–ceiling junction with miter-cut corners',
    default: true,
    tier: 'simple',
  },
  // Window-glass tint: colours the sun light (C275). Pure code, no external
  // assets → prod-safe, default on. Simple tier — a subtle realism layer visible
  // in casual use.
  windowGlassTint: {
    label: 'Window glass tint',
    description: 'Optionally tint the sun colour as it enters through window glass',
    default: true,
    tier: 'simple',
  },
  // Curtain light attenuation: drawn curtains dim sunlight (C275). Pure code →
  // prod-safe, default on. Simple tier — affects the core furnish experience.
  curtainLightEffect: {
    label: 'Curtain light attenuation',
    description: 'Drawn curtains dim the sun entering through windows',
    default: true,
    tier: 'simple',
  },
  // Walk-mode observer camera controls (Sweet Home 3D parity, PARITY-WALKCAM):
  // field-of-view + eye-height sliders in the walk HUD. Pure code, no external
  // assets → prod-safe. Pro tier — a fine-tuning control beyond the core loop.
  walkCameraControls: {
    label: 'Walk camera controls',
    description: 'Adjust field-of-view + eye-height in first-person walk mode',
    default: true,
    tier: 'pro',
  },
  // Replace-with-similar (PARITY-REPLACE): swap a placed item for a nearest-size
  // catalog sibling in one click, keeping its position/rotation/level. An
  // advanced editing aid → pro tier. Pure code, no external assets → prod-safe.
  replaceSimilar: {
    label: 'Replace with similar',
    description: 'Swap a placed item for a nearest-size catalog alternative, keeping its place',
    default: true,
    tier: 'pro',
  },
  // Upload-your-own walk-mode backdrop photo (the `custom` backdrop). Pure
  // client-side — the user's own image, persisted in IDB; no licensing →
  // prod-safe. Simple tier — part of the core backdrop/view experience.
  customBackdrop: {
    label: 'Custom backdrop photo',
    description: 'Upload your own photo as the walk-mode window view',
    default: true,
    tier: 'simple',
  },
  // 2D-plan furniture name/price labels (Sweet Home 3D parity). A drawing/
  // annotation aid → pro tier. Pure code, no external assets → prod-safe.
  planLabels: {
    label: 'Plan labels',
    description: 'Show furniture names / prices on the 2D floor plan',
    default: true,
    tier: 'pro',
  },
  // Plumbing plan sheet in the drawing set (mirrors electricalPlan). Pure code,
  // no external assets → prod-safe. A technical drawing → pro tier.
  plumbingPlan: {
    label: 'Plumbing plan',
    description: 'Water-supply / drainage layout sheet in the drawing set',
    default: true,
    tier: 'pro',
  },
  // Turn any placed item into a night light source (SH3D parity). Pure code,
  // feeds the existing FurnitureLights system → prod-safe. Pro tier (an
  // advanced lighting control beyond the core loop).
  itemAsLight: {
    label: 'Item as light source',
    description: 'Make any placed item emit light at night',
    default: true,
    tier: 'pro',
  },
  // AI auto-furnish (PARITY-AILAYOUT): LLM proposes a layout from a brief. BYO
  // model key (no key bundled); experimental → pro tier, prod-safe (pure code +
  // graceful no-key error, like aiWalls/aiPhotoreal).
  aiLayout: {
    label: 'AI auto-furnish',
    description: 'Furnish rooms from a text brief via a BYO-key LLM (experimental)',
    default: true,
    tier: 'pro',
  },
  planPolyline: {
    label: 'Plan polyline markup',
    description: 'Free-form polyline annotations (open/closed, dashed, arrow) in the 2D editor',
    default: true,
    tier: 'pro',
  },
  // Multi-axis furniture tilt (SweetHome3DJS parity): pitch/roll an item off
  // vertical (angle a picture, recline a backrest, bank a decor piece). Pure
  // code, no external assets → prod-safe. An advanced placement control beyond
  // the core furnish loop → pro tier.
  tiltFurniture: {
    label: 'Tilt furniture',
    description: 'Pitch / roll an item off vertical (angle art, recline, bank) in the inspector',
    default: true,
    tier: 'pro',
  },
  // Catalog card model metadata tooltip (SweetHome3DJS FurnitureTablePanel
  // parity): model byte size + creator/licence on hover. Pure code → prod-safe.
  // An informational/pro detail → pro tier.
  catalogModelInfo: {
    label: 'Catalog model info',
    description: 'Show a model’s size + creator / licence in the catalog card tooltip',
    default: true,
    tier: 'pro',
  },
  // Curved/arc walls (SweetHome3DJS parity): drag a wall's midpoint handle to
  // bulge it into a curve. Pure geometry (chord sub-segments) → prod-safe. A
  // structural drawing tool → pro tier.
  curvedWalls: {
    label: 'Curved walls',
    description: 'Bow a wall into a curve by dragging its midpoint handle (no openings on curves)',
    default: true,
    tier: 'pro',
  },
  // Sloping (variable-height) walls (SweetHome3DJS parity): a shed/mono-pitch
  // wall whose top ramps from a start to an end height, rendered as a prism.
  // Pure geometry → prod-safe. A structural drawing tool → pro tier.
  slopingWalls: {
    label: 'Sloping walls',
    description: 'Give a wall a sloped (shed) top — different heights at each end (no openings)',
    default: true,
    tier: 'pro',
  },
  // "View in your room" AR: iOS AR Quick Look from a USDZ (blob), GLB download
  // elsewhere. Pure client-side (no backend/dep) → prod-safe. A high-wow viewing
  // surface beyond the core loop → pro tier.
  viewInAr: {
    label: 'View in AR',
    description: 'Place the design in your room — iOS AR Quick Look (USDZ) or an AR-ready GLB',
    default: true,
    tier: 'pro',
  },
  // Per-room floor-texture transform (SweetHome3DJS texture scale/angle parity):
  // scale the tile size + rotate the floor texture. Pure geometry-UV transform →
  // prod-safe. A surface-design refinement → pro tier.
  floorTexture: {
    label: 'Floor texture transform',
    description: 'Scale + rotate a room’s floor texture (tile size / angle)',
    default: true,
    tier: 'pro',
  },
  // North/compass rose on the 2D plan (SweetHome3DJS compass parity). Pure
  // overlay reflecting the orientation. Pro tier — a plan annotation aid.
  planCompass: {
    label: 'Plan compass',
    description: 'Show a North/compass rose on the 2D floor plan',
    default: true,
    tier: 'pro',
  },
}

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[]

export type FlagOverrides = Partial<Record<FeatureFlag, boolean>>

const LS_KEY = 'hdb_feature_flags'
const URL_PARAM = 'ff'

function isFlag(k: string): k is FeatureFlag {
  return k in FEATURE_FLAGS
}

/**
 * Resolve the effective flag map. A normal production session is locked to the
 * registry (`devOnly` → off, everything else → its default, no overrides). A
 * **privileged** session (dev build *or* a signed-in admin) unlocks `devOnly`
 * flags and honours overrides — so an ordinary shipped build can't be flipped by
 * a stray URL/LS value, but an admin (or dev) can toggle features for QA.
 *
 * `uiMode` gates the Simple/Pro experience: a `pro`-tier feature is forced **off**
 * in Simple mode (the app default) so the simple UI stays minimal, while Simple
 * mode still retains the core design loop (every `simple`-tier feature stays on).
 * `pro` is the default here so non-store callers (tests) see the full set.
 */
export function resolveFlags(
  isDev: boolean,
  overrides: FlagOverrides = {},
  isAdmin = false,
  uiMode: 'simple' | 'pro' = 'pro',
): Record<FeatureFlag, boolean> {
  const privileged = isDev || isAdmin
  const out = {} as Record<FeatureFlag, boolean>
  for (const key of FEATURE_FLAG_KEYS) {
    const def = FEATURE_FLAGS[key]
    if (def.devOnly && !privileged) {
      out[key] = false
    } else if (def.tier === 'pro' && uiMode === 'simple') {
      // Pro features are hidden in Simple mode regardless of default/override.
      out[key] = false
    } else if (privileged && key in overrides) {
      out[key] = overrides[key]!
    } else {
      out[key] = def.default
    }
  }
  return out
}

/** Parse a `?ff=report:off,walkthrough:on` string into an overrides map. */
export function parseFlagOverrides(raw: string | null | undefined): FlagOverrides {
  const out: FlagOverrides = {}
  if (!raw) return out
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':').map((s) => s.trim())
    if (k && isFlag(k) && (v === 'on' || v === 'off')) out[k] = v === 'on'
  }
  return out
}

/** Parse a localStorage JSON overrides map, ignoring unknown keys / bad JSON. */
export function parseStoredOverrides(raw: string | null | undefined): FlagOverrides {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: FlagOverrides = {}
    for (const [k, v] of Object.entries(obj)) {
      if (isFlag(k) && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Read overrides from localStorage + URL (URL wins). Safe in non-browser envs. */
export function loadOverrides(): FlagOverrides {
  let stored: FlagOverrides = {}
  let url: FlagOverrides = {}
  try {
    stored = parseStoredOverrides(globalThis.localStorage?.getItem(LS_KEY))
  } catch {
    /* localStorage may throw (privacy mode) */
  }
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '')
    url = parseFlagOverrides(params.get(URL_PARAM))
  } catch {
    /* no location */
  }
  return { ...stored, ...url }
}

/** Persist a single override to localStorage (dev/QA). Pass `undefined` to clear it. */
export function persistOverride(flag: FeatureFlag, value: boolean | undefined): void {
  try {
    const current = parseStoredOverrides(globalThis.localStorage?.getItem(LS_KEY))
    if (value === undefined) delete current[flag]
    else current[flag] = value
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
}

export function clearStoredOverrides(): void {
  try {
    globalThis.localStorage?.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

// Module-level resolved snapshot — resolved once from the build env + overrides.
// The store slice mirrors this for reactive UI; non-React callers read here.
let cache: Record<FeatureFlag, boolean> | null = null

function resolved(): Record<FeatureFlag, boolean> {
  if (!cache) cache = resolveFlags(!!import.meta.env?.DEV, loadOverrides())
  return cache
}

/** Is a feature on for this build/session? Non-reactive (load-time snapshot);
 *  React UI should use the store slice + `useFeature` so toggles re-render. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return resolved()[flag]
}

/** Replace the module snapshot (used by the store slice when a flag is toggled,
 *  so non-React `isFeatureEnabled` callers see the change too). */
export function setResolvedFlags(next: Record<FeatureFlag, boolean>): void {
  cache = next
}
