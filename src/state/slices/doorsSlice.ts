import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface DoorState {
  open: boolean
  /** `'none'` = the door leaf is ABSENT (bare BTO / resale strip-out handover —
   *  the opening + frame exist, but no leaf is fitted). Absent field = a normal
   *  leaf is present. Read by both the fixed-flat `DoorLeaf` and the custom-plan
   *  `PlanDoorLeaf` (BSJ-4). Rides the existing `doors` persistence/history —
   *  no new persisted field. */
  leaf?: 'none'
}

export interface DoorsSlice {
  doors: Record<string, DoorState>
  nearbyDoorId: string | null
  toggleDoor: (id: string) => void
  setDoorOpen: (id: string, open: boolean) => void
  setNearbyDoor: (id: string | null) => void
}

export const DOORS_INITIAL: Pick<DoorsSlice, 'doors' | 'nearbyDoorId'> = {
  doors: {},
  nearbyDoorId: null,
}

export const createDoorsSlice: SliceCreator<DoorsSlice, RootState> = (set, get) => ({
  ...DOORS_INITIAL,
  toggleDoor: (id) => {
    get().pushHistory()
    set((s) => ({
      doors: { ...s.doors, [id]: { open: !(s.doors[id]?.open ?? false) } },
    }))
  },
  setDoorOpen: (id, open) => {
    get().pushHistory()
    set((s) => ({ doors: { ...s.doors, [id]: { open } } }))
  },
  setNearbyDoor: (id) => set((s) => (s.nearbyDoorId === id ? s : { nearbyDoorId: id })),
})
