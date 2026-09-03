/**
 * Room-scoped albedo → a LUMINANCE-ONLY scale on the analytical fill lights.
 *
 * **The defect this addresses.** The app has no colour bleed at all, established across three
 * one-variable A/B rounds: repaint the ceiling vivid orange and the wall's hue moves **exactly
 * 0.0** (`v0.31.5.268`), while the same A/B inside the path tracer moves it **+17.7/+19.0** counts
 * of R−B (`.269`). With the shipped `wall-paint-terracotta`, real transport warms the ceiling
 * **+8.8 to +13.5** and darkens it **16–20 %**; the rasteriser changes it by **0.0 counts and
 * 0.2 %** (`.270`). In user terms: **paint a feature wall dark in this app and the rest of the room
 * does not notice** — which is most of what choosing a dark paint does.
 *
 * **Why LUMINANCE ONLY, and this is the load-bearing decision.** `.271` built the per-channel
 * version and recovered ~75 % of the traced response on a warm finish. `.272` then tested the
 * shipped `navy` (`#3b4a63`) — cooler and much darker, so the strongest available test — and the
 * hue term came out **wrong-signed**: model −2.9/−2.8/−2.6 against a traced target of
 * **+3.0/+5.4/+4.1**. A navy wall makes the ceiling *warmer*, because the dark wall absorbs the
 * blue sky bounce that used to cool it, leaving the warm direct sun. The model tints by what the
 * room *reflects*; real transport is governed by what the room *removes*. Those agree for
 * terracotta and oppose for navy, so `.271`'s hue match was luck. **Energy was right on both**
 * (~90 % recovered on navy), so `(z)`11 ships the scalar and drops the tint.
 *
 * **The census reads the CATALOGUE, not `material.color`** — which fixes `v0.31.5.273` at the root
 * rather than sizing it. That round found the living/dining floor is `color: #ffffff, map: true`:
 * its albedo lives entirely in a texture, so a scene-graph census counted a mid-brown oak floor as
 * pure white and inflated ρ by ~0.046. `BUILTIN_MATERIALS['floor-wood-oak'].swatch` is `#b88f5d`,
 * the actual albedo. Reading the finish id sidesteps the texture entirely.
 *
 * ## NOT WIRED. Two measured blockers, both found by measuring this module before trusting it.
 *
 * **1. The census OVER-READS albedo by ~0.225, because it lost the furniture.** Reading the
 * catalogue fixes `.273`'s texture-blindness but counts **only the six shell surfaces** -- which by
 * default are all pale (white walls, white ceiling, oak floor). This module reads the default
 * shell at **rho = 0.771**; reproducing `.271`'s *measured* 0.650 luminance scale for terracotta
 * requires **rhoRef = 0.546**. `.271` censused the scene graph, so it included furniture, glazing
 * (near-zero reflectance back into the room) and openings, all of which pull rho down. Fixing
 * texture-blindness by switching source therefore introduced a different, larger error.
 *
 * **2. Consequently the scale saturates its own clamp and cannot tell two finishes apart.** At
 * rho = 0.771 the interreflection form is in its steep region (`f(0.771) = 3.37`), so every real
 * repaint pins to `MIN_SCALE`: terracotta, navy and navy-plus-walnut-floor all return **0.45**,
 * against `.271`/`.272`'s measured targets of ~0.65 and ~0.40. A model that gives the same answer
 * for a warm mid-tone and a dark blue is not modelling anything.
 *
 * **3. And `REFERENCE_RHO` is geometry-dependent**, so "the default look is untouched" holds only
 * for the one room shape it is derived from -- a 4.6 x 6.2 room reads 0.930, not 1.0.
 *
 * **4. And the gap is now SIZED, which rules the plan-data approach out entirely.** `h4-living`
 * (`tpl-hdb-4room`'s Living / Dining) is 3.2 x 7.2 m, so its shell is
 * `23.04 + 23.04 + 54.08 = 100.16 m2`. `.271`'s room-scoped census for the same room is
 * **467 m2**. The shell is therefore **21.4 %** of the census weight and non-shell surfaces --
 * furniture, fittings, glazing -- are **78.6 %**. For the total to reach the 0.546 the measured
 * 0.650 scale implies, those surfaces must average **rho = 0.4845**, which is exactly what a room
 * of wood, fabric and mid-tones should read.
 *
 * So the arithmetic closes: the MODEL is right and the TARGET is right, and this census sees a
 * fifth of the room. It cannot be calibrated into agreement by choosing a better reference,
 * because the missing 79 % is precisely what moves when a room is furnished or repainted -- a
 * constant cannot stand in for a variable.
 *
 * **The fix is therefore a SCENE-GRAPH census** (as `.271` had) with the catalogue swatch
 * substituted for textured materials (fixing `.273` without losing the furniture). The mechanism
 * below -- `rho/(1-rho)`, room-scoped, luminance-only -- is the part `.271`/`.272` validated and
 * is worth keeping; only the rho it is fed is wrong.
 */

