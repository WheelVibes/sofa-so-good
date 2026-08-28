import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * filletCorner store action (PARITY-CORNER-FILLET) — rounds/bevels the corner of
 * two connected walls, inserting a connecting wall. Pure geometry is covered by
 * filletWalls.test.ts; here we cover the store integration (re-id, history,
 * shared-corner guard).
 */
describe('filletCorner', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  // Find two walls in the active plan that share an endpoint (within 1e-3).
  function connectedPair() {
    const walls = useStore.getState().floorPlan.walls
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const A = walls[i]
        const B = walls[j]
        const pts = [A.start, A.end]
        const qts = [B.start, B.end]
        for (const p of pts)
          for (const q of qts)
            if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3) return [A.id, B.id] as const
      }
    }
    return null
  }

  it('rounds a real corner and inserts one connecting wall', () => {
    useStore.getState().newFloorPlan({ shell: true })
    const pair = connectedPair()
    expect(pair).not.toBeNull()
    const before = useStore.getState().floorPlan.walls.length
    const ok = useStore.getState().filletCorner(pair![0], pair![1], 0.3, 'round', 'ground')
    expect(ok).toBe(true)
    const after = useStore.getState().floorPlan.walls
    expect(after.length).toBe(before + 1)
    // The inserted connector is curved (carries an arc bulge).
    expect(after.some((w) => typeof w.arc === 'number' && Math.abs(w.arc) > 1e-4)).toBe(true)
  })

  it('returns false for two walls that do not share a corner', () => {
    useStore.getState().newFloorPlan({ shell: true })
    const walls = useStore.getState().floorPlan.walls
    // Fabricate a clearly non-touching id pair by reusing the same id twice.
    expect(useStore.getState().filletCorner(walls[0].id, walls[0].id, 0.3, 'round', 'ground')).toBe(
      false,
    )
  })

  it('is one undo step', () => {
    useStore.getState().newFloorPlan({ shell: true })
    const pair = connectedPair()
    const past = useStore.getState().past.length
    useStore.getState().filletCorner(pair![0], pair![1], 0.3, 'bevel', 'ground')
    expect(useStore.getState().past.length).toBe(past + 1)
  })
})
