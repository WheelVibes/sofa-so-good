import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan } from '../../floorplan/types'
import { useStore } from '../store'

/**
 * Every user-facing "load / reset / new plan" goes through `replaceFloorPlan`,
 * which owns the three things each of those used to get wrong on its own:
 * ONE undo step for plan + furniture, finishes pruned (including the per-FACE
 * accent maps), and an explicit answer for the furniture already placed.
 * Leaving furniture untouched is what stranded it at old world coordinates.
 */

const smallPlan = (id: string): FloorPlan => ({
  id,
  name: id,
  ceilingHeight: 2.6,
  extent: [6, 6],
  walls: [{ id: `${id}-w`, start: [0, 0], end: [5, 0], thickness: 'internal' }],
  openings: [],
  rooms: [{ id: `${id}-room`, name: 'Room', origin: [0, 0], width: 5, depth: 5 }],
})

beforeEach(() => {
  useStore.getState().resetFloorPlan()
  useStore.setState({ items: [] })
  useStore.getState().clearHistory()
})

describe('replaceFloorPlan — furniture policy', () => {
  it("'clear' empties the scene and the selection", () => {
    useStore.setState({
      items: [{ id: 'a', defId: 'sofa-3seat', position: [11, 3], rotation: 0, props: {} }],
      selectedItemId: 'a',
      selectedItemIds: ['a'],
    })
    useStore.getState().replaceFloorPlan(smallPlan('p1'), { furniture: 'clear' })
    const s = useStore.getState()
    expect(s.items).toEqual([])
    expect(s.selectedItemId).toBeNull()
    expect(s.selectedItemIds).toEqual([])
  })

  it("'rehome' keeps furniture and pulls stranded pieces back inside", () => {
    useStore.setState({
      items: [
        { id: 'inside', defId: 'sofa-3seat', position: [2, 2], rotation: 0, props: {} },
        { id: 'stranded', defId: 'sofa-3seat', position: [40, 40], rotation: 0, props: {} },
      ],
    })
    useStore.getState().replaceFloorPlan(smallPlan('p2'), { furniture: 'rehome' })
    const items = useStore.getState().items
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.id === 'inside')?.position).toEqual([2, 2])
    const moved = items.find((i) => i.id === 'stranded')!.position
    expect(moved).not.toEqual([40, 40])
    expect(moved[0]).toBeLessThanOrEqual(5)
    expect(moved[1]).toBeLessThanOrEqual(5)
  })
})

describe('replaceFloorPlan — one undo step', () => {
  it('restores the plan AND the furniture with a single undo', () => {
    const before = useStore.getState().floorPlan.id
    useStore.setState({
      items: [{ id: 'a', defId: 'sofa-3seat', position: [11, 3], rotation: 0, props: {} }],
    })
    useStore.getState().replaceFloorPlan(smallPlan('p3'), { furniture: 'clear' })
    expect(useStore.getState().floorPlan.id).toBe('p3')
    expect(useStore.getState().items).toEqual([])

    useStore.getState().undo()
    expect(useStore.getState().floorPlan.id).toBe(before)
    expect(useStore.getState().items).toHaveLength(1)
  })
})

describe('replaceFloorPlan — finishes hygiene', () => {
  it('drops finishes for rooms the new plan does not have', () => {
    useStore.setState((s) => ({
      finishes: { ...s.finishes, floor: { ...s.finishes.floor, ghostRoom: 'floor-tile-beige' } },
    }))
    useStore.getState().replaceFloorPlan(smallPlan('p4'), { furniture: 'clear' })
    expect(useStore.getState().finishes.floor).not.toHaveProperty('ghostRoom')
  })

  it('drops per-FACE accent + texture entries whose wall or room is gone', () => {
    // Keyed `${wallId}:${roomId}` — these were never pruned, so a swapped plan
    // carried the previous plan's accent walls around forever.
    useStore.setState((s) => ({
      finishes: {
        ...s.finishes,
        wallAccents: { 'ghost-wall:ghost-room': 'wall-paint-warm' },
        wallTex: { 'ghost-wall:ghost-room': { angle: 90 } },
      },
    }))
    useStore.getState().replaceFloorPlan(smallPlan('p5'), { furniture: 'clear' })
    const f = useStore.getState().finishes
    expect(f.wallAccents).toEqual({})
    expect(f.wallTex).toEqual({})
  })

  it('keeps a face entry whose wall AND room both exist in the new plan', () => {
    const plan = smallPlan('p6')
    const key = `${plan.walls[0].id}:${plan.rooms[0].id}`
    useStore.getState().replaceFloorPlan(plan, { furniture: 'clear' })
    useStore.getState().setWallAccent(key, 'wall-paint-warm')
    // A no-op swap back to the SAME plan must not throw the accent away.
    useStore.getState().replaceFloorPlan(plan, { furniture: 'clear' })
    expect(useStore.getState().finishes.wallAccents[key]).toBe('wall-paint-warm')
  })
})

describe('newFloorPlan', () => {
  it('makes a TRULY empty plan by default — no walls, no rooms', () => {
    useStore.getState().newFloorPlan()
    const p = useStore.getState().floorPlan
    expect(p.walls).toEqual([])
    expect(p.rooms).toEqual([])
    expect(p.openings).toEqual([])
    // Still a finite canvas so bounds / camera framing have numbers to use.
    expect(p.extent[0]).toBeGreaterThan(0)
    expect(p.extent[1]).toBeGreaterThan(0)
  })

  it('seeds a starter shell on request', () => {
    useStore.getState().newFloorPlan({ shell: true })
    const p = useStore.getState().floorPlan
    expect(p.walls).toHaveLength(4)
    expect(p.rooms).toHaveLength(1)
  })

  it('always clears the furniture — a new home has nothing standing in it', () => {
    useStore.setState({
      items: [{ id: 'a', defId: 'sofa-3seat', position: [11, 3], rotation: 0, props: {} }],
    })
    useStore.getState().newFloorPlan({ shell: true })
    expect(useStore.getState().items).toEqual([])
  })
})

describe('resetFloorPlan', () => {
  it('restores the default flat and keeps furniture, re-homing strays', () => {
    useStore.getState().newFloorPlan()
    useStore.setState({
      items: [{ id: 'a', defId: 'sofa-3seat', position: [60, 60], rotation: 0, props: {} }],
    })
    useStore.getState().resetFloorPlan()
    const s = useStore.getState()
    expect(s.floorPlan.id).toBe(buildDefaultPlan().id)
    expect(s.items).toHaveLength(1)
    // Pulled back inside the flat rather than left at (60, 60).
    expect(s.items[0].position[0]).toBeLessThan(13)
    expect(s.items[0].position[1]).toBeLessThan(10)
  })
})

describe('loadSavedPlan', () => {
  it('is a single undo step and keeps furniture', () => {
    useStore.setState({
      items: [{ id: 'a', defId: 'sofa-3seat', position: [11, 3], rotation: 0, props: {} }],
    })
    const id = useStore.getState().saveCurrentPlan('Library copy')
    useStore.getState().newFloorPlan()
    expect(useStore.getState().items).toEqual([])

    useStore.getState().loadSavedPlan(id)
    expect(useStore.getState().floorPlan.name).toBe('Library copy')
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.rooms).toEqual([])
  })
})
