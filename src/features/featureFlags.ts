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

export interface FlagDef {
  /** Short human label for the dev flags panel. */
  label: string
  /** What the flag gates. */
  description: string
  /** Production default when no override applies. */
  default: boolean
  /** Forced off in a production build (a dev/QA-only surface). */
  devOnly?: boolean
}

/** The registry. Order here is the display order in the dev panel. */
export const FEATURE_FLAGS: Record<FeatureFlag, FlagDef> = {
  report: {
    label: 'Design report',
    description: 'Printable PDF report (Tools / Share)',
    default: true,
  },
  walkthrough: { label: 'Walkthrough', description: 'Auto camera tour + recording', default: true },
  sunStudy: { label: 'Sun study', description: 'Time-lapse sun path', default: true },
  measure: { label: 'Measure', description: 'Tape / area measure tool', default: true },
  budget: { label: 'Budget', description: 'Shopping list + budget panel', default: true },
  clearanceChecks: {
    label: 'Clearance checks',
    description: 'Door-swing / fit checks',
    default: true,
  },
  versions: { label: 'Versions', description: 'Save / restore / compare snapshots', default: true },
  history: { label: 'Edit history', description: 'Undo timeline panel', default: true },
  shareExport: {
    label: 'Share & export',
    description: 'Share modal (link / PNG / file)',
    default: true,
  },
  floorPlanEditor: { label: 'Floor-plan editor', description: '2D plan editor', default: true },
  smartStart: { label: 'Smart Start', description: 'One-click furnish wizard', default: true },
  savedViews: { label: 'Saved views', description: 'Camera bookmarks', default: true },
  backdrops: {
    label: 'Backdrops',
    description: 'Selectable surroundings (city/park/…)',
    default: true,
  },
  lightingMoods: {
    label: 'Lighting moods',
    description: 'Golden hour / night presets',
    default: true,
  },
  packs: {
    label: 'Content packs',
    description: 'Downloadable furniture/material packs',
    default: true,
  },
  remoteMaterials: {
    label: 'Online materials',
    description: 'CC0 material browser',
    default: true,
  },
  modelUpload: { label: 'Model upload', description: 'Import GLB / OBJ / … models', default: true },
  aiPhotoreal: {
    label: 'AI photoreal export',
    description: 'BYO-key image-to-image (experimental)',
    default: true,
  },
  aiWalls: {
    label: 'AI wall recognition',
    description: 'Vision-model plan tracing (experimental)',
    default: true,
  },
  ikeaLive: {
    label: 'IKEA live scrape',
    description: 'Local scraper pack (needs a sidecar)',
    default: true,
    devOnly: true,
  },
  livePrices: {
    label: 'Live IKEA prices',
    description: 'Live price lookup (needs a sidecar)',
    default: true,
    devOnly: true,
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
 */
export function resolveFlags(
  isDev: boolean,
  overrides: FlagOverrides = {},
  isAdmin = false,
): Record<FeatureFlag, boolean> {
  const privileged = isDev || isAdmin
  const out = {} as Record<FeatureFlag, boolean>
  for (const key of FEATURE_FLAG_KEYS) {
    const def = FEATURE_FLAGS[key]
    if (def.devOnly && !privileged) {
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
