import { parseComponentFragment } from '../../furniture/glbEdit/componentFragment'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * User-saved **components** (Asset Studio Stage 9b). The GLB designer's "Save as
 * component" action captures a `PartGroup`'s parts as a small
 * {@link import('../../furniture/glbEdit/componentFragment').ComponentFragment}
 * (serialized to the shared `'component'` spec envelope); those components appear
 * in the designer's Components panel under "My components" and re-insert as a
 * fresh group on click-to-place.
 *
 * Persisted to localStorage (`hdb_user_components`) — the per-device authored-
 * library pattern shared with `userProductsSlice`/`userSetsSlice`/`clipboardSlice`:
 * load once at module init, write on every mutation, kept OUT of the design save
 * schema + autosave watch-list (a component is an authoring artifact, not part of
 * a saved room design). srcRef parts carry NO geometry, so a component fragment is
 * tiny; a baked-mesh member is blocked at save time by the 256 KB fragment cap
 * (`componentFragmentFits`), so a quota-blowing record never reaches this slice.
 *
 * Persistence is FAIL-LOUD (mirroring `userProductsSlice`): `addUserComponent`
 * reports success/failure so the authoring UI can toast an error rather than
 * falsely claim the component was saved.
 */
export interface UserComponent {
  id: string
  name: string
  /** The component fragment serialized to the `'component'` spec envelope. */
  fragment: string
  /** Save timestamp (ms) — newest-first ordering in the panel. */
  createdAt: number
}

export interface UserComponentsSlice {
  userComponents: UserComponent[]
  /** Save (or replace by id) a user component. Returns `false` when the
   *  localStorage write failed (quota/private mode) so the caller can fail loud. */
  addUserComponent: (component: UserComponent) => boolean
  removeUserComponent: (id: string) => void
  setUserComponents: (components: UserComponent[]) => void
}

const LS_KEY = 'hdb_user_components'

/** Structural guard — id/name/createdAt present and the fragment string parses to
 *  a valid `'component'` envelope (a corrupt record is dropped on load). */
function isUserComponent(v: unknown): v is UserComponent {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.fragment === 'string' &&
    typeof c.createdAt === 'number' &&
    parseComponentFragment(c.fragment) !== null
  )
}

function loadComponents(): UserComponent[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter(isUserComponent) : []
  } catch {
    return []
  }
}

/** Write the component list to localStorage. Returns `false` on a failed write
 *  (quota/private mode) so the caller can fail loud. A no-localStorage environment
 *  (SSR/tests) reports success (nothing to lose). */
function persistComponents(components: UserComponent[]): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    if (components.length > 0) localStorage.setItem(LS_KEY, JSON.stringify(components))
    else localStorage.removeItem(LS_KEY)
    return true
  } catch {
    return false
  }
}

export const USER_COMPONENTS_INITIAL: Pick<UserComponentsSlice, 'userComponents'> = {
  userComponents: loadComponents(),
}

export const createUserComponentsSlice: SliceCreator<UserComponentsSlice, RootState> = (
  set,
  get,
) => ({
  ...USER_COMPONENTS_INITIAL,
  addUserComponent: (component) => {
    if (!isUserComponent(component)) return false
    // Newest first; replace by id so a re-save of the same component id updates.
    const next = [component, ...get().userComponents.filter((c) => c.id !== component.id)]
    const ok = persistComponents(next)
    // Only commit to state when the write succeeded, so the in-memory registry
    // never claims a component the reload won't have (fail-loud).
    if (ok) set({ userComponents: next })
    return ok
  },
  removeUserComponent: (id) => {
    const next = get().userComponents.filter((c) => c.id !== id)
    persistComponents(next)
    set({ userComponents: next })
  },
  setUserComponents: (components) => {
    const next = components.filter(isUserComponent)
    persistComponents(next)
    set({ userComponents: next })
  },
})
