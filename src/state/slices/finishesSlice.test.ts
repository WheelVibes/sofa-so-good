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
