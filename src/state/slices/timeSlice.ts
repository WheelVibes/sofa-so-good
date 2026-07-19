import {
  DEFAULT_CLIP_END_HOUR,
  DEFAULT_CLIP_START_HOUR,
  sweepHourAt,
} from '../../scene/cameras/dayNightSweep'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export type TimeMode = 'system' | 'manual'

export type TimePreset = 'morning' | 'noon' | 'dusk' | 'night'

export const PRESET_HOURS: Record<TimePreset, number> = {
  morning: 6,
  noon: 12,
  dusk: 18,
  night: 0,
}

/** Cycle order for the T-key shortcut. After 'night' we wrap back to 'system'. */
const CYCLE_ORDER: ReadonlyArray<TimePreset | 'system'> = [
  'system',
  'morning',
  'noon',
  'dusk',
  'night',
]

export interface TimeSlice {
  timeMode: TimeMode
  /** Fractional hour in [0, 24). Ignored when timeMode === 'system'. */
  manualHour: number
  setTimeMode: (m: TimeMode) => void
  setManualHour: (h: number) => void
  setPresetTime: (preset: TimePreset) => void
  cyclePresetTime: () => void

  // Day → night clip sweep (DAY-NIGHT-CLIP). Config for animating the
  // time-of-day slider along the recorded saved-views walkthrough so the
  // exported video transitions through lighting conditions. Session-only —
  // NOT part of the save schema (like `recording`).
  /** When on, the walkthrough tour sweeps time-of-day from start→end hour. */
  clipTimeSweep: boolean
  /** Sweep start hour [0, 24) — the look at the clip's first frame. */
  clipSweepStartHour: number
  /** Sweep end hour [0, 24) — the look at the clip's last frame. */
  clipSweepEndHour: number
  setClipTimeSweep: (v: boolean) => void
  setClipSweepStartHour: (h: number) => void
  setClipSweepEndHour: (h: number) => void
  /** Transient snapshot of the pre-sweep time, restored when the clip ends.
   *  Non-null iff a sweep is currently driving the clock (the active flag). */
  timeSweepRestore: { timeMode: TimeMode; manualHour: number } | null
  /** Snapshot the current time + pin the clock to the sweep start (no-op when
   *  `clipTimeSweep` is off, or when a sweep is already active). */
  beginTimeSweep: () => void
  /** Drive the clock to the sweep hour for clip `progress` (0→1). No-op unless
   *  a sweep is active (`beginTimeSweep` ran). */
  applyTimeSweepProgress: (progress: number) => void
  /** Restore the pre-sweep time + clear the active snapshot (no-op if idle). */
  endTimeSweep: () => void
}

export const TIME_INITIAL: Pick<
  TimeSlice,
  | 'timeMode'
  | 'manualHour'
  | 'clipTimeSweep'
  | 'clipSweepStartHour'
  | 'clipSweepEndHour'
  | 'timeSweepRestore'
> = {
  timeMode: 'system',
  manualHour: 12,
  clipTimeSweep: false,
  clipSweepStartHour: DEFAULT_CLIP_START_HOUR,
  clipSweepEndHour: DEFAULT_CLIP_END_HOUR,
  timeSweepRestore: null,
}

/** Wrap any real number into [0, 24). Negative inputs wrap backwards
 *  (e.g. -1 → 23). Inputs ≥ 24 wrap modulo (e.g. 25 → 1, 36 → 12). */
function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24
}

/** Identify which preset (if any) the current state matches, for cycling. */
function currentPresetIndex(s: TimeSlice): number {
  if (s.timeMode === 'system') return 0
  for (let i = 1; i < CYCLE_ORDER.length; i++) {
    const preset = CYCLE_ORDER[i] as TimePreset
    if (s.manualHour === PRESET_HOURS[preset]) return i
  }
  // Manual but at a non-preset hour: treat as "before morning" so cycle
  // advances to morning next.
  return 0
}

export const createTimeSlice: SliceCreator<TimeSlice, RootState> = (set, get) => ({
  ...TIME_INITIAL,
  setTimeMode: (m) => set({ timeMode: m }),
  setManualHour: (h) => set({ timeMode: 'manual', manualHour: wrapHour(h) }),
  setPresetTime: (preset) => set({ timeMode: 'manual', manualHour: PRESET_HOURS[preset] }),
  cyclePresetTime: () => {
    const idx = currentPresetIndex(get())
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
    if (next === 'system') {
      set({ timeMode: 'system' })
    } else {
      set({ timeMode: 'manual', manualHour: PRESET_HOURS[next] })
    }
  },
  setClipTimeSweep: (v) => set({ clipTimeSweep: !!v }),
  setClipSweepStartHour: (h) => set({ clipSweepStartHour: wrapHour(h) }),
  setClipSweepEndHour: (h) => set({ clipSweepEndHour: wrapHour(h) }),
  beginTimeSweep: () => {
    const s = get()
    // Off, or already sweeping → no-op (never re-snapshot over an active sweep,
    // which would capture the swept clock as the "original" to restore to).
    if (!s.clipTimeSweep || s.timeSweepRestore) return
    set({
      timeSweepRestore: { timeMode: s.timeMode, manualHour: s.manualHour },
      // Pin the clock to the start hour immediately (progress 0).
      timeMode: 'manual',
      manualHour: wrapHour(s.clipSweepStartHour),
    })
  },
  applyTimeSweepProgress: (progress) => {
    const s = get()
    if (!s.timeSweepRestore) return // only while a sweep is active
    set({
      timeMode: 'manual',
      manualHour: sweepHourAt(progress, s.clipSweepStartHour, s.clipSweepEndHour),
    })
  },
  endTimeSweep: () => {
    const snap = get().timeSweepRestore
    if (!snap) return
    set({ timeMode: snap.timeMode, manualHour: snap.manualHour, timeSweepRestore: null })
  },
})
