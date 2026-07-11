import type { MaterialId } from '../../materials/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A user-saved finish "style": the per-room floor/wall finishes (+ accents)
 *  captured from the current design, re-appliable later. Persisted to
 *  localStorage so it survives reloads (kept out of the autosave/schema). */
interface UserStyle {
  id: string
  name: string
  floor: Record<string, MaterialId>
  walls: Record<string, MaterialId>
  wallAccents: Record<string, MaterialId>
}

export interface UserStylesSlice {
  userStyles: UserStyle[]
  /** Capture the current finishes as a named style. Returns the new id. */
  saveCurrentStyle: (name: string) => string
  /** Re-apply a saved style's finishes (undoable). */
  applyUserStyle: (id: string) => void
  deleteUserStyle: (id: string) => void
}

const LS_KEY = 'hdb_user_styles'

function loadStyles(): UserStyle[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as UserStyle[]) : []
  } catch {
    return []
  }
}

function persistStyles(styles: UserStyle[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(styles))
  } catch {
    // ignore (private mode / unavailable storage)
  }
}

let idCounter = 0
const styleId = () => `style-${Date.now().toString(36)}-${idCounter++}`

export const USER_STYLES_INITIAL: Pick<UserStylesSlice, 'userStyles'> = {
  userStyles: loadStyles(),
}

export const createUserStylesSlice: SliceCreator<UserStylesSlice, RootState> = (set, get) => ({
  ...USER_STYLES_INITIAL,
  saveCurrentStyle: (name) => {
    const f = get().finishes
    const style: UserStyle = {
      id: styleId(),
      name: name.trim() || `My style ${get().userStyles.length + 1}`,
      floor: { ...f.floor },
      walls: { ...f.walls },
      wallAccents: { ...f.wallAccents },
    }
    const next = [...get().userStyles, style]
    persistStyles(next)
    set({ userStyles: next })
    return style.id
  },
  applyUserStyle: (id) => {
    const style = get().userStyles.find((s) => s.id === id)
    if (!style) return
    get().pushHistory()
    set((s) => ({
      finishes: {
        ...s.finishes,
        floor: { ...s.finishes.floor, ...style.floor },
        walls: { ...s.finishes.walls, ...style.walls },
        wallAccents: { ...style.wallAccents },
      },
    }))
  },
  deleteUserStyle: (id) => {
    const next = get().userStyles.filter((s) => s.id !== id)
    persistStyles(next)
    set({ userStyles: next })
  },
})
