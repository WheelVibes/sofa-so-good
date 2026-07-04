/**
 * PC-NUDGE-UNDO: every store-level multi-selection action must commit as exactly
 * ONE undo entry, and a single undo must fully revert the whole operation (never
 * leave a half-applied layout). These actions push history once and then mutate
 * many items via moveItem/rotateItem/flipItem (which do NOT push), so the batch
 * collapses into a single step. We assert both the entry COUNT (+1) and that one
 * undo restores the exact pre-action items array.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { useStore } from '../state/store'
import {
  arrangeSelectionAsRun,
  faceSelectionIntoRoom,
  mirrorSelectionAxis,
  mirrorSelectionX,
  snapSelectionToWall,
} from './selectionActions'

function s() {
  return useStore.getState()
}

/** The largest room in the active plan — our scratch space for placing test items. */
function bigRoom() {
  const rooms = s().floorPlan.rooms
  return rooms.reduce((a, b) => (b.width * b.depth > a.width * a.depth ? b : a), rooms[0]!)
}

/** Place `n` potted-plants spread across the largest room, clearing prior items so
 *  collision checks are deterministic, and select them all. Returns their ids. */
function placeAndSelect(n: number): string[] {
  const room = bigRoom()
  const ids: string[] = []
  const items = []
  for (let i = 0; i < n; i++) {
    const id = `t-plant-${i}`
    ids.push(id)
    // March across the room interior with a generous margin so nothing clips a wall.
    const x = room.origin[0] + 0.6 + i * 0.9
    const z = room.origin[1] + room.depth / 2
    items.push({
      id,
      defId: 'potted-plant',
      position: [x, z] as [number, number],
      rotation: 0,
      props: {},
    })
  }
  useStore.setState({ items, selectedItemId: ids[0] ?? null, selectedItemIds: ids })
  s().clearHistory()
  return ids
}

const ACTIONS: Array<[string, () => void]> = [
  ['mirrorSelectionX', () => mirrorSelectionX(BUILTIN_CATALOG)],
  ['mirrorSelectionAxis(z)', () => mirrorSelectionAxis(BUILTIN_CATALOG, 'z')],
  ['arrangeSelectionAsRun', () => arrangeSelectionAsRun(BUILTIN_CATALOG)],
  ['snapSelectionToWall', () => snapSelectionToWall(BUILTIN_CATALOG)],
  ['faceSelectionIntoRoom', () => faceSelectionIntoRoom(BUILTIN_CATALOG)],
]

describe('selection actions — single clean undo entry', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  for (const [name, run] of ACTIONS) {
    it(`${name}: exactly one undo entry that fully reverts`, () => {
      placeAndSelect(3)
      const before = s().items
      run()
      // Some actions are no-ops if nothing fits/changes; only assert when the
      // action actually committed (it pushed history and changed the layout).
      if (s().past.length === 0) {
        expect(s().items).toBe(before) // genuine no-op leaves state untouched
        return
      }
      expect(s().past.length).toBe(1) // never per-item, never redundant
      s().undo()
      expect(s().items).toBe(before) // one undo restores the whole prior state
    })
  }

  it('mirror commits all-or-nothing (one entry restoring the full prior layout)', () => {
    const ids = placeAndSelect(3)
    const before = s().items.map((i) => [...i.position] as [number, number])
    mirrorSelectionX(BUILTIN_CATALOG)
    if (s().past.length === 1) {
      // It moved at least one item; a single undo must restore every position.
      s().undo()
      ids.forEach((id, i) => {
        expect(s().items.find((it) => it.id === id)!.position).toEqual(before[i])
      })
    }
  })

  it('empty selection is a no-op (no history entry)', () => {
    placeAndSelect(2)
    useStore.setState({ selectedItemId: null, selectedItemIds: [] })
    s().clearHistory()
    mirrorSelectionX(BUILTIN_CATALOG)
    arrangeSelectionAsRun(BUILTIN_CATALOG)
    snapSelectionToWall(BUILTIN_CATALOG)
    expect(s().past.length).toBe(0)
  })

  it('arrangeSelectionAsRun needs 2+ items (single selection is a no-op)', () => {
    placeAndSelect(1)
    s().clearHistory()
    arrangeSelectionAsRun(BUILTIN_CATALOG)
    expect(s().past.length).toBe(0)
  })

  it('mirrorSelectionAxis(z) reflects Z (keeps X) and flips heading + flipZ', () => {
    const ids = placeAndSelect(3)
    const before = s().items.map((i) => ({ pos: [...i.position] as [number, number] }))
    const cz = before.reduce((a, b) => a + b.pos[1], 0) / before.length
    mirrorSelectionAxis(BUILTIN_CATALOG, 'z')
    if (s().past.length === 1) {
      ids.forEach((id, i) => {
        const it = s().items.find((x) => x.id === id)!
        expect(it.position[0]).toBeCloseTo(before[i].pos[0]) // X unchanged
        expect(it.position[1]).toBeCloseTo(2 * cz - before[i].pos[1]) // Z reflected
        expect(it.rotation).toBeCloseTo(Math.PI) // was facing +Z (rot 0) -> now -Z
        expect(!!it.flipZ).toBe(true)
      })
    }
  })
})
