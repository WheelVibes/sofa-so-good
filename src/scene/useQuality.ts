import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../state/store'
import { type QualitySettings, resolveQuality } from './quality'

/** Effective graphics settings = active tier preset + user overrides.
 *  Re-renders the caller only when an effective value actually changes. */
export function useQuality(): QualitySettings {
  return useStore(
    useShallow((s) => {
      const q = resolveQuality(s.qualityTier, s.qualityOverrides)
      // Adaptive last-resort: shed the sun-shadow pass when the guard has
      // bottomed out at Low and still can't hold 30fps.
      return s.autoShadowsOff ? { ...q, shadowMapSize: 0 } : q
    }),
  )
}