import type { PlanRoom } from '../../floorplan/types'
import { BUILTIN_MATERIALS, DEFAULT_FLOOR, DEFAULT_WALL } from '../../materials/builtinCatalog'

/** Ceiling when a room sets no `ceilingFinish`: plain white paint. */
const DEFAULT_CEILING = 'wall-paint-white'
/** Fallback ceiling height (m) when the room does not set one. */
const DEFAULT_CEILING_HEIGHT = 2.6

/**
 * Reference ρ — the albedo the shipped fill was tuned against, so the scale is 1.0 there.
 *
 * **Calibration-free by construction: only the RATIO between two rooms is ever applied.** This is
 * the default shell — oak floor, white walls, white ceiling — which is what every existing fill
 * measurement in this arc was taken in. Changing it re-grades every room equally and is therefore
 * a look constant, not a physical one.
 */
export const REFERENCE_RHO = defaultShellRho()

/** sRGB hex → LINEAR Rec.709 luminance. Albedo is a linear reflectance; averaging the sRGB bytes
 *  would over-weight dark finishes badly (a #808080 wall is 0.216 linear, not 0.5). */
export function swatchLuminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 0.5
  const srgb = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

function swatchFor(id: string | undefined, fallback: string): number {
  const def = BUILTIN_MATERIALS[(id ?? fallback) as keyof typeof BUILTIN_MATERIALS]
  return swatchLuminance(def?.swatch ?? '#cccccc')
}

/** Floor area (m²), honouring an explicit polygon or an L-shaped extension. */
function floorArea(room: PlanRoom): number {
  if (room.polygon && room.polygon.length >= 3) {
    let a = 0
    for (let i = 0; i < room.polygon.length; i += 1) {
      const [x1, y1] = room.polygon[i]!
      const [x2, y2] = room.polygon[(i + 1) % room.polygon.length]!
      a += x1 * y2 - x2 * y1
    }
    return Math.abs(a) / 2
  }
  const base = room.width * room.depth
  const ext = room.extension ? room.extension.width * room.extension.depth : 0
  return base + ext
}

/** Wall area (m²). Perimeter from the rectangle, since an exact polygon perimeter buys nothing
 *  here — this is an area WEIGHT, and the ratio between two arms of the same room cancels it. */
function wallArea(room: PlanRoom): number {
  const h = room.ceilingHeight ?? DEFAULT_CEILING_HEIGHT
  const ext = room.extension
  const perim = 2 * (room.width + room.depth) + (ext ? 2 * (ext.width + ext.depth) : 0)
  return perim * h
}

/**
 * Area-weighted mean albedo luminance of one room's floor, walls and ceiling.
 *
 * **Room-scoped, and that is not a detail.** `v0.31.5.271` measured a whole-flat census (2186 m²)
 * predicting a **2.6 %** darkening against a measured **16–20 %**: bounce is local, so a
 * flat-wide average barely moves when one room is repainted. The room here is ~467 m² of surface.
 */
export function roomAlbedoLuminance(room: PlanRoom): number {
  const af = floorArea(room)
  const aw = wallArea(room)
  const ac = af // flat ceiling
  const total = af + aw + ac
  if (total <= 0) return REFERENCE_RHO
  return (
    (af * swatchFor(room.floor, DEFAULT_FLOOR) +
      aw * swatchFor(room.wall, DEFAULT_WALL) +
      ac * swatchFor(room.ceilingFinish, DEFAULT_CEILING)) /
    total
  )
}

function defaultShellRho(): number {
  return roomAlbedoLuminance({
    id: 'ref',
    name: 'ref',
    origin: [0, 0],
    width: 4,
    depth: 5,
  } as PlanRoom)
}

/** Hard bounds on the fill scale. A room can be repainted to extremes the interreflection form
 *  amplifies (ρ/(1−ρ) diverges as ρ→1), and a fill that collapses to zero or doubles is a worse
 *  error than no bleed at all. */
const MIN_SCALE = 0.45
const MAX_SCALE = 1.35

/**
 * Scalar fill multiplier for a room's albedo, in the interreflection form `ρ/(1−ρ)`.
 *
 * Single-bounce (`ρ`) recovered only ~20 % of the traced response and the midpoint ~45 %;
 * `ρ/(1−ρ)` recovered ~75–90 % (`.271`, `.272`). Normalised by the reference room so no absolute
 * calibration is implied, and clamped.
 */
export function albedoFillScale(rho: number, rhoRef: number = REFERENCE_RHO): number {
  const f = (r: number) => {
    const c = Math.min(Math.max(r, 0.01), 0.95)
    return c / (1 - c)
  }
  const raw = f(rho) / f(rhoRef)
  return Math.min(Math.max(raw, MIN_SCALE), MAX_SCALE)
}
