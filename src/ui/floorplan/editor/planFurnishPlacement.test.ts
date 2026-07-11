import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanWall } from '../../../floorplan/types'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { windowFixtureProps } from '../../../furniture/placement/windowSnap'
import {
  buildPlanGhostItem,
  buildPlanWindowGhostItem,
  decidePlanCommit,
  decidePlanTouchLift,
  PLAN_GHOST_ID,
  planGhostValid,
  planHasWindow,
  screenToGridPoint,
} from './planFurnishPlacement'

const sofa = BUILTIN_CATALOG['sofa-3seat']
// Window-bound fixtures (WINDOW-FIXTURE) — plan-placeable since Phase 3 by
// snapping to the edited level's nearest window.
const curtains = BUILTIN_CATALOG.curtains
const blind = BUILTIN_CATALOG['roller-blind']

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'external',
})

const win = (id: string, wallId: string, offset: number, width = 1.2): PlanOpening => ({
  id,
  kind: 'window',
  wallId,
  offset,
  width,
  sill: 0.9,
  head: 2.1,
})

describe('buildPlanGhostItem', () => {
  it('builds a synthetic ghost item at the given world point', () => {
    const item = buildPlanGhostItem(sofa, [1.5, 2.5], 0)
    expect(item.id).toBe(PLAN_GHOST_ID)
    expect(item.defId).toBe(sofa.id)
    expect(item.position).toEqual([1.5, 2.5])
    expect(item.levelId).toBeUndefined()
  })

  it('sums the def default rotation with the dialed-in ghost rotation', () => {
    const item = buildPlanGhostItem(sofa, [0, 0], Math.PI / 2)
    expect(item.rotation).toBeCloseTo((sofa.defaultRotation ?? 0) + Math.PI / 2, 6)
  })

  it('carries an explicit levelId (multi-level plans)', () => {
    const item = buildPlanGhostItem(sofa, [0, 0], 0, 'level-2')
    expect(item.levelId).toBe('level-2')
  })

  it('seeds default props via the shared defaultItemProps (parametric param defaults here)', () => {
    const item = buildPlanGhostItem(sofa, [0, 0], 0)
    expect(sofa.kind).toBe('parametric')
    // A parametric def's ghost seeds its full param-schema defaults (width/depth/…),
    // not an empty props object — same as the 3D ghost/controller.
    expect(item.props.width).toBe(sofa.defaultFootprint.w)
    expect(item.props.depth).toBe(sofa.defaultFootprint.d)
  })
})

