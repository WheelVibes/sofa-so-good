import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import { resolveQuality, type QualitySettings } from './quality';

/** Effective graphics settings = active tier preset + user overrides.
 *  Re-renders the caller only when an effective value actually changes. */
export function useQuality(): QualitySettings {
  return useStore(useShallow((s) => resolveQuality(s.qualityTier, s.qualityOverrides)));
}
