import type { UnitSystem } from '../../utils/measurement'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface MeasurementsSlice {
  /** Room-size labels overlay (toggled with M). */
  showMeasurements: boolean
  toggleMeasurements: () => void
  /** Display unit system for all measurement read-outs (metric is canonical /
   *  the editing unit; imperial is a display preference). Persisted per-device. */
  units: UnitSystem
  setUnits: (u: UnitSystem) => void
  /** Point-to-point tape measure mode: when on, clicking the floor drops the
   *  two endpoints of a live measurement. */
  tapeMode: boolean
  /** 0, 1 or 2 floor points (XZ metres). Two points = a complete measurement;
   *  a further click starts a fresh one. */
  tapePoints: Array<[number, number]>
  toggleTapeMode: () => void
  addTapePoint: (p: [number, number]) => void
  clearTape: () => void
}

export const MEASUREMENTS_INITIAL: Pick<
  MeasurementsSlice,
  'showMeasurements' | 'tapeMode' | 'tapePoints' | 'units'
> = {
  showMeasurements: false,
  tapeMode: false,
  tapePoints: [],
  units: 'metric',
}

export const createMeasurementsSlice: SliceCreator<MeasurementsSlice, RootState> = (set) => ({
  ...MEASUREMENTS_INITIAL,
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  setUnits: (units) => set({ units }),
  toggleTapeMode: () =>
    set((s) => ({ tapeMode: !s.tapeMode, tapePoints: s.tapeMode ? [] : s.tapePoints })),
  addTapePoint: (p) =>
    set((s) => ({
      // A click after a finished measurement starts a new one from this point.
      tapePoints: s.tapePoints.length >= 2 ? [p] : [...s.tapePoints, p],
    })),
  clearTape: () => set({ tapePoints: [] }),
})
