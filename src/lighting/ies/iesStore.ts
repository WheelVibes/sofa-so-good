/**
 * Session-level IES profile resolver + cache. An item references a profile by id
 * via `props.iesProfile`:
 *  - a bundled id (e.g. `narrow-downlight`) → parsed from {@link sampleProfiles}.
 *  - `custom:<key>` → a user-uploaded `.ies`, registered here at upload time.
 *
 * Parsing is cached so a profile is parsed at most once. This is a plain module
 * singleton (not the Zustand store) — uploaded profiles live for the session and
 * are keyed by the prop value persisted on the item.
 */

import { type IesProfile, parseIes } from './parseIes'
import { bundledIesProfile } from './sampleProfiles'
import { mapIesToSpot, type SpotParams } from './spotMapping'

const CUSTOM_PREFIX = 'custom:'

/** Raw LM-63 source for uploaded profiles, keyed by their `custom:<key>` id. */
const uploadedSource = new Map<string, string>()
/** Parsed-profile cache (bundled + uploaded), keyed by profile id. */
const parsedCache = new Map<string, IesProfile | null>()
/** Mapped SpotParams cache, keyed by `${id}|${baseIntensity}`. */
const spotCache = new Map<string, SpotParams | null>()

/** Register an uploaded LM-63 source under a `custom:<key>` id. Validates by
 *  parsing; throws (via {@link parseIes}) on malformed input. Returns the id. */
export function registerUploadedIes(key: string, source: string): string {
  // Validate eagerly so a bad upload fails at pick time, not at render time.
  parseIes(source)
  const id = CUSTOM_PREFIX + key
  uploadedSource.set(id, source)
  parsedCache.delete(id)
  // Drop any stale spot mappings for this id.
  for (const k of [...spotCache.keys()]) if (k.startsWith(`${id}|`)) spotCache.delete(k)
  return id
}

/** Resolve a profile id to a parsed {@link IesProfile}, or `null` if unknown /
 *  unparseable. Never throws (a bad uploaded source resolves to `null` →
 *  caller falls back to the default cone). */
export function resolveIesProfile(id: string): IesProfile | null {
  if (parsedCache.has(id)) return parsedCache.get(id) ?? null
  let profile: IesProfile | null = null
  try {
    if (id.startsWith(CUSTOM_PREFIX)) {
      const src = uploadedSource.get(id)
      profile = src ? parseIes(src) : null
    } else {
      profile = bundledIesProfile(id)
    }
  } catch {
    profile = null
  }
  parsedCache.set(id, profile)
  return profile
}

/** Resolve a profile id to cached {@link SpotParams}, or `null` if the profile
 *  can't be resolved (caller falls back to a plain point light / default cone). */
export function resolveIesSpot(id: string, baseIntensity: number): SpotParams | null {
  const cacheKey = `${id}|${baseIntensity}`
  if (spotCache.has(cacheKey)) return spotCache.get(cacheKey) ?? null
  const profile = resolveIesProfile(id)
  const spot = profile ? mapIesToSpot(profile, { baseIntensity }) : null
  spotCache.set(cacheKey, spot)
  return spot
}
