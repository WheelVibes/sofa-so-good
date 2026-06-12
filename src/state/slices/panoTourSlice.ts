import { levelById } from '../../floorplan/levels'
import { cameraPose, cameraPosXZ } from '../../scene/cameras/cameraForward'
import { defaultStopLabel, MAX_TOUR_STOPS, type PanoTourStop } from '../../ui/panorama/panoTour'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Linked 360° tour (P-720): an ordered list of panorama stops captured at
 * different positions/rooms, viewed in `PanoTourModal` with derived
 * room-to-room hotspots (`ui/panorama/panoTour.ts`).
 *
 * Only the stop **metadata** is stored (positions + labels) — the equirect
 * images are captured live from the current design when the tour is viewed
 * (the same "always reflects the design" model as the presentation 360°
 * slides), so a stop never shows a stale render. Stops persist to
 * localStorage per-device, exactly like saved camera views — deliberately
 * out of the save schema / share links (which never carried panoramas).
 */
export interface PanoTourSlice {
  panoTourStops: PanoTourStop[]
  /** Tour viewer modal visibility. */
  panoTourOpen: boolean
  /** The stop currently shown in the viewer (null = first stop). */
  panoTourActiveId: string | null
  /**
   * Add a stop at the current viewpoint — the walk camera's position in walk
   * mode, else the orbit pivot ("stand where you're looking", matching the
   * panorama capture eye). The label defaults to the room at that position.
   * Returns the new stop id, or null when the tour is full.
   */
  addPanoTourStopHere: () => string | null
  removePanoTourStop: (id: string) => void
  clearPanoTour: () => void
  setPanoTourOpen: (open: boolean) => void
  setPanoTourActive: (id: string) => void
  /**
   * Update mutable fields on an existing stop (used by the plan-view drag
   * to reposition a stop; the caller is responsible for evicting the IDB
   * cache entry so the next view re-captures from the new location).
   */
  updatePanoTourStop: (id: string, patch: Partial<Pick<PanoTourStop, 'position' | 'label'>>) => void
}

const LS_KEY = 'hdb_pano_tour'

function loadStops(): PanoTourStop[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is PanoTourStop =>
        s &&
        typeof s.id === 'string' &&
        typeof s.label === 'string' &&
        Array.isArray(s.position) &&
        s.position.length === 2 &&
        s.position.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
    )
  } catch {
    return []
  }
}

function persistStops(stops: PanoTourStop[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(stops))
  } catch {
    // private mode / quota — non-critical, ignore.
  }
}

let idCounter = 0
const stopId = () => `pstop-${Date.now().toString(36)}-${idCounter++}`

export const PANO_TOUR_INITIAL: Pick<
  PanoTourSlice,
  'panoTourStops' | 'panoTourOpen' | 'panoTourActiveId'
> = {
  panoTourStops: loadStops(),
  panoTourOpen: false,
  panoTourActiveId: null,
}

export const createPanoTourSlice: SliceCreator<PanoTourSlice, RootState> = (set, get) => ({
  ...PANO_TOUR_INITIAL,
  addPanoTourStopHere: () => {
    const st = get()
    if (st.panoTourStops.length >= MAX_TOUR_STOPS) return null
    const walk = st.cameraMode !== 'orbit'
    const x = Math.round((walk ? cameraPosXZ.x : cameraPose.tx) * 100) / 100
    const z = Math.round((walk ? cameraPosXZ.z : cameraPose.tz) * 100) / 100
    // Stops are storey-tagged so hotspots never point through a floor slab.
    const levelId =
      st.viewLevelId !== 'all' && st.floorPlan.upperLevels?.some((l) => l.id === st.viewLevelId)
        ? st.viewLevelId
        : undefined
    const rooms = levelById(st.floorPlan, levelId).rooms
    const label = defaultStopLabel(
      rooms,
      st.panoTourStops.map((s) => s.label),
      x,
      z,
    )
    const stop: PanoTourStop = {
      id: stopId(),
      label,
      position: [x, z],
      ...(levelId ? { levelId } : {}),
    }
    const next = [...st.panoTourStops, stop]
    persistStops(next)
    set({ panoTourStops: next, panoTourActiveId: stop.id })
    return stop.id
  },
  removePanoTourStop: (id) => {
    const next = get().panoTourStops.filter((s) => s.id !== id)
    persistStops(next)
    set((s) => ({
      panoTourStops: next,
      // Keep the viewer on a valid stop when the active one is deleted.
      panoTourActiveId: s.panoTourActiveId === id ? (next[0]?.id ?? null) : s.panoTourActiveId,
    }))
  },
  clearPanoTour: () => {
    persistStops([])
    set({ panoTourStops: [], panoTourActiveId: null })
  },
  setPanoTourOpen: (panoTourOpen) => set({ panoTourOpen }),
  setPanoTourActive: (id) =>
    set((s) => (s.panoTourStops.some((x) => x.id === id) ? { panoTourActiveId: id } : {})),
  updatePanoTourStop: (id, patch) => {
    const next = get().panoTourStops.map((s) => (s.id === id ? { ...s, ...patch } : s))
    persistStops(next)
    set({ panoTourStops: next })
  },
})
