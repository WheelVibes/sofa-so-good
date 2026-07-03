import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import {
  buildPlanGhostItem,
  decidePlanCommit,
  isPlanPlaceable,
  PLAN_GHOST_ID,
  planGhostValid,
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
