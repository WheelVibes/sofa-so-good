import { describe, expect, it } from 'vitest'
import { isProfilerBenchmarkActive, setProfilerBenchmarkActive } from './benchmarkSignal'

describe('benchmarkSignal', () => {
  it('defaults to inactive and toggles', () => {
    expect(isProfilerBenchmarkActive()).toBe(false)
    setProfilerBenchmarkActive(true)
    expect(isProfilerBenchmarkActive()).toBe(true)
    setProfilerBenchmarkActive(false)
    expect(isProfilerBenchmarkActive()).toBe(false)
  })
})
