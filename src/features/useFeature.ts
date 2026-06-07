import { useStore } from '../state/store'
import type { FeatureFlag } from './featureFlags'

/**
 * Reactive feature-flag read for React components — re-renders when the flag is
 * toggled (dev flags panel). Non-React code should use `isFeatureEnabled`.
 *
 *   if (!useFeature('report')) return null
 */
export function useFeature(flag: FeatureFlag): boolean {
  return useStore((s) => s.featureFlags[flag])
}