// PLAN-FURNISH Phase 3 — window-bound fixtures (curtains/blinds) snap to the
// edited level's nearest window, reusing the exact 3D pure pair
// (`furniture/placement/windowSnap.ts`).
describe('planHasWindow', () => {
  it('is false with no openings at all', () => {
    expect(planHasWindow([wall('w1', [0, 0], [4, 0])], [])).toBe(false)
  })

  it('is false when the only openings are doors', () => {
    const doors: PlanOpening[] = [
      { id: 'd1', kind: 'door', wallId: 'w1', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    ]
    expect(planHasWindow([wall('w1', [0, 0], [4, 0])], doors)).toBe(false)
  })

  it("is false when a window's host wall doesn't resolve (stale wallId)", () => {
    expect(planHasWindow([wall('w1', [0, 0], [4, 0])], [win('win1', 'missing', 1)])).toBe(false)
  })

  it('is true when at least one window resolves to a wall', () => {
    expect(planHasWindow([wall('w1', [0, 0], [4, 0])], [win('win1', 'w1', 1)])).toBe(true)
  })
})

describe('buildPlanWindowGhostItem', () => {
  const walls = [wall('w1', [0, 0], [4, 0])]
  const openings = [win('win1', 'w1', 1, 1.2)]
  const ceilingHeight = 2.6
  const ctx = { walls, openings, ceilingHeight }

  it('returns null when the level has no window (caller toasts + disarms)', () => {
    expect(buildPlanWindowGhostItem(curtains, [2, 1], { ...ctx, openings: [] })).toBeNull()
  })

  it('snaps the ghost onto the window centre on the wall line', () => {
    const item = buildPlanWindowGhostItem(curtains, [2.4, 1.3], ctx)
    expect(item).not.toBeNull()
    expect(item?.id).toBe(PLAN_GHOST_ID)
    expect(item?.defId).toBe(curtains.id)
    // Window centre = offset + width/2 = 1.6 along +X, on the wall line (z=0) —
    // NOT the raw drop point.
    expect(item?.position[0]).toBeCloseTo(1.6, 6)
    expect(item?.position[1]).toBeCloseTo(0, 6)
  })

  it('faces the room side the drop point is on (same convention as the 3D commit)', () => {
    const below = buildPlanWindowGhostItem(curtains, [1.6, 1], ctx)
    const above = buildPlanWindowGhostItem(curtains, [1.6, -1], ctx)
    expect(below).not.toBeNull()
    expect(above).not.toBeNull()
    // Opposite sides of the wall differ by π (the fixture hangs on the side
    // the user aimed at).
    const diff = Math.abs((below?.rotation ?? 0) - (above?.rotation ?? 0))
    expect(diff % (2 * Math.PI)).toBeCloseTo(Math.PI, 6)
  })

  it('snaps to the NEAREST of several windows', () => {
    const two = { ...ctx, openings: [win('win1', 'w1', 0.2, 0.8), win('win2', 'w1', 3, 0.8)] }
    const nearFirst = buildPlanWindowGhostItem(curtains, [0.5, 1], two)
    const nearSecond = buildPlanWindowGhostItem(curtains, [3.6, 1], two)
    expect(nearFirst?.position[0]).toBeCloseTo(0.6, 6)
    expect(nearSecond?.position[0]).toBeCloseTo(3.4, 6)
  })

  it('sizes the fixture to the snapped window via windowFixtureProps (curtains)', () => {
    const item = buildPlanWindowGhostItem(curtains, [1.6, 1], ctx)
    const sized = windowFixtureProps(curtains.id, { width: 1.2, sill: 0.9, head: 2.1 }, 2.6)
    for (const [k, v] of Object.entries(sized)) expect(item?.props[k]).toBe(v)
  })

  it('sizes a roller blind to its window (covering drop)', () => {
    const item = buildPlanWindowGhostItem(blind, [1.6, 1], ctx)
    const sized = windowFixtureProps(blind.id, { width: 1.2, sill: 0.9, head: 2.1 }, 2.6)
    expect(Object.keys(sized).length).toBeGreaterThan(0)
    for (const [k, v] of Object.entries(sized)) expect(item?.props[k]).toBe(v)
  })

  it('carries an explicit levelId (multi-level plans)', () => {
    const item = buildPlanWindowGhostItem(curtains, [1.6, 1], ctx, 'level-2')
    expect(item?.levelId).toBe('level-2')
    const ground = buildPlanWindowGhostItem(curtains, [1.6, 1], ctx)
    expect(ground?.levelId).toBeUndefined()
  })
})

describe('planGhostValid', () => {
  const emptyCtx = { others: [], defs: BUILTIN_CATALOG, doors: {}, walls: [] }

  it('is valid in open floor with no obstacles', () => {
    const item = buildPlanGhostItem(sofa, [5, 5], 0)
    expect(planGhostValid(item, sofa, emptyCtx)).toBe(true)
  })

  it('is invalid when the ghost overlaps a wall body', () => {
    const item = buildPlanGhostItem(sofa, [0, 0], 0)
    const ctx = { ...emptyCtx, walls: [{ ax: -5, az: 0, bx: 5, bz: 0, thickness: 0.2 }] }
    expect(planGhostValid(item, sofa, ctx)).toBe(false)
  })

  it('is invalid when the ghost overlaps another placed item', () => {
    const other = buildPlanGhostItem(sofa, [0, 0], 0)
    other.id = 'placed-1'
    const item = buildPlanGhostItem(sofa, [0.05, 0.05], 0)
    expect(planGhostValid(item, sofa, { ...emptyCtx, others: [other] })).toBe(false)
  })

  it('is always false for a window-bound def (its validity is snap existence, not canPlace)', () => {
    const item = buildPlanGhostItem(curtains, [5, 5], 0)
    expect(planGhostValid(item, curtains, emptyCtx)).toBe(false)
  })
})

describe('decidePlanCommit', () => {
  it('commits when placeable and valid (green ghost)', () => {
    expect(decidePlanCommit(sofa, true)).toBe('commit')
  })

  it('is invalid when placeable but colliding (red ghost)', () => {
    expect(decidePlanCommit(sofa, false)).toBe('invalid')
  })

  it('commits a window-bound def that snapped to a window (Phase 3: valid = snap existence)', () => {
    expect(decidePlanCommit(curtains, true)).toBe('commit')
  })

  it('is ineligible (not merely invalid) for a window-bound def with no window — no spot can ever commit it', () => {
    expect(decidePlanCommit(curtains, false)).toBe('ineligible')
  })
})

// PLAN-FURNISH Phase 2 — mobile touch input helpers. `CatalogCard`'s
// long-press-from-card gesture captures its touchmove/touchend to the card
// (native touch capture), so `FloorPlanEditor` drives the ghost/commit for
// that drag from raw window-level pointer events instead of its own SVG
// pointer handlers — these pure helpers are what decide the world point and
// the commit/cancel outcome from those raw coordinates.
describe('screenToGridPoint', () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 }
  const geom = { W: 800, H: 600, PX: 40, gridSize: 0, gridMargin: 1 }

  it('maps a screen point to plan-space metres (no grid snap when gridSize is 0)', () => {
    // Screen (300, 200) is at 50%/50% of the rect → SVG-internal (400, 300) →
    // metres (400/40 - 1, 300/40 - 1) = (9, 6.5).
    expect(screenToGridPoint(300, 200, rect, geom)).toEqual([9, 6.5])
  })

  it('snaps to the grid when gridSize > 0', () => {
    const snapped = screenToGridPoint(300, 200, rect, { ...geom, gridSize: 0.5 })
    expect(snapped).toEqual([9, 6.5])
    // A small nudge (unsnapped x would be 9.3 m) rounds to the nearest 0.5 m step.
    const midGrid = screenToGridPoint(306, 200, rect, { ...geom, gridSize: 0.5 })
    expect(midGrid[0]).toBeCloseTo(9.5, 5)
  })

  it('accounts for a scaled rect (SVG rendered smaller than its internal viewBox)', () => {
    // Half-scale rect (200×150 screen px for an 800×600 internal viewBox) —
    // the bottom-right corner still maps to the full internal (W, H) extent.
    const scaledRect = { left: 0, top: 0, width: 200, height: 150 }
    const [x] = screenToGridPoint(200, 150, scaledRect, geom)
    expect(x).toBeCloseTo(800 / 40 - 1, 5)
  })
})

describe('decidePlanTouchLift', () => {
  it('cancels ("off-plan") when the lift point is off the plan svg, regardless of def/validity', () => {
    expect(decidePlanTouchLift(sofa, false, true)).toBe('off-plan')
    expect(decidePlanTouchLift(sofa, false, false)).toBe('off-plan')
  })

  it('cancels ("off-plan") when no def is armed, even if somehow marked on-plan', () => {
    expect(decidePlanTouchLift(undefined, true, true)).toBe('off-plan')
  })

  it('commits when on-plan, armed, and the ghost is valid (mirrors decidePlanCommit)', () => {
    expect(decidePlanTouchLift(sofa, true, true)).toBe('commit')
  })

  it('is invalid (not off-plan) when on-plan but colliding — the caller still cancels, but for a distinct reason', () => {
    expect(decidePlanTouchLift(sofa, true, false)).toBe('invalid')
  })

  it('commits a window-bound def on-plan whose lift point snapped to a window (Phase 3)', () => {
    expect(decidePlanTouchLift(curtains, true, true)).toBe('commit')
  })

  it('is ineligible for a window-bound def on-plan with no window to snap to', () => {
    expect(decidePlanTouchLift(curtains, true, false)).toBe('ineligible')
  })
})
