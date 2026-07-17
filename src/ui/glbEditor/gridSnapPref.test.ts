// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_SNAP,
  effectiveSnapStep,
  FREE_STEP,
  loadGridSnap,
  saveGridSnap,
} from './gridSnapPref'

describe('gridSnapPref', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to snapping on at 5 mm', () => {
    expect(loadGridSnap()).toEqual(DEFAULT_GRID_SNAP)
    expect(DEFAULT_GRID_SNAP).toEqual({ enabled: true, step: 0.005 })
  })

  it('round-trips a saved preference', () => {
    saveGridSnap({ enabled: false, step: 0.01 })
    expect(loadGridSnap()).toEqual({ enabled: false, step: 0.01 })
  })

  it('falls back to the default step for a bogus stored step', () => {
    localStorage.setItem('hdb_designer_snap_step', '0.037')
    expect(loadGridSnap().step).toBe(0.005)
  })

  it('effective step is the chosen step when on, the free step when off', () => {
    expect(effectiveSnapStep({ enabled: true, step: 0.05 })).toBe(0.05)
    expect(effectiveSnapStep({ enabled: false, step: 0.05 })).toBe(FREE_STEP)
  })
})
