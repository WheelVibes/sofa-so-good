/**
 * GLB Asset Designer — Stage 2 finish preset gallery. A pure, dependency-light
 * table of named finishes, each a curated bundle of PBR + `PhysicalSurfaceFields`
 * values (colour-agnostic — a preset sets the *physics*, keeping the part's own
 * colour). One tap applies a preset; the inspector highlights the preset whose
 * fields currently match the part (`matchingFinishPresetId`).
 *
 * The physical layer values reuse the pure `materials/materialRealism.ts`
 * decision helpers (`sheenLayer`/`clearcoatLayer`) where a preset maps onto an
 * existing finish kind, so the designer's velvet/lacquer/ceramic reads exactly
 * like the placed-furniture equivalent. Base roughness/metalness mirror the
 * `furnitureMaterials.ts` defaults for the same kinds (inlined as literals — that
 * module pulls three/canvas and can't be imported into this CPU-pure table).
 *
 * Applying a preset (`applyFinishPreset`) FIRST clears every material field the
 * presets can set (so switching Velvet→Clear glass leaves no stale sheen), then
 * writes the preset's fields and clears any textured `finish` (physical fields
 * are ignored while a finish is set — the preset must render). The part's
 * `color`, transform and geometry are untouched.
 */

import { clearcoatLayer, sheenLayer } from '../../materials/materialRealism'
import type { PhysicalSurfaceFields, ShapePart } from './editSpec'

/** The material fields a preset can drive. A subset of `ShapePart`'s surface
 *  look — never geometry/transform/colour. */
export type FinishPresetPatch = PhysicalSurfaceFields & {
  roughness?: number
  metalness?: number
  opacity?: number
}

export interface FinishPreset {
  id: string
  label: string
  /** Curated finish bundle. Colour-agnostic (never sets `color`). */
  patch: FinishPresetPatch
}

const velvet = sheenLayer('velvet') // { sheen: 1, sheenRoughness: 0.3, … }
const leather = sheenLayer('leather') // { sheen: 0.35, sheenRoughness: 0.5, … }
const satin = sheenLayer('fabric') // { sheen: 0.4, sheenRoughness: 0.6, … }
const lacquer = clearcoatLayer('gloss') // { clearcoat: 0.8, clearcoatRoughness: 0.12 }
const ceramicCoat = clearcoatLayer('ceramic') // { clearcoat: 1, clearcoatRoughness: 0.06 }

/** The gallery, in display order. ~14 finishes spanning fabric, wood, paint,
 *  metal, glass and ceramic. */
