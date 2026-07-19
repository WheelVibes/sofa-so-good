import { beforeEach, describe, expect, it } from 'vitest'
import type { SampledFinish } from '../../materials/sampleFinish'
import { useStore } from '../store'

const sample: SampledFinish = { finishId: 'floor-tile-grey', surface: 'floor' }

describe('eyedropperSlice (UX-7)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('is disarmed with no held sample by default', () => {
    expect(useStore.getState().eyedropperArmed).toBe(false)
    expect(useStore.getState().sampledFinish).toBeNull()
  })

  it('toggleEyedropper arms then disarms, clearing any held sample', () => {
    useStore.getState().toggleEyedropper()
    expect(useStore.getState().eyedropperArmed).toBe(true)
    useStore.getState().setSampledFinish(sample)
    expect(useStore.getState().sampledFinish).toEqual(sample)
    // Toggling off disarms AND drops the held sample.
    useStore.getState().toggleEyedropper()
    expect(useStore.getState().eyedropperArmed).toBe(false)
    expect(useStore.getState().sampledFinish).toBeNull()
  })

  it('arming clears a stale held sample from a previous session', () => {
    useStore.getState().setSampledFinish(sample)
    useStore.getState().toggleEyedropper()
    expect(useStore.getState().eyedropperArmed).toBe(true)
    expect(useStore.getState().sampledFinish).toBeNull()
  })

  it('setSampledFinish holds then clears a sample without changing armed', () => {
    useStore.getState().toggleEyedropper()
    useStore.getState().setSampledFinish(sample)
    expect(useStore.getState().sampledFinish).toEqual(sample)
    expect(useStore.getState().eyedropperArmed).toBe(true)
    // Clearing (the header × chip) drops back to sampling mode, still armed.
    useStore.getState().setSampledFinish(null)
    expect(useStore.getState().sampledFinish).toBeNull()
    expect(useStore.getState().eyedropperArmed).toBe(true)
  })

  it('disarmEyedropper forces off + clears (Escape / room-editor exit)', () => {
    useStore.getState().toggleEyedropper()
    useStore.getState().setSampledFinish(sample)
    useStore.getState().disarmEyedropper()
    expect(useStore.getState().eyedropperArmed).toBe(false)
    expect(useStore.getState().sampledFinish).toBeNull()
  })
})
