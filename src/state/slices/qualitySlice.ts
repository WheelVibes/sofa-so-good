import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface QualitySettings {
  shadows: 'off' | 'low' | 'high';
  globalIllumination: 'off' | 'ibl' | 'ibl+ssao';
  interRoomBleed: boolean;
  fixtures: boolean;
}

export type QualityPreset = 'low' | 'medium' | 'high';

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low:    { shadows: 'off',  globalIllumination: 'off',      interRoomBleed: true, fixtures: true },
  medium: { shadows: 'low',  globalIllumination: 'ibl',      interRoomBleed: true, fixtures: true },
  high:   { shadows: 'high', globalIllumination: 'ibl+ssao', interRoomBleed: true, fixtures: true },
};

export function pickDefaultQuality(): QualitySettings {
  try {
    const nav = globalThis.navigator as Navigator & { deviceMemory?: number };
    const cores = nav?.hardwareConcurrency;
    const mem = nav?.deviceMemory;
    if (typeof cores !== 'number' || typeof mem !== 'number') {
      return QUALITY_PRESETS.medium;
    }
    if (cores < 4 || mem < 4) return QUALITY_PRESETS.low;
    if (cores >= 8 && mem >= 8) return QUALITY_PRESETS.high;
    return QUALITY_PRESETS.medium;
  } catch {
    return QUALITY_PRESETS.medium;
  }
}

export interface QualitySlice {
  quality: QualitySettings;
  setQuality: (patch: Partial<QualitySettings>) => void;
}

export const QUALITY_INITIAL: Pick<QualitySlice, 'quality'> = {
  quality: pickDefaultQuality(),
};

export const createQualitySlice: SliceCreator<QualitySlice, RootState> = (set) => ({
  ...QUALITY_INITIAL,
  setQuality: (patch) => set((s) => ({ quality: { ...s.quality, ...patch } })),
});
