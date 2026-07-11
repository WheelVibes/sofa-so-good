import type { SetItem } from '../../furniture/furnitureSets'
import type { ParamProps } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A user-authored furniture "set": the current selection captured as
 *  centroid-relative offsets so it can be dropped again like a built-in set.
 *  Persisted to localStorage (kept out of the autosave/schema). */
interface UserSet {
  id: string
  name: string
  items: SetItem[]
}

export interface UserSetsSlice {
  userSets: UserSet[]
  /** Capture the current selection as a named set. Returns the new id, or null
   *  when nothing is selected. */
  saveSelectionAsSet: (name: string) => string | null
  deleteUserSet: (id: string) => void
}

const LS_KEY = 'hdb_user_sets'

function loadSets(): UserSet[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as UserSet[]) : []
  } catch {
    return []
  }
}

function persistSets(sets: UserSet[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(sets))
  } catch {
    // ignore (private mode / unavailable storage)
  }
}

let idCounter = 0
const setId = () => `uset-${Date.now().toString(36)}-${idCounter++}`

/** Build the centroid-relative set items from a list of placed items. Pure. */
export function captureSetItems(
  items: { defId: string; position: [number, number]; rotation: number; props: ParamProps }[],
): SetItem[] {
  if (items.length === 0) return []
  const cx = items.reduce((a, it) => a + it.position[0], 0) / items.length
  const cz = items.reduce((a, it) => a + it.position[1], 0) / items.length
  return items.map((it) => ({
    defId: it.defId,
    dx: it.position[0] - cx,
    dz: it.position[1] - cz,
    rotation: it.rotation,
    props: { ...it.props },
  }))
}

export const USER_SETS_INITIAL: Pick<UserSetsSlice, 'userSets'> = {
  userSets: loadSets(),
}

export const createUserSetsSlice: SliceCreator<UserSetsSlice, RootState> = (set, get) => ({
  ...USER_SETS_INITIAL,
  saveSelectionAsSet: (name) => {
    const s = get()
    const selected = s.items.filter((it) => s.selectedItemIds.includes(it.id))
    if (selected.length === 0) return null
    const entry: UserSet = {
      id: setId(),
      name: name.trim() || `My set ${s.userSets.length + 1}`,
      items: captureSetItems(selected),
    }
    const next = [...s.userSets, entry]
    persistSets(next)
    set({ userSets: next })
    return entry.id
  },
  deleteUserSet: (id) => {
    const next = get().userSets.filter((u) => u.id !== id)
    persistSets(next)
    set({ userSets: next })
  },
})
