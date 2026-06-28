import { beforeEach, describe, expect, it } from 'vitest'
import { ROOMS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { useStore } from '../store'

const interiorRooms = (Object.entries(ROOMS) as [RoomId, { external?: boolean }][])
  .filter(([, r]) => !r.external)
  .map(([id]) => id)

describe('finishes — apply to all rooms', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('setAllFloorFinish applies one id to every interior room', () => {
    useStore.getState().setAllFloorFinish('floor-parquet-oak')
    const floor = useStore.getState().finishes.floor
    for (const id of interiorRooms) expect(floor[id]).toBe('floor-parquet-oak')
  })

  it('setAllWallFinish applies one id to every interior room', () => {
    useStore.getState().setAllWallFinish('wall-brick-red')
    const walls = useStore.getState().finishes.walls
    for (const id of interiorRooms) expect(walls[id]).toBe('wall-brick-red')
  })

  it('setAllCeilingFinish applies one id to every interior room', () => {
    useStore.getState().setAllCeilingFinish('wall-paint-white')
    const ceiling = useStore.getState().finishes.ceiling
    for (const id of interiorRooms) expect(ceiling[id]).toBe('wall-paint-white')
  })

  it('ceiling finish starts empty (default white) and clears back to it', () => {
    expect(Object.keys(useStore.getState().finishes.ceiling)).toHaveLength(0)
    const room = interiorRooms[0]
    useStore.getState().setCeilingFinish(room, 'wall-fluted-walnut')
    expect(useStore.getState().finishes.ceiling[room]).toBe('wall-fluted-walnut')
    useStore.getState().clearCeilingFinish(room)
    expect(useStore.getState().finishes.ceiling[room]).toBeUndefined()
  })

  it('applies to a custom plan’s own rooms (not the fixed apartment rooms)', () => {
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-apply-all',
        rooms: [
          { id: 'studio-main', name: 'Studio', origin: [0, 0], width: 5, depth: 4 },
          { id: 'nook', name: 'Nook', origin: [5, 0], width: 2, depth: 2 },
        ],
      },
    })
    useStore.getState().setAllFloorFinish('floor-parquet-oak')
    useStore.getState().setAllWallFinish('wall-brick-red')
    const f = useStore.getState().finishes
    expect((f.floor as Record<string, string>)['studio-main']).toBe('floor-parquet-oak')
    expect((f.floor as Record<string, string>)['nook']).toBe('floor-parquet-oak')
    expect((f.walls as Record<string, string>)['studio-main']).toBe('wall-brick-red')
  })

  it('leaves external rooms (e.g. AC ledge) untouched where applicable', () => {
    const externals = (Object.entries(ROOMS) as [RoomId, { external?: boolean }][])
      .filter(([, r]) => r.external)
      .map(([id]) => id)
    const before = externals.map((id) => useStore.getState().finishes.floor[id])
    useStore.getState().setAllFloorFinish('floor-parquet-oak')
    externals.forEach((id, i) => {
      expect(useStore.getState().finishes.floor[id]).toBe(before[i])
    })
  })
})

