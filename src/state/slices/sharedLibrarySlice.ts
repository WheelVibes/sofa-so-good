import {
  fetchSharedLibraryIndex,
  registerSharedGroup,
  type SharedLibraryItem,
} from '../../catalog/packs/sharedLibrary'
import { hasBackend } from '../../features/api/client'
import { isAdminUser } from '../../features/auth/types'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface SharedLibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: SharedLibraryItem[]
  /** Per-group add state, keyed by the manifest `group`. */
  resolving: Record<string, 'adding' | 'error'>
}

export interface SharedLibrarySlice {
  sharedLibrary: SharedLibraryState
  /** Fetch the R2 manifest once. No-op unless backend + admin session + flag on. */
  bootstrapSharedLibrary(): Promise<void>
  /** Import one library group; returns its def id (`ikea-<groupKey>`) or null. */
  addSharedGroup(group: string): Promise<string | null>
}

export const SHARED_LIBRARY_INITIAL: Pick<SharedLibrarySlice, 'sharedLibrary'> = {
  sharedLibrary: { status: 'idle', items: [], resolving: {} },
}

export const createSharedLibrarySlice: SliceCreator<SharedLibrarySlice, RootState> = (
  set,
  get,
) => ({
  ...SHARED_LIBRARY_INITIAL,

  async bootstrapSharedLibrary() {
    if (get().sharedLibrary.status !== 'idle') return
    if (!hasBackend() || !isAdminUser(get().currentUser) || !isFeatureEnabled('sharedLibrary'))
      return
    set((s) => ({ sharedLibrary: { ...s.sharedLibrary, status: 'loading' } }))
    const index = await fetchSharedLibraryIndex().catch(() => null)
    set((s) => ({
      sharedLibrary: index
        ? { ...s.sharedLibrary, status: 'ready', items: index.items }
        : { ...s.sharedLibrary, status: 'error' },
    }))
  },

  async addSharedGroup(group) {
    const item = get().sharedLibrary.items.find((i) => i.group === group)
    set((s) => ({
      sharedLibrary: {
        ...s.sharedLibrary,
        resolving: { ...s.sharedLibrary.resolving, [group]: 'adding' },
      },
    }))
    const ok = await registerSharedGroup(group).catch(() => false)
    set((s) => {
      const resolving = { ...s.sharedLibrary.resolving }
      if (ok) delete resolving[group]
      else resolving[group] = 'error'
      return { sharedLibrary: { ...s.sharedLibrary, resolving } }
    })
    return ok && item ? `ikea-${item.groupKey}` : null
  },
})
