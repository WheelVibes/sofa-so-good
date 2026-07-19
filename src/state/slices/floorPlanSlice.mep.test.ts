import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_ID } from '../../floorplan/planGeometry'
import { useStore } from '../store'

/**
 * MEP layer (G1, PR2) — add/update/remove electrical + plumbing points.
 * Mirrors the notes/dimensions/polyline coverage in `floorPlanSlice.test.ts`,
 * plus the plan-doc's explicit forkIfDefault risk (#1: a non-forking add on
 * the seeded default plan would vanish from `serialize()`).
 */
describe('floorPlanSlice — MEP points (electrical/plumbing)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('adds, patches and removes an electrical point (one undo step each)', () => {
    const pastBefore = useStore.getState().past.length
    const id = useStore.getState().addElectricalPoint({ x: 1, z: 2, kind: 'socket' })
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    const point = useStore.getState().floorPlan.electricalPoints?.find((p) => p.id === id)
    expect(point).toMatchObject({ x: 1, z: 2, kind: 'socket' })

    const afterAdd = useStore.getState().past.length
    useStore.getState().updateElectricalPoint(id, { mountHeightMm: 1200, label: 'Study desk' })
    expect(useStore.getState().past.length).toBe(afterAdd + 1)
    const patched = useStore.getState().floorPlan.electricalPoints?.find((p) => p.id === id)
    expect(patched).toMatchObject({ mountHeightMm: 1200, label: 'Study desk' })

    const afterUpdate = useStore.getState().past.length
    useStore.getState().setPlanSelection({ type: 'mep', family: 'electrical', id })
    useStore.getState().removeElectricalPoint(id)
    expect(useStore.getState().past.length).toBe(afterUpdate + 1)
    expect(useStore.getState().floorPlan.electricalPoints?.some((p) => p.id === id)).toBe(false)
    expect(useStore.getState().planSelection).toBeNull()
  })

  it('adds, patches and removes a plumbing point (one undo step each)', () => {
    const pastBefore = useStore.getState().past.length
    const id = useStore.getState().addPlumbingPoint({ x: 3, z: 1, kind: 'water-point' })
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    expect(useStore.getState().floorPlan.plumbingPoints?.find((p) => p.id === id)).toMatchObject({
      x: 3,
      z: 1,
      kind: 'water-point',
    })

    const afterAdd = useStore.getState().past.length
    useStore.getState().updatePlumbingPoint(id, { mountHeightMm: 600 })
    expect(useStore.getState().past.length).toBe(afterAdd + 1)
    expect(
      useStore.getState().floorPlan.plumbingPoints?.find((p) => p.id === id)?.mountHeightMm,
    ).toBe(600)

    const afterUpdate = useStore.getState().past.length
    useStore.getState().setPlanSelection({ type: 'mep', family: 'plumbing', id })
    useStore.getState().removePlumbingPoint(id)
    expect(useStore.getState().past.length).toBe(afterUpdate + 1)
    expect(useStore.getState().floorPlan.plumbingPoints?.some((p) => p.id === id)).toBe(false)
    expect(useStore.getState().planSelection).toBeNull()
  })

  it('coalesces a burst of updates to the same point into one undo step', () => {
    const id = useStore.getState().addElectricalPoint({ x: 0, z: 0, kind: 'socket' })
    const afterAdd = useStore.getState().past.length
    useStore.getState().updateElectricalPoint(id, { x: 0.1 })
    useStore.getState().updateElectricalPoint(id, { x: 0.2 })
    useStore.getState().updateElectricalPoint(id, { x: 0.3 })
    expect(useStore.getState().past.length).toBe(afterAdd + 1)
    expect(useStore.getState().floorPlan.electricalPoints?.find((p) => p.id === id)?.x).toBe(0.3)
  })

  it('removing one MEP point clears only its own selection, leaving another type untouched', () => {
    const epId = useStore.getState().addElectricalPoint({ x: 0, z: 0, kind: 'socket' })
    const wallId = useStore.getState().floorPlan.walls[0]?.id
    // Select a wall (a different selection type), then remove the electrical
    // point — the wall selection must survive untouched.
    if (wallId) useStore.getState().setPlanSelection({ type: 'wall', id: wallId })
    useStore.getState().removeElectricalPoint(epId)
    if (wallId) expect(useStore.getState().planSelection).toEqual({ type: 'wall', id: wallId })

    // Selecting a plumbing point, then removing an UNRELATED electrical point,
    // must not clear the plumbing selection (different family/id).
    const ppId = useStore.getState().addPlumbingPoint({ x: 1, z: 1, kind: 'water-point' })
    const ep2 = useStore.getState().addElectricalPoint({ x: 2, z: 2, kind: 'switch' })
    useStore.getState().setPlanSelection({ type: 'mep', family: 'plumbing', id: ppId })
    useStore.getState().removeElectricalPoint(ep2)
    expect(useStore.getState().planSelection).toEqual({ type: 'mep', family: 'plumbing', id: ppId })
  })

  it('adding an electrical point on the default plan forks it, and the point survives serialize()', async () => {
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
    const id = useStore.getState().addElectricalPoint({ x: 1, z: 1, kind: 'aircon' })
    const forkedId = useStore.getState().floorPlan.id
    expect(forkedId).not.toBe(DEFAULT_PLAN_ID)
    expect(useStore.getState().floorPlan.electricalPoints?.some((p) => p.id === id)).toBe(true)

    const { serialize } = await import('../schema')
    const saved = serialize(useStore.getState())
    expect(saved.floorPlan).toBeDefined()
    expect(saved.floorPlan?.id).toBe(forkedId)
    expect(saved.floorPlan?.electricalPoints?.some((p) => p.id === id)).toBe(true)
  })

  it('adding a plumbing point on the default plan forks it too', () => {
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
    useStore.getState().addPlumbingPoint({ x: 1, z: 1, kind: 'floor-trap' })
    expect(useStore.getState().floorPlan.id).not.toBe(DEFAULT_PLAN_ID)
  })

  it('tags a point to an upper storey via levelId', () => {
    const lvl = useStore.getState().addLevel()
    const id = useStore.getState().addElectricalPoint({ x: 1, z: 1, kind: 'socket', levelId: lvl })
    expect(useStore.getState().floorPlan.electricalPoints?.find((p) => p.id === id)?.levelId).toBe(
      lvl,
    )
  })

  it('water-heater stays unambiguous across both families (family discriminant)', () => {
    const epId = useStore.getState().addElectricalPoint({ x: 1, z: 1, kind: 'water-heater' })
    const ppId = useStore.getState().addPlumbingPoint({ x: 1.5, z: 1, kind: 'water-heater' })
    expect(epId).not.toBe(ppId)
    useStore.getState().setPlanSelection({ type: 'mep', family: 'electrical', id: epId })
    // Removing the PLUMBING water-heater point must not touch the selected
    // ELECTRICAL water-heater point's selection, even though both share `kind`.
    useStore.getState().removePlumbingPoint(ppId)
    expect(useStore.getState().planSelection).toEqual({
      type: 'mep',
      family: 'electrical',
      id: epId,
    })
    expect(useStore.getState().floorPlan.electricalPoints?.some((p) => p.id === epId)).toBe(true)
    expect(useStore.getState().floorPlan.plumbingPoints?.some((p) => p.id === ppId)).toBe(false)
  })
})
