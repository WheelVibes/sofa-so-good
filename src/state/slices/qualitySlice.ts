import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type FixtureMode = 'auto' | 'on' | 'off';
export type Weather = 'clear' | 'hazy' | 'overcast';

export interface QualitySettings {
  shadows: 'off' | 'low' | 'high';
  globalIllumination: 'off' | 'ibl' | 'ibl+ssao';
  /** 'auto' ramps fixtures on as the sun drops below the horizon. */
  fixtures: FixtureMode;
  /** User-facing multiplier on top of the altitude-driven exposure. */
  exposureBias: number;
  /** Atmosphere thickness preset; multiplies sky turbidity. Singapore default = 'hazy'. */
  weather: Weather;
  /** Render the procedural outdoor skyline + ground plane outside the apartment shell. */
  outdoor: boolean;
}

export type QualityPreset = 'low' | 'medium' | 'high';

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low:    { shadows: 'off',  globalIllumination: 'ibl',      fixtures: 'auto', exposureBias: 1.0, weather: 'hazy', outdoor: true },
  medium: { shadows: 'low',  globalIllumination: 'ibl',      fixtures: 'auto', exposureBias: 1.0, weather: 'hazy', outdoor: true },
  high:   { shadows: 'high', globalIllumination: 'ibl+ssao', fixtures: 'auto', exposureBias: 1.0, weather: 'hazy', outdoor: true },
};

export const EXPOSURE_BIAS_MIN = 0.5;
export const EXPOSURE_BIAS_MAX = 1.5;

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
