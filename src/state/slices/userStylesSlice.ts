import type { RoomId } from '../../apartment/types'
import type { MaterialId } from '../../materials/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A user-captured finish style: the full per-room floor/wall finishes (plus
 *  accent-wall overrides) snapshotted from the current design, re-appliable
 *  later. Persisted to localStorage; not part of the autosave/schema. */
export interface UserStyle {
  id: string
  name: string
  floor: Record<RoomId, MaterialId>
  walls: Record<RoomId, MaterialId>
  wallAccents: Record<string, MaterialId>
}

export interface UserStylesSlice {
  userStyles: UserStyle[]
  /** Capture the current per-room finishes as a new named style. */
  saveUserStyle: (name: string) => void
  /** Re-apply a saved style's finishes (undoable). No-op for an unknown id. */
  applyUserStyle: (id: string) => void
  deleteUserStyle: (id: string) => void
  /** Replace the whole list (used by the localStorage hydrator on boot). */
  setUserStyles: (styles: UserStyle[]) => void
}

export const USER_STYLES_INITIAL: Pick<UserStylesSlice, 'userStyles'> = {
  userStyles: [],
}

let styleCounter = 0
function newStyleId(): string {
  styleCounter += 1
  return `style_${Date.now().toString(36)}_${styleCounter}`
}

export const createUserStylesSlice: SliceCreator<UserStylesSlice, RootState> = (set, get) => ({
  ...USER_STYLES_INITIAL,
  saveUserStyle: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { finishes } = get()
    const style: UserStyle = {
      id: newStyleId(),
      name: trimmed,
      floor: { ...finishes.floor },
      walls: { ...finishes.walls },
      wallAccents: { ...finishes.wallAccents },
    }
    set((s) => ({ userStyles: [...s.userStyles, style] }))
  },
  applyUserStyle: (id) => {
    const style = get().userStyles.find((u) => u.id === id)
    if (!style) return
    get().pushHistory()
    set({
      finishes: {
        floor: { ...style.floor },
        walls: { ...style.walls },
        wallAccents: { ...style.wallAccents },
      },
    })
  },
  deleteUserStyle: (id) => set((s) => ({ userStyles: s.userStyles.filter((u) => u.id !== id) })),
  setUserStyles: (styles) => set({ userStyles: styles }),
})