describe('finishes ↔ plan write-through (FP-next)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const activateCustomPlan = () => {
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'custom-write-through',
        rooms: [
          { id: 'studio-main', name: 'Studio', origin: [0, 0], width: 5, depth: 4 },
          {
            id: 'nook',
            name: 'Nook',
            origin: [5, 0],
            width: 2,
            depth: 2,
            floor: 'floor-tile-grey',
          },
        ],
      },
    })
  }

  it('setFloorFinish writes through to the active plan room', () => {
    activateCustomPlan()
    useStore.getState().setFloorFinish('studio-main' as RoomId, 'floor-parquet-oak')
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === 'studio-main')
    expect(room?.floor).toBe('floor-parquet-oak')
  })

  it('setWallFinish + clearWallFinish write through to the plan room wall', () => {
    activateCustomPlan()
    useStore.getState().setWallFinish('nook' as RoomId, 'wall-brick-red')
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === 'nook')?.wall).toBe(
      'wall-brick-red',
    )
    useStore.getState().clearWallFinish('nook' as RoomId)
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === 'nook')?.wall).toBeUndefined()
    expect((useStore.getState().finishes.walls as Record<string, string>)['nook']).toBeUndefined()
  })

  it('setCeilingFinish + clearCeilingFinish write through to the plan room ceilingFinish', () => {
    activateCustomPlan()
    useStore.getState().setCeilingFinish('studio-main' as RoomId, 'wall-fluted-walnut')
    expect(
      useStore.getState().floorPlan.rooms.find((r) => r.id === 'studio-main')?.ceilingFinish,
    ).toBe('wall-fluted-walnut')
    useStore.getState().clearCeilingFinish('studio-main' as RoomId)
    expect(
      useStore.getState().floorPlan.rooms.find((r) => r.id === 'studio-main')?.ceilingFinish,
    ).toBeUndefined()
    expect(
      (useStore.getState().finishes.ceiling as Record<string, string>)['studio-main'],
    ).toBeUndefined()
  })

  it('setAllFloorFinish writes through to every plan room', () => {
    activateCustomPlan()
    useStore.getState().setAllFloorFinish('floor-parquet-oak')
    for (const r of useStore.getState().floorPlan.rooms) {
      expect(r.floor).toBe('floor-parquet-oak')
    }
  })

  it('keeps the plan object identity on a no-op write-through', () => {
    activateCustomPlan()
    useStore.getState().setFloorFinish('studio-main' as RoomId, 'floor-parquet-oak')
    const plan = useStore.getState().floorPlan
    useStore.getState().setFloorFinish('studio-main' as RoomId, 'floor-parquet-oak')
    expect(useStore.getState().floorPlan).toBe(plan)
  })

  it('writes through to a room on an upper level (F13/ML4b)', () => {
    const lvl = useStore.getState().addLevel()
    const roomId = useStore
      .getState()
      .addRoom({ name: 'Loft', origin: [0, 0], width: 3, depth: 3 }, lvl)
    useStore.getState().setFloorFinish(roomId as RoomId, 'floor-parquet-oak')
    useStore.getState().setWallFinish(roomId as RoomId, 'wall-brick-red')
    const s = useStore.getState()
    const room = s.floorPlan.upperLevels?.[0].rooms.find((r) => r.id === roomId)
    expect(room?.floor).toBe('floor-parquet-oak')
    expect(room?.wall).toBe('wall-brick-red')
    expect((s.finishes.floor as Record<string, string>)[roomId]).toBe('floor-parquet-oak')
  })

  it('setAll{Floor,Wall}Finish reaches rooms on upper storeys (FIN-ALLROOMS)', () => {
    // Regression: the bulk "apply to every room" used to iterate ground-only
    // `floorPlan.rooms`, silently skipping upper-level rooms on multi-storey plans.
    const lvl = useStore.getState().addLevel()
    const upper = useStore
      .getState()
      .addRoom({ name: 'Attic', origin: [0, 0], width: 3, depth: 3 }, lvl)
    useStore.getState().setAllFloorFinish('floor-parquet-oak')
    useStore.getState().setAllWallFinish('wall-brick-red')
    const s = useStore.getState()
    // The finishes map carries the upper room.
    expect((s.finishes.floor as Record<string, string>)[upper]).toBe('floor-parquet-oak')
    expect((s.finishes.walls as Record<string, string>)[upper]).toBe('wall-brick-red')
    // …and so does the upper-level plan object.
    const room = s.floorPlan.upperLevels?.[0].rooms.find((r) => r.id === upper)
    expect(room?.floor).toBe('floor-parquet-oak')
    expect(room?.wall).toBe('wall-brick-red')
  })

  it('activating a different plan prunes the previous plan’s custom-room finishes', () => {
    activateCustomPlan()
    useStore.getState().setFloorFinish('studio-main' as RoomId, 'floor-parquet-oak')
    useStore.getState().setWallFinish('livingDining' as RoomId, 'wall-brick-red') // builtin room
    useStore.getState().setFloorPlan({
      ...useStore.getState().floorPlan,
      id: 'another-plan',
      rooms: [{ id: 'big-room', name: 'Big', origin: [0, 0], width: 6, depth: 5 }],
    })
    const f = useStore.getState().finishes
    expect((f.floor as Record<string, string>)['studio-main']).toBeUndefined()
    // Builtin-room finishes survive a plan switch.
    expect(f.walls['livingDining']).toBe('wall-brick-red')
  })
})
