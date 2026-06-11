import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { HistorySnapshot } from '../state/slices/historySlice'

export interface TimelineEntry {
  /** Flat-timeline index (oldest = 0). Pass to `jumpHistory`. */
  index: number
  /** Human label for the step that produced this state. */
  label: string
  /** Whether this entry is the live/current state. */
  isCurrent: boolean
}

function countByDef(items: FurnitureItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) m.set(it.defId, (m.get(it.defId) ?? 0) + 1)
  return m
}

/**
 * Human label for the transition `prev → next`, derived purely from the two
 * snapshots — so we don't have to thread a label through every `pushHistory`
 * caller. Checks furniture add/remove first, then in-place furniture edits,
 * then finishes / doors / floor-plan, falling back to a generic "Edited".
 */
export function describeHistoryStep(
  prev: HistorySnapshot,
  next: HistorySnapshot,
  catalog: Record<string, FurnitureDef> = {},
): string {
  // Furniture added / removed (multiset diff by defId).
  const before = countByDef(prev.items)
  const after = countByDef(next.items)
  const defIds = new Set<string>([...before.keys(), ...after.keys()])
  let gained = 0
  let lost = 0
  let gainedName = ''
  let lostName = ''
  for (const id of defIds) {
    const delta = (after.get(id) ?? 0) - (before.get(id) ?? 0)
    if (delta > 0) {
      gained += delta
      gainedName = catalog[id]?.name ?? id
    } else if (delta < 0) {
      lost += -delta
      lostName = catalog[id]?.name ?? id
    }
  }
  if (gained && !lost) return gained === 1 ? `Added ${gainedName}` : `Added ${gained} items`
  if (lost && !gained) return lost === 1 ? `Removed ${lostName}` : `Removed ${lost} items`
  if (gained && lost) return 'Swapped furniture'

  // Same furniture set — figure out what else changed.
  if (JSON.stringify(prev.items) !== JSON.stringify(next.items)) {
    return next.items.length === 1 ? 'Moved furniture' : 'Moved or edited furniture'
  }
  if (JSON.stringify(prev.finishes) !== JSON.stringify(next.finishes)) return 'Changed finishes'
  if (JSON.stringify(prev.doors) !== JSON.stringify(next.doors)) return 'Toggled a door'
  if (JSON.stringify(prev.floorPlan) !== JSON.stringify(next.floorPlan)) return 'Edited floor plan'
  // Pinned comments (F24). `?? []` tolerates snapshots from before the field.
  const prevComments = prev.comments ?? []
  const nextComments = next.comments ?? []
  if (nextComments.length > prevComments.length) return 'Added a comment'
  if (nextComments.length < prevComments.length) return 'Deleted a comment'
  if (JSON.stringify(prevComments) !== JSON.stringify(nextComments)) return 'Updated a comment'
  return 'Edited'
}

/**
 * Build the flat undo/redo timeline (oldest → newest) with the live state
 * marked and a derived label per step. `future` is the slice's redo stack
 * (nearest-future state stored last), so the chronological-forward order is
 * `future` reversed.
 */
export function buildHistoryTimeline(
  past: HistorySnapshot[],
  current: HistorySnapshot,
  future: HistorySnapshot[],
  catalog: Record<string, FurnitureDef> = {},
): { entries: TimelineEntry[]; currentIndex: number } {
  const flat = [...past, current, ...[...future].reverse()]
  const currentIndex = past.length
  const entries = flat.map((snap, i) => ({
    index: i,
    label: i === 0 ? 'Initial layout' : describeHistoryStep(flat[i - 1], snap, catalog),
    isCurrent: i === currentIndex,
  }))
  return { entries, currentIndex }
}
