import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type TimeMode = 'system' | 'manual' | 'accelerated';

export type TimePreset = 'morning' | 'noon' | 'dusk' | 'night';

export const PRESET_HOURS: Record<TimePreset, number> = {
  morning: 6,
  noon: 12,
  dusk: 18,
  night: 0,
};

/** Cycle order for the T-key shortcut. After 'night' we wrap back to 'system'. */
const CYCLE_ORDER: ReadonlyArray<TimePreset | 'system'> = [
  'system',
  'morning',
  'noon',
  'dusk',
  'night',
];

/** Default in-world seconds per real second when entering accelerated mode.
 *  600× = a 24 h cycle plays out in ~2.4 minutes. */
export const DEFAULT_TIME_SCALE = 600;

export interface TimeSlice {
  timeMode: TimeMode;
  /** Fractional hour in [0, 24). Used in 'manual' and as the live clock in 'accelerated'. */
  manualHour: number;
  /** In-world seconds elapsed per real second when timeMode === 'accelerated'. */
  timeScale: number;
  setTimeMode: (m: TimeMode) => void;
  setManualHour: (h: number) => void;
  setPresetTime: (preset: TimePreset) => void;
  cyclePresetTime: () => void;
  setTimeScale: (s: number) => void;
  /** Advance the accelerated clock by `dtSeconds` of real time. No-op in other modes. */
  tickAccelerated: (dtSeconds: number) => void;
}

export const TIME_INITIAL: Pick<TimeSlice, 'timeMode' | 'manualHour' | 'timeScale'> = {
  timeMode: 'system',
  manualHour: 12,
  timeScale: DEFAULT_TIME_SCALE,
};

/** Wrap any real number into [0, 24). Negative inputs wrap backwards
 *  (e.g. -1 → 23). Inputs ≥ 24 wrap modulo (e.g. 25 → 1, 36 → 12). */
function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24;
}

/** Identify which preset (if any) the current state matches, for cycling. */
function currentPresetIndex(s: TimeSlice): number {
  if (s.timeMode === 'system') return 0;
  for (let i = 1; i < CYCLE_ORDER.length; i++) {
    const preset = CYCLE_ORDER[i] as TimePreset;
    if (s.manualHour === PRESET_HOURS[preset]) return i;
  }
  return 0;
}

export const createTimeSlice: SliceCreator<TimeSlice, RootState> = (set, get) => ({
  ...TIME_INITIAL,
  setTimeMode: (m) => set({ timeMode: m }),
  setManualHour: (h) => set({ timeMode: 'manual', manualHour: wrapHour(h) }),
  setPresetTime: (preset) =>
    set({ timeMode: 'manual', manualHour: PRESET_HOURS[preset] }),
  cyclePresetTime: () => {
    const idx = currentPresetIndex(get());
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    if (next === 'system') {
      set({ timeMode: 'system' });
    } else {
      set({ timeMode: 'manual', manualHour: PRESET_HOURS[next] });
    }
  },
  setTimeScale: (s) => set({ timeScale: Math.max(1, s) }),
  tickAccelerated: (dtSeconds) => {
    const s = get();
    if (s.timeMode !== 'accelerated') return;
    const dh = (dtSeconds * s.timeScale) / 3600;
    set({ manualHour: wrapHour(s.manualHour + dh) });
  },
});
