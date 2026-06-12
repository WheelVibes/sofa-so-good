import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('featuresSlice lux overlay toggle (LP5 tail)', () => {
  beforeEach(() => useStore.setState({ luxOverlayOn: false } as never))

  it('defaults to off', () => {
    expect(useStore.getState().luxOverlayOn).toBe(false)
  })

  it('toggles on and off via the setter', () => {
    useStore.getState().setLuxOverlayOn(true)
    expect(useStore.getState().luxOverlayOn).toBe(true)
    useStore.getState().setLuxOverlayOn(false)
    expect(useStore.getState().luxOverlayOn).toBe(false)
  })
})
