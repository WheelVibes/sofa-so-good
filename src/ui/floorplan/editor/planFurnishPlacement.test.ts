import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import {
  buildPlanGhostItem,
  decidePlanCommit,
  decidePlanTouchLift,
  isPlanPlaceable,
  PLAN_GHOST_ID,
  planGhostValid,
  screenToGridPoint,
} from './planFurnishPlacement'

const sofa = BUILTIN_CATALOG['sofa-3seat']
// A window-bound fixture (WINDOW-FIXTURE) — excluded from Phase 1 plan placement.
const curtains = BUILTIN_CATALOG.curtains

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

describe('isPlanPlaceable', () => {
  it('is true for an ordinary floor-standing def', () => {
    expect(isPlanPlaceable(sofa)).toBe(true)
  })

  it('is false for a window-bound fixture (excluded from Phase 1)', () => {
    expect(curtains.windowBound).toBe(true)
    expect(isPlanPlaceable(curtains)).toBe(false)
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

  it('is always false for a window-bound def, valid position or not', () => {
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

  it('is ineligible for a window-bound def regardless of validity', () => {
    expect(decidePlanCommit(curtains, true)).toBe('ineligible')
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

  it('is ineligible for a window-bound def even when on-plan and "valid"', () => {
    expect(decidePlanTouchLift(curtains, true, true)).toBe('ineligible')
  })
})
