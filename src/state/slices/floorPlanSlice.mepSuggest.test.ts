import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_ID } from '../../floorplan/planGeometry'
import { useStore } from '../store'

/**
 * MEP layer (G1, PR4) — `suggestMepPoints` derives a starting layout from the
 * current furniture + doors (same heuristic as the drawing-set export
 * fallback, `furniture/mepSuggest.ts` — ONE derivation source, plan-doc risk
 * #4), assigns per-kind default mount heights, and appends both families
 * under a single undo step.
 */
describe('floorPlanSlice — suggestMepPoints', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('adds a desk → socket-double + data, and a door → switch, in one undo step', () => {
    const a = useStore.getState()
    a.setItems([
      {
        id: 'desk-1',
        defId: 'desk',
        position: [1, 1],
        rotation: 0,
        props: {},
      },
    ])
    const pastBefore = useStore.getState().past.length
    const { electrical, plumbing } = useStore.getState().suggestMepPoints()
    // The default HDB plan has at least one door → at least one switch, plus
    // the desk's socket-double + data.
    expect(electrical).toBeGreaterThanOrEqual(3)
    expect(plumbing).toBe(0)
    expect(useStore.getState().past.length).toBe(pastBefore + 1)

    const pts = useStore.getState().floorPlan.electricalPoints ?? []
    expect(pts.some((p) => p.kind === 'socket-double' && p.x === 1 && p.z === 1)).toBe(true)
    expect(pts.some((p) => p.kind === 'data')).toBe(true)
    expect(pts.some((p) => p.kind === 'switch')).toBe(true)
    // Every new point got a per-kind default mount height (mepPoints.ts).
    const socket = pts.find((p) => p.kind === 'socket-double')
    expect(socket?.mountHeightMm).toBe(300)
    const sw = pts.find((p) => p.kind === 'switch')
    expect(sw?.mountHeightMm).toBe(1200)
  })

  it('a WC suggests a soil pipe + water point (plumbing)', () => {
    const a = useStore.getState()
    a.setItems([{ id: 'wc-1', defId: 'toilet', position: [2, 2], rotation: 0, props: {} }])
    const { plumbing } = useStore.getState().suggestMepPoints()
    expect(plumbing).toBe(2)
    const pts = useStore.getState().floorPlan.plumbingPoints ?? []
    expect(pts.some((p) => p.kind === 'soil-pipe')).toBe(true)
    expect(pts.some((p) => p.kind === 'water-point')).toBe(true)
  })

  it('re-running Suggest adds 0 new points once everything is already suggested (dedupe)', () => {
    const a = useStore.getState()
    a.setItems([{ id: 'desk-1', defId: 'desk', position: [1, 1], rotation: 0, props: {} }])
    const first = useStore.getState().suggestMepPoints()
    expect(first.electrical).toBeGreaterThan(0)
    const countAfterFirst = (useStore.getState().floorPlan.electricalPoints ?? []).length

    const second = useStore.getState().suggestMepPoints()
    expect(second).toEqual({ electrical: 0, plumbing: 0 })
    expect((useStore.getState().floorPlan.electricalPoints ?? []).length).toBe(countAfterFirst)
  })

  it('one undo reverts every point Suggest added, across both families', () => {
    const a = useStore.getState()
    a.setItems([
      { id: 'desk-1', defId: 'desk', position: [1, 1], rotation: 0, props: {} },
      { id: 'wc-1', defId: 'toilet', position: [2, 2], rotation: 0, props: {} },
    ])
    const { electrical, plumbing } = useStore.getState().suggestMepPoints()
    expect(electrical).toBeGreaterThan(0)
    expect(plumbing).toBeGreaterThan(0)

    useStore.getState().undo()
    expect(useStore.getState().floorPlan.electricalPoints ?? []).toHaveLength(0)
    expect(useStore.getState().floorPlan.plumbingPoints ?? []).toHaveLength(0)
  })

  it('forks the default plan (points survive serialize())', async () => {
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
    const a = useStore.getState()
    a.setItems([{ id: 'desk-1', defId: 'desk', position: [1, 1], rotation: 0, props: {} }])
    useStore.getState().suggestMepPoints()
    const forkedId = useStore.getState().floorPlan.id
    expect(forkedId).not.toBe(DEFAULT_PLAN_ID)

    const { serialize } = await import('../schema')
    const saved = serialize(useStore.getState())
    expect(saved.floorPlan?.electricalPoints?.length).toBeGreaterThan(0)
  })
})
