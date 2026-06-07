import { isAdminUser } from '../../features/auth/types'
import {
  clearStoredOverrides,
  type FeatureFlag,
  loadOverrides,
  persistOverride,
  resolveFlags,
  setResolvedFlags,
} from '../../features/featureFlags'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Reactive mirror of the resolved feature flags (see `features/featureFlags.ts`)
 * so the UI re-renders when a flag is toggled. Resolved once at boot from the
 * build env + overrides; `setFeatureFlag`/`resetFeatureFlags` only do anything
 * in a dev build (production is locked to the registry) and keep the non-React
 * `isFeatureEnabled` snapshot in sync.
 */
export interface FeatureFlagsSlice {
  featureFlags: Record<FeatureFlag, boolean>
  setFeatureFlag: (flag: FeatureFlag, on: boolean) => void
  resetFeatureFlags: () => void
  /** Recompute flags for the current privilege (dev build or signed-in admin).
   *  Called when the admin session changes + once on boot. */
  reresolveFeatureFlags: () => void
}

const IS_DEV = !!import.meta.env?.DEV

const initialFlags = resolveFlags(IS_DEV, loadOverrides())
// Seed the module snapshot so non-React `isFeatureEnabled` matches the store.
setResolvedFlags(initialFlags)

export const FEATURE_FLAGS_INITIAL: Pick<FeatureFlagsSlice, 'featureFlags'> = {
  featureFlags: initialFlags,
}

export const createFeatureFlagsSlice: SliceCreator<FeatureFlagsSlice, RootState> = (set, get) => ({
  ...FEATURE_FLAGS_INITIAL,
  setFeatureFlag: (flag, on) => {
    // Overrides are for privileged sessions only (dev build or signed-in admin);
    // a normal prod session is locked to the registry.
    if (!IS_DEV && !isAdminUser(get().currentUser)) return
    persistOverride(flag, on)
    const next = { ...get().featureFlags, [flag]: on }
    setResolvedFlags(next)
    set({ featureFlags: next })
  },
  resetFeatureFlags: () => {
    if (!IS_DEV && !isAdminUser(get().currentUser)) return
    clearStoredOverrides()
    const next = resolveFlags(IS_DEV, {}, isAdminUser(get().currentUser))
    setResolvedFlags(next)
    set({ featureFlags: next })
  },
  reresolveFeatureFlags: () => {
    const next = resolveFlags(IS_DEV, loadOverrides(), isAdminUser(get().currentUser))
    setResolvedFlags(next)
    set({ featureFlags: next })
  },
})
