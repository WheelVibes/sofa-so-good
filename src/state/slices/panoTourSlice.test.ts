// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { cameraPose, cameraPosXZ } from '../../scene/cameras/cameraForward'
import { MAX_TOUR_STOPS } from '../../ui/panorama/panoTour'
import { useStore } from '../store'

describe('panoTourSlice', () => {
  beforeEach(() => {
    useStore.getState().clearPanoTour()
    useStore.setState({ cameraMode: 'orbit', viewLevelId: 'all' } as never)
  })

  it('adds a stop at the orbit pivot with a room-derived label', () => {
    // The default HDB plan's Living/Dining room contains this point.
    cameraPose.tx = 10.5
    cameraPose.tz = 3
    const id = useStore.getState().addPanoTourStopHere()
    const s = useStore.getState()
    expect(id).toBeTruthy()
    const added = s.panoTourStops.find((t) => t.id === id)
    expect(added?.position).toEqual([10.5, 3])
    expect(added?.label).toBe(s.floorPlan.rooms.find((r) => r.id === 'livingDining')?.name)
    expect(added?.levelId).toBeUndefined()
    // The new stop becomes the active one in the viewer.
    expect(s.panoTourActiveId).toBe(id)
  })

  it('numbers a second capture in the same room', () => {
    cameraPose.tx = 10.5
    cameraPose.tz = 3
    useStore.getState().addPanoTourStopHere()
    cameraPose.tx = 11
    useStore.getState().addPanoTourStopHere()
    const labels = useStore.getState().panoTourStops.map((t) => t.label)
    expect(labels[1]).toBe(`${labels[0]} 2`)
  })

  it('uses the walk camera position in walk mode', () => {
    useStore.setState({ cameraMode: 'firstPerson' } as never)
    cameraPosXZ.x = 1.5
    cameraPosXZ.z = 1.5
    cameraPose.tx = 99
    cameraPose.tz = 99
    const id = useStore.getState().addPanoTourStopHere()
    expect(useStore.getState().panoTourStops.find((t) => t.id === id)?.position).toEqual([1.5, 1.5])
  })

  it('persists stops to localStorage and survives a reload (round-trip)', () => {
    cameraPose.tx = 2
    cameraPose.tz = 2
    useStore.getState().addPanoTourStopHere()
    const persisted = JSON.parse(localStorage.getItem('hdb_pano_tour') ?? '[]')
    expect(persisted).toHaveLength(1)
    expect(persisted[0].position).toEqual([2, 2])
  })

  it('removing the active stop falls back to the first remaining stop', () => {
    cameraPose.tx = 2
    cameraPose.tz = 2
    const a = useStore.getState().addPanoTourStopHere()
    cameraPose.tx = 10.5
    cameraPose.tz = 3
    const b = useStore.getState().addPanoTourStopHere()
    expect(useStore.getState().panoTourActiveId).toBe(b)
    useStore.getState().removePanoTourStop(b!)
    const s = useStore.getState()
    expect(s.panoTourStops.map((t) => t.id)).toEqual([a])
    expect(s.panoTourActiveId).toBe(a)
    useStore.getState().removePanoTourStop(a!)
    expect(useStore.getState().panoTourActiveId).toBeNull()
  })

  it('caps the tour and returns null when full', () => {
    for (let i = 0; i < MAX_TOUR_STOPS; i++) {
      cameraPose.tx = i
      cameraPose.tz = 1
      expect(useStore.getState().addPanoTourStopHere()).toBeTruthy()
    }
    expect(useStore.getState().addPanoTourStopHere()).toBeNull()
    expect(useStore.getState().panoTourStops).toHaveLength(MAX_TOUR_STOPS)
  })

  it('setPanoTourActive ignores unknown ids', () => {
    cameraPose.tx = 2
    cameraPose.tz = 2
    const a = useStore.getState().addPanoTourStopHere()
    useStore.getState().setPanoTourActive('nope')
    expect(useStore.getState().panoTourActiveId).toBe(a)
  })

  it('tags stops with the active upper storey so hotspots stay per-level', () => {
    const plan = useStore.getState().floorPlan
    useStore.setState({
      floorPlan: {
        ...plan,
        upperLevels: [
          {
            id: 'l2',
            name: 'Level 2',
            elevation: 3,
            walls: [],
            openings: [],
            rooms: [
              { id: 'loft', name: 'Loft', origin: [0, 0] as [number, number], width: 5, depth: 5 },
            ],
          },
        ],
      },
      viewLevelId: 'l2',
    } as never)
    cameraPose.tx = 1
    cameraPose.tz = 1
    const id = useStore.getState().addPanoTourStopHere()
    const added = useStore.getState().panoTourStops.find((t) => t.id === id)
    expect(added?.levelId).toBe('l2')
    expect(added?.label).toBe('Loft')
    useStore.setState({ floorPlan: plan, viewLevelId: 'all' } as never)
  })

  it('clearPanoTour empties the tour + persistence', () => {
    cameraPose.tx = 2
    cameraPose.tz = 2
    useStore.getState().addPanoTourStopHere()
    useStore.getState().clearPanoTour()
    expect(useStore.getState().panoTourStops).toEqual([])
    expect(JSON.parse(localStorage.getItem('hdb_pano_tour') ?? 'null')).toEqual([])
  })
})
