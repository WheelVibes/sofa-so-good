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
    if (!IS_DEV) return // overrides are dev/QA-only; prod is locked to the registry
    persistOverride(flag, on)
    const next = { ...get().featureFlags, [flag]: on }
    setResolvedFlags(next)
    set({ featureFlags: next })
  },
  resetFeatureFlags: () => {
    if (!IS_DEV) return
    clearStoredOverrides()
    const next = resolveFlags(IS_DEV, {})
    setResolvedFlags(next)
    set({ featureFlags: next })
  },
})
