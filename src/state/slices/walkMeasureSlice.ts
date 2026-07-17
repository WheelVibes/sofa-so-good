import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Walk-mode point-to-point measure (WALK-MEASURE) — session-only, mirroring
 * `windowFixtureSlice`/`screenInteractSlice`'s shape: transient state set by
 * `FirstPersonCamera`'s aim loop / the `walkMeasurePoint` request, cleared on
 * leaving walk mode. NOT persisted (no save-schema/autosave field) and NOT
 * part of undo history — "where did I drop my two measure points" is view
 * state, not design state, like `nearbyDoorId` or `isolateActive`.
 *
 * `walkMeasureA`/`walkMeasureB` are the two pinned points (world XYZ, real
 * 3D — a walk-mode aim can hit a wall or furniture top, not just the floor
 * `TapeMeasure` assumes). `walkMeasureLive` is the CURRENT aim point while `A`
 * is set and `B` isn't — the live-preview segment endpoint — written by the
 * same throttled aim-check cadence as `nearbyDoorId`/`nearbyFixtureId`.
 */
export interface WalkMeasureSlice {
  walkMeasureA: [number, number, number] | null
  walkMeasureB: [number, number, number] | null
  walkMeasureLive: [number, number, number] | null
  /** Written by `FirstPersonCamera`'s throttled aim loop while actively
   *  placing the second point; `null` the rest of the time. */
  setWalkMeasureLive: (point: [number, number, number] | null) => void
  /** One "set point" press: sets `A`, then `B`, then clears both (a third
   *  press starts fresh rather than immediately re-arming `A`). A `null`
   *  point (nothing aimed — looking at open sky through a door/window) is a
   *  no-op, so a bad aim never silently arms an empty point. */
  cycleWalkMeasurePoint: (point: [number, number, number] | null) => void
  /** Explicit reset (WalkHud "Clear" button) — always clears regardless of
   *  which stage the measurement is at. */
  clearWalkMeasure: () => void
}

export const WALK_MEASURE_INITIAL: Pick<
  WalkMeasureSlice,
  'walkMeasureA' | 'walkMeasureB' | 'walkMeasureLive'
> = {
  walkMeasureA: null,
  walkMeasureB: null,
  walkMeasureLive: null,
}

export const createWalkMeasureSlice: SliceCreator<WalkMeasureSlice, RootState> = (set, get) => ({
  ...WALK_MEASURE_INITIAL,
  setWalkMeasureLive: (point) =>
    set((s) => (s.walkMeasureLive === null && point === null ? s : { walkMeasureLive: point })),
  cycleWalkMeasurePoint: (point) => {
    if (!point) return
    const s = get()
    if (!s.walkMeasureA) {
      set({ walkMeasureA: point, walkMeasureLive: null })
      return
    }
    if (!s.walkMeasureB) {
      set({ walkMeasureB: point, walkMeasureLive: null })
      return
    }
    set({ walkMeasureA: null, walkMeasureB: null, walkMeasureLive: null })
  },
  clearWalkMeasure: () =>
    set((s) =>
      s.walkMeasureA === null && s.walkMeasureB === null && s.walkMeasureLive === null
        ? s
        : { walkMeasureA: null, walkMeasureB: null, walkMeasureLive: null },
    ),
})
