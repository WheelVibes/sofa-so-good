/**
 * Bundled, self-authored IES profiles (public-domain — written by hand for this
 * app, not scraped). Stored as LM-63 ASCII string literals so the feature works
 * out of the box with no network fetch. Users can also upload their own `.ies`.
 *
 * Each profile is a symmetric type-C downlight (one horizontal plane, 0°): the
 * candela peaks at nadir (0°) and falls toward the horizon. The two samples
 * differ in beam tightness so the picker offers a visibly distinct choice.
 */

import { type IesProfile, parseIes } from './parseIes'

export interface BundledIesProfile {
  id: string
  label: string
  /** LM-63 ASCII source. */
  source: string
}

/** A narrow accent downlight (~24° field): bright hotspot, fast falloff. */
const NARROW_DOWNLIGHT = `IESNA:LM-63-2002
[TEST] Self-authored sample
[MANUFAC] Sofa So Good
[LUMCAT] SSG-DL-NARROW
[LUMINAIRE] Narrow accent downlight
[DESCRIPTION] Symmetric type-C narrow-beam downlight (self-authored, public domain)
TILT=NONE
1 1200 1 19 1 1 2 0.1 0.1 0.0 1.0 1.0 12
0 5 10 15 20 25 30 35 40 45 50 55 60 65 70 75 80 85 90
0
1000 960 850 670 460 270 130 55 20 8 3 1 0 0 0 0 0 0 0`

/** A wide general downlight (~70° field): soft, even room wash. */
const WIDE_DOWNLIGHT = `IESNA:LM-63-2002
[TEST] Self-authored sample
[MANUFAC] Sofa So Good
[LUMCAT] SSG-DL-WIDE
[LUMINAIRE] Wide general downlight
[DESCRIPTION] Symmetric type-C wide-beam downlight (self-authored, public domain)
TILT=NONE
1 1600 1 19 1 1 2 0.15 0.15 0.0 1.0 1.0 15
0 5 10 15 20 25 30 35 40 45 50 55 60 65 70 75 80 85 90
0
800 798 792 780 762 738 705 662 610 548 478 400 318 235 158 92 42 12 2`

export const BUNDLED_IES_PROFILES: BundledIesProfile[] = [
  { id: 'narrow-downlight', label: 'Narrow accent downlight', source: NARROW_DOWNLIGHT },
  { id: 'wide-downlight', label: 'Wide general downlight', source: WIDE_DOWNLIGHT },
]

/** Lookup a bundled profile by id. */
export function bundledIesById(id: string): BundledIesProfile | undefined {
  return BUNDLED_IES_PROFILES.find((p) => p.id === id)
}

// Lazy parse cache so a profile string is parsed at most once per session.
const cache = new Map<string, IesProfile>()

/** Parse + cache a bundled profile by id. Returns `null` for an unknown id. */
export function bundledIesProfile(id: string): IesProfile | null {
  const cached = cache.get(id)
  if (cached) return cached
  const def = bundledIesById(id)
  if (!def) return null
  const parsed = parseIes(def.source)
  cache.set(id, parsed)
  return parsed
}
