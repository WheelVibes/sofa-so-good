import type { UnitSystem } from '../../utils/measurement'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A pinned dimension callout that persists in the scene and saves with the
 *  design (unlike the transient tape). `line` shows a distance, `rect` an area
 *  between two opposite corners — mirroring the tape shapes. */
export interface MeasurementAnnotation {
  id: string
  a: [number, number]
  b: [number, number]
  shape: 'line' | 'rect'
}

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
  /** Pinned dimension callouts — persist in the scene and save with the design. */
  annotations: MeasurementAnnotation[]
  /** Pin a callout (e.g. from the current finished tape measurement). */
  addAnnotation: (a: [number, number], b: [number, number], shape: 'line' | 'rect') => void
  removeAnnotation: (id: string) => void
  clearAnnotations: () => void
}

export const MEASUREMENTS_INITIAL: Pick<
  MeasurementsSlice,
  'showMeasurements' | 'tapeMode' | 'tapePoints' | 'tapeShape' | 'units' | 'annotations'
> = {
  showMeasurements: false,
  tapeMode: false,
  tapePoints: [],
  tapeShape: 'line',
  units: 'metric',
  annotations: [],
}

const annotationId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

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
  addAnnotation: (a, b, shape) =>
    set((s) => ({
      annotations: [
        ...s.annotations,
        { id: annotationId(), a: [a[0], a[1]], b: [b[0], b[1]], shape },
      ],
    })),
  removeAnnotation: (id) => set((s) => ({ annotations: s.annotations.filter((x) => x.id !== id) })),
  clearAnnotations: () => set((s) => (s.annotations.length === 0 ? {} : { annotations: [] })),
})
