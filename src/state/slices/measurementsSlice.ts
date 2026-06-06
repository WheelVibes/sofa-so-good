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
   *  a further click starts a fresh one. For `rect` they are opposite corners. */
  tapePoints: Array<[number, number]>
  /** Tape shape: `line` (point-to-point distance) or `rect` (area of the
   *  rectangle between two opposite corners). */
  tapeShape: 'line' | 'rect'
  toggleTapeMode: () => void
  addTapePoint: (p: [number, number]) => void
  clearTape: () => void
  /** Switch line/area; clears the in-progress points to avoid mixed readings. */
  setTapeShape: (shape: 'line' | 'rect') => void
}

export const MEASUREMENTS_INITIAL: Pick<
  MeasurementsSlice,
  'showMeasurements' | 'tapeMode' | 'tapePoints' | 'tapeShape' | 'units'
> = {
  showMeasurements: false,
  tapeMode: false,
  tapePoints: [],
  tapeShape: 'line',
  units: 'metric',
}

export const createMeasurementsSlice: SliceCreator<MeasurementsSlice, RootState> = (set) => ({
  ...MEASUREMENTS_INITIAL,
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  setUnits: (units) => set({ units }),
  toggleTapeMode: () =>
    set((s) => ({ tapeMode: !s.tapeMode, tapePoints: s.tapeMode ? [] : s.tapePoints })),
  setTapeShape: (tapeShape) => set({ tapeShape, tapePoints: [] }),
  addTapePoint: (p) =>
    set((s) => ({
      // A click after a finished measurement starts a new one from this point.
      tapePoints: s.tapePoints.length >= 2 ? [p] : [...s.tapePoints, p],
    })),
  clearTape: () => set({ tapePoints: [] }),
})
