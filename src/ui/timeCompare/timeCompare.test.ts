import { describe, expect, it, vi } from 'vitest'
import type { TimeMode } from '../../state/slices/timeSlice'
import { captureTimeComparePair, type TimeCompareCaptureDeps } from './timeCompare'

/** Build a deps harness with sensible defaults + spies, overridable per test. */
function makeDeps(over: Partial<TimeCompareCaptureDeps> = {}) {
  let mode: TimeMode = 'manual'
  let hour = 12
  const setTimeMode = vi.fn((m: TimeMode) => {
    mode = m
  })
  const setManualHour = vi.fn((h: number) => {
    hour = h
  })
  const deps: TimeCompareCaptureDeps = {
    getTimeMode: () => mode,
    getManualHour: () => hour,
    setPresetTime: vi.fn(),
    setTimeMode,
    setManualHour,
    capture: vi.fn(() => 'data:image/png;base64,XXX'),
    wait: vi.fn(async () => {}),
    settleMs: 0,
    ...over,
  }
  return { deps, setTimeMode, setManualHour, snapshot: () => ({ mode, hour }) }
}

describe('captureTimeComparePair', () => {
  it('captures preset A then preset B, same camera, in order', async () => {
    const order: string[] = []
    const { deps } = makeDeps({
      setPresetTime: vi.fn((p) => order.push(`set:${p}`)),
      capture: vi.fn(() => {
        order.push('capture')
        return 'png'
      }),
    })
    const pair = await captureTimeComparePair('noon', 'night', deps)
    expect(pair).toEqual({ imageA: 'png', imageB: 'png' })
    expect(order).toEqual(['set:noon', 'capture', 'set:night', 'capture'])
  })

  it('restores the prior manual hour + mode afterwards', async () => {
    const { deps, setTimeMode, setManualHour } = makeDeps({
      getTimeMode: () => 'manual',
      getManualHour: () => 15.5,
    })
    await captureTimeComparePair('noon', 'night', deps)
    // Restored AFTER both presets were applied — last calls win.
    expect(setTimeMode).toHaveBeenLastCalledWith('manual')
    expect(setManualHour).toHaveBeenLastCalledWith(15.5)
  })

  it('restores "system" mode without touching manual hour', async () => {
    const { deps, setTimeMode, setManualHour } = makeDeps({ getTimeMode: () => 'system' })
    await captureTimeComparePair('noon', 'night', deps)
    expect(setTimeMode).toHaveBeenLastCalledWith('system')
    expect(setManualHour).not.toHaveBeenCalled()
  })

  it('restores time state even if the second capture fails', async () => {
    let calls = 0
    const { deps, setTimeMode } = makeDeps({
      getTimeMode: () => 'manual',
      getManualHour: () => 9,
      capture: vi.fn(() => {
        calls += 1
        return calls === 1 ? 'a-png' : null // second (B) capture fails
      }),
    })
    await expect(captureTimeComparePair('noon', 'night', deps)).rejects.toThrow(
      /second time of day/,
    )
    expect(setTimeMode).toHaveBeenLastCalledWith('manual')
  })

  it('throws a view-closed message when the first capture is unavailable', async () => {
    const { deps } = makeDeps({ capture: vi.fn(() => null) })
    await expect(captureTimeComparePair('noon', 'night', deps)).rejects.toThrow(/Open the 3D view/)
    // Preset A was still applied once (the failure is in the capture, not the set).
    expect(deps.setPresetTime).toHaveBeenCalledTimes(1)
  })
})
