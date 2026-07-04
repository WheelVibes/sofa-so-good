// Pure glue for "palette from photo" (TEST-8): builds the floor+wall finish
// candidate set and maps extracted palette colours to their nearest catalog
// finish. Split out of `paletteFromPhoto.ts` so it can be unit-tested without
// pulling in that file's DOM-bound canvas decode / store wiring.

import { nearestColor, type PaletteColor, type Rgb } from '../analysis/imagePalette'
import { BUILTIN_MATERIALS_BY_CATEGORY } from '../materials/builtinCatalog'
import { hexToRgb } from '../materials/procedural/noise'

/** Candidate finishes (floor + wall) with a resolved RGB swatch, for nearest-match. */
export function finishCandidates(): Array<Rgb & { name: string; swatch: string }> {
  const out: Array<Rgb & { name: string; swatch: string }> = []
  for (const cat of ['floor', 'wall'] as const) {
    for (const m of BUILTIN_MATERIALS_BY_CATEGORY[cat] ?? []) {
      if (!m.swatch) continue
      const [r, g, b] = hexToRgb(m.swatch)
      out.push({ r, g, b, name: m.name, swatch: m.swatch })
    }
  }
  return out
}

/**
 * Map each extracted palette colour to its nearest catalog finish (pure —
 * no DOM). Falls back to the palette colour's own hex, both as the label and
 * the swatch, when there are no candidates to match against.
 */
export function mapPaletteToFinishes(
  palette: readonly PaletteColor[],
  candidates: ReadonlyArray<Rgb & { name: string; swatch: string }> = finishCandidates(),
): Array<{ name: string; swatch: string }> {
  return palette.map((p) => {
    const near = candidates.length ? nearestColor(p, candidates) : undefined
    return { name: near ? `${near.name} (≈ ${p.hex})` : p.hex, swatch: near?.swatch ?? p.hex }
  })
}