export const FINISH_PRESETS: FinishPreset[] = [
  {
    id: 'velvet',
    label: 'Velvet',
    patch: {
      roughness: 0.62,
      metalness: 0.02,
      sheen: velvet?.sheen,
      sheenRoughness: velvet?.sheenRoughness,
    },
  },
  {
    id: 'satin',
    label: 'Satin',
    patch: {
      roughness: 0.5,
      metalness: 0,
      sheen: satin?.sheen,
      sheenRoughness: satin?.sheenRoughness,
    },
  },
  {
    id: 'leather',
    label: 'Leather',
    patch: {
      roughness: 0.42,
      metalness: 0.06,
      sheen: leather?.sheen,
      sheenRoughness: leather?.sheenRoughness,
    },
  },
  {
    id: 'lacquered-wood',
    label: 'Lacquered wood',
    patch: {
      roughness: 0.35,
      metalness: 0,
      clearcoat: lacquer?.clearcoat,
      clearcoatRoughness: lacquer?.clearcoatRoughness,
    },
  },
  {
    id: 'oiled-wood',
    label: 'Oiled wood',
    patch: { roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  },
  {
    id: 'matte-paint',
    label: 'Matte paint',
    patch: { roughness: 0.72, metalness: 0 },
  },
  {
    id: 'powder-coat',
    label: 'Powder-coat',
    patch: { roughness: 0.5, metalness: 0.1, clearcoat: 0.2, clearcoatRoughness: 0.3 },
  },
  {
    id: 'brushed-steel',
    label: 'Brushed steel',
    patch: { roughness: 0.35, metalness: 0.9, anisotropy: 0.7, anisotropyRotation: 0 },
  },
  {
    id: 'polished-chrome',
    label: 'Polished chrome',
    patch: { roughness: 0.05, metalness: 1 },
  },
  {
    id: 'brass',
    label: 'Brass',
    patch: { roughness: 0.3, metalness: 1 },
  },
  {
    id: 'clear-glass',
    label: 'Clear glass',
    patch: {
      roughness: 0.05,
      metalness: 0,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.3,
      opacity: 1,
    },
  },
  {
    id: 'frosted-glass',
    label: 'Frosted glass',
    patch: {
      roughness: 0.4,
      metalness: 0,
      transmission: 0.8,
      ior: 1.5,
      thickness: 0.3,
      opacity: 1,
    },
  },
  {
    id: 'ceramic',
    label: 'Ceramic',
    patch: {
      roughness: 0.25,
      metalness: 0,
      clearcoat: ceramicCoat?.clearcoat,
      clearcoatRoughness: ceramicCoat?.clearcoatRoughness,
    },
  },
  {
    id: 'rubber',
    label: 'Rubber',
    patch: { roughness: 0.95, metalness: 0 },
  },
]

const FINISH_PRESET_BY_ID = new Map(FINISH_PRESETS.map((p) => [p.id, p]))

/** Every material field a preset can touch — reset to `undefined` before a
 *  preset's own fields are applied, so switching presets never leaves a stale
 *  layer behind. Keep in sync with `FinishPresetPatch`. */
const RESET_PATCH: FinishPresetPatch = {
  roughness: undefined,
  metalness: undefined,
  opacity: undefined,
  sheen: undefined,
  sheenColor: undefined,
  sheenRoughness: undefined,
  clearcoat: undefined,
  clearcoatRoughness: undefined,
  transmission: undefined,
  ior: undefined,
  thickness: undefined,
  anisotropy: undefined,
  anisotropyRotation: undefined,
}

/** The full set of settable material keys, for match comparison. */
const PRESET_KEYS = Object.keys(RESET_PATCH) as (keyof FinishPresetPatch)[]

/**
 * The `updatePart` patch that applies a finish preset to a part: clears every
 * settable material field, writes the preset's bundle, and clears the textured
 * `finish` (so the physical fields actually render). Returns an empty object for
 * an unknown id. Pure — the caller commits it via `updatePart`.
 */
export function applyFinishPreset(presetId: string): Partial<ShapePart> {
  const preset = FINISH_PRESET_BY_ID.get(presetId)
  if (!preset) return {}
  return { ...RESET_PATCH, ...preset.patch, finish: undefined }
}

const EPS = 1e-6

/** True when the part's current value for `key` equals the preset's (treating
 *  absent as undefined, comparing numbers within an epsilon, strings exactly). */
function fieldMatches(
  part: ShapePart,
  key: keyof FinishPresetPatch,
  want: number | string | undefined,
): boolean {
  const have = part[key] as number | string | undefined
  if (want === undefined) return have === undefined
  if (have === undefined) return false
  if (typeof want === 'number' && typeof have === 'number') return Math.abs(have - want) < EPS
  return have === want
}

/**
 * The id of the preset whose fields exactly match the part's current material
 * fields, or `null` when none does (a Custom/hand-tuned look, or a textured
 * finish). A part with a `finish` set never matches a preset (presets clear the
 * finish). Used to highlight the active swatch.
 */
export function matchingFinishPresetId(part: ShapePart): string | null {
  if (part.finish) return null
  for (const preset of FINISH_PRESETS) {
    const full: FinishPresetPatch = { ...RESET_PATCH, ...preset.patch }
    let ok = true
    for (const key of PRESET_KEYS) {
      if (!fieldMatches(part, key, full[key])) {
        ok = false
        break
      }
    }
    if (ok) return preset.id
  }
  return null
}
