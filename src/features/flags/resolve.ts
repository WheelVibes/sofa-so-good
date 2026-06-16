/**
 * Feature-flag resolution + override plumbing. Turns the static registry
 * (`./registry`) plus the build env + dev/QA overrides into the effective on/off
 * map, and exposes the module-level snapshot read by non-React `isFeatureEnabled`.
 *
 * Defaults can be overridden at runtime for local dev / QA / staging via:
 *   - localStorage `hdb_feature_flags` — a JSON map `{ "report": false }`
 *   - a URL param `?ff=report:off,walkthrough:on`
 * Overrides are **ignored in a production build**, so a shipped build always
 * reflects the registry — flip a flag there (and redeploy) to change prod.
 *
 * Pure + dependency-free so it can be unit-tested and read from anywhere
 * (components via the `featureFlags` store slice + `useFeature`, non-React code
 * via `isFeatureEnabled`).
 */

import { FEATURE_FLAG_KEYS, FEATURE_FLAGS } from './registry'
import type { FeatureFlag, FlagOverrides } from './types'

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
