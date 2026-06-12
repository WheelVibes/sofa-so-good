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
  | 'lightingMoods'
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
    description: 'Selectable surroundings (city/park/…)',
    default: true,
    tier: 'simple',
  },
  lightingMoods: {
    label: 'Lighting moods',
    description: 'Golden hour / night presets',
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
