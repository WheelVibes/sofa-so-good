import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('timeSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('starts in system mode with manualHour=12', () => {
    const s = useStore.getState()
    expect(s.timeMode).toBe('system')
    expect(s.manualHour).toBe(12)
  })

  it('setTimeMode flips between system and manual', () => {
    useStore.getState().setTimeMode('manual')
    expect(useStore.getState().timeMode).toBe('manual')
    useStore.getState().setTimeMode('system')
    expect(useStore.getState().timeMode).toBe('system')
  })

  it('setManualHour switches to manual mode and stores the hour', () => {
    useStore.getState().setManualHour(15.5)
    expect(useStore.getState().timeMode).toBe('manual')
    expect(useStore.getState().manualHour).toBe(15.5)
  })

  it('setManualHour wraps out-of-range values into [0, 24)', () => {
    useStore.getState().setManualHour(25)
    expect(useStore.getState().manualHour).toBe(1)
    useStore.getState().setManualHour(36)
    expect(useStore.getState().manualHour).toBe(12)
    useStore.getState().setManualHour(-1)
    expect(useStore.getState().manualHour).toBe(23)
    useStore.getState().setManualHour(48)
    expect(useStore.getState().manualHour).toBe(0)
  })

  it('setPresetTime sets manual mode + matching hour', () => {
    const cases: Array<[string, number]> = [
      ['morning', 6],
      ['noon', 12],
      ['dusk', 18],
      ['night', 0],
    ]
    for (const [preset, hour] of cases) {
      useStore.getState().setTimeMode('system')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useStore.getState().setPresetTime(preset as any)
      expect(useStore.getState().timeMode).toBe('manual')
      expect(useStore.getState().manualHour).toBe(hour)
    }
  })

  it('cyclePresetTime advances System → Morning → Noon → Dusk → Night → System', () => {
    const expected = [
      { timeMode: 'manual', manualHour: 6 },
      { timeMode: 'manual', manualHour: 12 },
      { timeMode: 'manual', manualHour: 18 },
      { timeMode: 'manual', manualHour: 0 },
      { timeMode: 'system', manualHour: 0 },
    ]
    expect(useStore.getState().timeMode).toBe('system')
    for (const e of expected) {
      useStore.getState().cyclePresetTime()
      const s = useStore.getState()
      expect(s.timeMode).toBe(e.timeMode)
      expect(s.manualHour).toBe(e.manualHour)
    }
  })

  it('cyclePresetTime starting from manual at non-preset hour goes to morning', () => {
    useStore.getState().setManualHour(9.5)
    useStore.getState().cyclePresetTime()
    expect(useStore.getState().timeMode).toBe('manual')
    expect(useStore.getState().manualHour).toBe(6)
  })

  describe('day → night clip sweep (DAY-NIGHT-CLIP)', () => {
    it('defaults to off with a sensible day→night range and no active snapshot', () => {
      const s = useStore.getState()
      expect(s.clipTimeSweep).toBe(false)
      expect(s.clipSweepStartHour).toBe(8)
      expect(s.clipSweepEndHour).toBe(22)
      expect(s.timeSweepRestore).toBeNull()
    })

    it('setters toggle the flag and wrap the hour range into [0, 24)', () => {
      useStore.getState().setClipTimeSweep(true)
      expect(useStore.getState().clipTimeSweep).toBe(true)
      useStore.getState().setClipSweepStartHour(25)
      useStore.getState().setClipSweepEndHour(-1)
      expect(useStore.getState().clipSweepStartHour).toBe(1)
      expect(useStore.getState().clipSweepEndHour).toBe(23)
    })

    it('beginTimeSweep is a no-op while the toggle is off', () => {
      useStore.getState().setTimeMode('system')
      useStore.getState().beginTimeSweep()
      expect(useStore.getState().timeSweepRestore).toBeNull()
      expect(useStore.getState().timeMode).toBe('system')
    })

    it('begin snapshots the original time and pins the clock to the start hour', () => {
      // Original: manual 14:00.
      useStore.getState().setManualHour(14)
      useStore.getState().setClipTimeSweep(true)
      useStore.getState().setClipSweepStartHour(8)
      useStore.getState().setClipSweepEndHour(22)
      useStore.getState().beginTimeSweep()
      const s = useStore.getState()
      expect(s.timeSweepRestore).toEqual({ timeMode: 'manual', manualHour: 14 })
      expect(s.timeMode).toBe('manual')
      expect(s.manualHour).toBe(8) // pinned to start
    })

    it('begin does not re-snapshot over an already-active sweep', () => {
      useStore.getState().setManualHour(14)
      useStore.getState().setClipTimeSweep(true)
      useStore.getState().beginTimeSweep()
      // Advance the clock (as the tour would), then a stray second begin.
      useStore.getState().applyTimeSweepProgress(0.5)
      useStore.getState().beginTimeSweep()
      // Snapshot still holds the ORIGINAL 14:00, not the mid-sweep value.
      expect(useStore.getState().timeSweepRestore).toEqual({ timeMode: 'manual', manualHour: 14 })
    })

    it('applyTimeSweepProgress drives the clock only while a sweep is active', () => {
      useStore.getState().setTimeMode('system')
      // Not active → no-op, stays in system mode.
      useStore.getState().applyTimeSweepProgress(0.5)
      expect(useStore.getState().timeMode).toBe('system')
      // Activate, then progress drives manualHour across the range.
      useStore.getState().setClipTimeSweep(true)
      useStore.getState().setClipSweepStartHour(8)
      useStore.getState().setClipSweepEndHour(22)
      useStore.getState().beginTimeSweep()
      useStore.getState().applyTimeSweepProgress(0.5)
      expect(useStore.getState().timeMode).toBe('manual')
      expect(useStore.getState().manualHour).toBe(15)
    })

    it('endTimeSweep restores the original time and clears the snapshot', () => {
      useStore.getState().setTimeMode('system')
      useStore.getState().setClipTimeSweep(true)
      useStore.getState().beginTimeSweep()
      useStore.getState().applyTimeSweepProgress(1)
      // Now end → back to the original system mode.
      useStore.getState().endTimeSweep()
      const s = useStore.getState()
      expect(s.timeSweepRestore).toBeNull()
      expect(s.timeMode).toBe('system')
    })

    it('endTimeSweep is a no-op when idle', () => {
      useStore.getState().setManualHour(9)
      useStore.getState().endTimeSweep()
      expect(useStore.getState().manualHour).toBe(9)
      expect(useStore.getState().timeSweepRestore).toBeNull()
    })
  })
})
