/**
 * Carpentry sheet collection (TODO G8) — resolves the drawing set's distinct
 * PLACED parametric pieces (bookshelf/wardrobe/sideboard/desk/kitchen-run)
 * from the live items + catalog, dedupes repeats of the exact same piece to
 * ONE sheet + a "×N" count, and builds each one's elevation/section via
 * `carpentryElevation.ts`. Kept out of `drawingSet.ts` so the resolution +
 * dedupe logic is independently unit-testable without the HTML builder.
 */

import { buildCarpentryPiece, type CarpentryPiece } from '../furniture/carpentryElevation'
import { clampSpec, type ParametricSpec } from '../furniture/parametric/spec'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

export interface CarpentrySheetEntry {
  /** Display name for the sheet title — the item's own label, else the def name. */
  name: string
  /** How many placed instances share this exact def (≥1). */
  count: number
  piece: CarpentryPiece
}

/** Safely parse a def's persisted `parametricSpec` JSON, else `null`. */
function parseParametricSpec(raw: string | undefined): ParametricSpec | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return clampSpec(parsed as Partial<ParametricSpec>)
  } catch {
    return null
  }
}

/**
 * One entry per distinct placed def that carries a parametric recipe,
 * first-seen order over `items` (matches the finish-schedule /
 * material-code convention elsewhere in the drawing set). Items whose def
 * has no `parametricSpec` (a plain GLB upload, a built-in, a standalone
 * kitchen-cabinet primitive, …) are silently skipped — carpentry sheets only
 * cover pieces this app itself generated from an exact, reproducible spec.
 */
export function collectCarpentrySheets(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): CarpentrySheetEntry[] {
  const order: string[] = []
  const counts = new Map<string, number>()
  const names = new Map<string, string>()

  for (const it of items) {
    const def = catalog[it.defId]
    const spec =
      def && def.kind === 'gltf' && def.source === 'user'
        ? parseParametricSpec(def.parametricSpec)
        : null
    if (!spec) continue
    const key = def!.id
    if (!counts.has(key)) {
      order.push(key)
      names.set(key, it.label?.trim() || def!.name)
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return order.map((key) => {
    const def = catalog[key]
    const spec =
      def && def.kind === 'gltf' && def.source === 'user'
        ? parseParametricSpec(def.parametricSpec)
        : null
    return {
      name: names.get(key)!,
      count: counts.get(key)!,
      piece: buildCarpentryPiece(spec!),
    }
  })
}
