import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_ID } from '../../floorplan/planGeometry'
import { useStore } from '../store'

describe('default-plan binding (edits fork to a custom plan)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('starts on the seeded default plan', () => {
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
  })

  it('re-ids the default plan on the first structural edit so the 3D scene binds', () => {
    const s = useStore.getState()
    expect(s.floorPlan.id).toBe(DEFAULT_PLAN_ID)
    s.addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const id = useStore.getState().floorPlan.id
    expect(id).not.toBe(DEFAULT_PLAN_ID)
  })

  it('keeps a stable custom id across subsequent edits (fork is idempotent)', () => {
    const s = useStore.getState()
    const wid = s.addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    const id1 = useStore.getState().floorPlan.id
    useStore.getState().updateWall(wid, { thickness: 'external' })
    expect(useStore.getState().floorPlan.id).toBe(id1)
  })

  it('does NOT fork for an appearance-only room patch (finish / texture dials)', () => {
    // A grain direction or a tile size changes no geometry, so the curated flat
    // must stay the curated flat — forking here silently swapped a user's
    // `<Apartment/>` render for `PlanShell` mid-session.
    const s = useStore.getState()
    s.updateRoom('livingDining', { floorTexAngle: Math.PI / 2 })
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
    useStore.getState().updateRoom('livingDining', { wallTexScale: 2, floor: 'floor-wood-oak' })
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
    // …and the patch still applied.
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === 'livingDining')
    expect(room?.wallTexScale).toBe(2)
    expect(room?.floor).toBe('floor-wood-oak')
  })

  it('still forks when the SAME call also moves the room', () => {
    const s = useStore.getState()
    s.updateRoom('livingDining', { floorTexAngle: 1, width: 5 })
    expect(useStore.getState().floorPlan.id).not.toBe(DEFAULT_PLAN_ID)
  })

  it('undo restores the default plan id', () => {
    const s = useStore.getState()
    s.addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' })
    expect(useStore.getState().floorPlan.id).not.toBe(DEFAULT_PLAN_ID)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.id).toBe(DEFAULT_PLAN_ID)
  })
})

describe('room rename re-flows auto-named walls / doors / windows', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renaming a room renames its auto-named boundary walls + openings, but not custom-named ones', () => {
    const s = useStore.getState()
    s.newFloorPlan({ name: 'Naming test', shell: true })
    // A closed square room boundary.
    const top = s.addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' })
    s.addWall({ start: [4, 0], end: [4, 4], thickness: 'internal' })
    s.addWall({ start: [4, 4], end: [0, 4], thickness: 'internal' })
    s.addWall({ start: [0, 4], end: [0, 0], thickness: 'internal' })
    const door = s.addOpening({
      kind: 'door',
      wallId: top,
      offset: 1,
      width: 0.9,
      sill: 0,
      head: 2.1,
    })
    const roomId = s.addRoom({ name: 'Bedroom', origin: [0, 0], width: 4, depth: 4 })

    const afterAdd = useStore.getState().floorPlan
    const topWall = afterAdd.walls.find((w) => w.id === top)!
    const doorOpening = afterAdd.openings.find((o) => o.id === door)!
    expect(topWall.name).toContain('Bedroom wall')
    expect(topWall.nameAuto).toBe(true)
    expect(doorOpening.name).toContain('Bedroom door')
    expect(doorOpening.nameAuto).toBe(true)

    // Give the door a custom name (clears nameAuto so a later rename won't touch it).
    useStore.getState().updateOpening(door, { name: 'Front entrance', nameAuto: undefined })

    // Rename the room → auto-named walls follow; the custom door name stays.
    useStore.getState().updateRoom(roomId, { name: 'Study' })
    const after = useStore.getState().floorPlan
    expect(after.walls.find((w) => w.id === top)!.name).toContain('Study wall')
    expect(after.openings.find((o) => o.id === door)!.name).toBe('Front entrance')
  })
})

describe('opening name edit clears the auto flag', () => {
  beforeEach(() => useStore.getState().__resetForTest())
  it('updateOpening with nameAuto: undefined makes the name permanent', () => {
    const s = useStore.getState()
    s.newFloorPlan({ name: 'x', shell: true })
    const wid = s.addWall({ start: [0, 0], end: [4, 0], thickness: 'internal' })
    const oid = s.addOpening({
      kind: 'window',
      wallId: wid,
      offset: 1,
      width: 1.2,
      sill: 0.9,
      head: 2.1,
    })
    useStore.getState().updateOpening(oid, { name: 'Bay window', nameAuto: undefined })
    const o = useStore.getState().floorPlan.openings.find((x) => x.id === oid)!
    expect(o.name).toBe('Bay window')
    expect(o.nameAuto).toBeUndefined()
  })
})
