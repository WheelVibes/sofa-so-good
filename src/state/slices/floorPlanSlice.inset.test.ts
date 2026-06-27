import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { resolveFlags } from '../../features/flags/resolve'
import type { FloorPlan } from '../../floorplan/types'
import { roomPolygon } from '../../floorplan/types'
import { useStore } from '../store'

/** A plan with one 4×4 m room (origin [1,1]) inside a generous shell. */
function squareRoomPlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'inset-test',
    ceilingHeight: 2.6,
    extent: [8, 8],
    walls: [
      { id: 'w1', start: [1, 1], end: [5, 1], thickness: 'internal' },
      { id: 'w2', start: [5, 1], end: [5, 5], thickness: 'internal' },
      { id: 'w3', start: [5, 5], end: [1, 5], thickness: 'internal' },
      { id: 'w4', start: [1, 5], end: [1, 1], thickness: 'internal' },
    ],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [1, 1], width: 4, depth: 4 }],
  }
}

function area(plan: FloorPlan): number {
  const r = plan.rooms.find((x) => x.id === 'r1')!
  // shoelace |area| over the room's outline
  const pts = roomPolygon(r)
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]!
    const [x2, z2] = pts[(i + 1) % pts.length]!
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}

describe('insetRoom action', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('insets the selected room and shrinks its area in one undoable step', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(16, 6)

    const ok = useStore.getState().insetRoom('r1', 0.5)
    expect(ok).toBe(true)
    // 4×4 inset by 0.5 → 3×3 = 9 m².
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(9, 6)
    // Result is written as an explicit polygon.
    expect(useStore.getState().floorPlan.rooms[0].polygon).toBeDefined()

    // One undo reverts the whole inset.
    useStore.getState().undo()
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(16, 6)
  })

  it('grows the room on a negative distance (outset)', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    expect(useStore.getState().insetRoom('r1', -0.5)).toBe(true)
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(25, 6)
  })

  it('rejects a collapsing inset (no-op, no history, toast) and leaves the plan unchanged', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    const before = useStore.getState().floorPlan
    const ok = useStore.getState().insetRoom('r1', 2.5)
    expect(ok).toBe(false)
    // Plan untouched (same reference — no fork, no set()).
    expect(useStore.getState().floorPlan).toBe(before)
    // An error toast was raised.
    expect(useStore.getState().notifications.some((n) => n.kind === 'error')).toBe(true)
  })

  it('no-ops for a missing room id and a zero distance', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    expect(useStore.getState().insetRoom('nope', 0.5)).toBe(false)
    expect(useStore.getState().insetRoom('r1', 0)).toBe(false)
  })

  it('insetSelectedRoom acts on the selected room, else toasts', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    // No selection → info toast, no-op.
    expect(useStore.getState().insetSelectedRoom(0.5)).toBe(false)
    expect(useStore.getState().notifications.some((n) => n.kind === 'info')).toBe(true)

    useStore.getState().setPlanSelection({ type: 'room', id: 'r1' })
    expect(useStore.getState().insetSelectedRoom(0.5)).toBe(true)
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(9, 6)
  })

  it('composes: two 0.25 m insets equal one 0.5 m inset (same area)', () => {
    useStore.getState().setFloorPlan(squareRoomPlan())
    useStore.getState().insetRoom('r1', 0.25)
    useStore.getState().insetRoom('r1', 0.25)
    expect(area(useStore.getState().floorPlan)).toBeCloseTo(9, 6)
  })
})

describe('roomInset flag gating', () => {
  it('is a pro-tier flag, default on', () => {
    expect(FEATURE_FLAGS.roomInset.tier).toBe('pro')
    expect(FEATURE_FLAGS.roomInset.default).toBe(true)
    expect(FEATURE_FLAGS.roomInset.devOnly).toBeFalsy()
  })

  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').roomInset).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').roomInset).toBe(true)
  })
})
