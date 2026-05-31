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
})
