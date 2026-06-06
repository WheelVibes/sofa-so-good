import type { FurnitureDef, FurnitureItem } from '../furniture/types'

export interface VersionDiffLine {
  defId: string
  name: string
  count: number
}

/** A multiset diff between a saved version and the current design, by defId.
 *  `gained` = item types the version has MORE of than current (you'd add them
 *  by restoring it); `lost` = types it has FEWER of (you'd lose them). */
export interface VersionDiff {
  gained: VersionDiffLine[]
  lost: VersionDiffLine[]
  /** Net item-count change (version − current). */
  countDelta: number
}

function countByDef(items: FurnitureItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) m.set(it.defId, (m.get(it.defId) ?? 0) + 1)
  return m
}

/**
 * Compare a saved version's items against the current design. Pure: groups both
 * by defId and reports the per-type surplus/deficit, resolving friendly names
 * from the catalog (falls back to the defId). Sorted by magnitude desc.
 */
export function diffVersionItems(
  current: FurnitureItem[],
  version: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): VersionDiff {
  const cur = countByDef(current)
  const ver = countByDef(version)
  const defIds = new Set<string>([...cur.keys(), ...ver.keys()])
  const gained: VersionDiffLine[] = []
  const lost: VersionDiffLine[] = []
  for (const defId of defIds) {
    const delta = (ver.get(defId) ?? 0) - (cur.get(defId) ?? 0)
    if (delta === 0) continue
    const name = catalog[defId]?.name ?? defId
    if (delta > 0) gained.push({ defId, name, count: delta })
    else lost.push({ defId, name, count: -delta })
  }
  gained.sort((a, b) => b.count - a.count)
  lost.sort((a, b) => b.count - a.count)
  return { gained, lost, countDelta: version.length - current.length }
}
