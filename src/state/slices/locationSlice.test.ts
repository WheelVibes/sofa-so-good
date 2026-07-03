import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('locationSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('starts with location=null and locationPromptDismissed=false', () => {
    const s = useStore.getState()
    expect(s.location).toBeNull()
    expect(s.locationPromptDismissed).toBe(false)
  })

  it('setLocation stores lat/lon (label optional)', () => {
    useStore.getState().setLocation({ lat: 1.35, lon: 103.82 })
    expect(useStore.getState().location).toEqual({ lat: 1.35, lon: 103.82 })
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' })
    expect(useStore.getState().location).toEqual({ lat: 51.5, lon: 0, label: 'London, UK' })
  })

  it('setLocation fires exactly one success toast with the geocoded label', () => {
    useStore.getState().setLocation({ lat: 51.5, lon: 0, label: 'London, UK' })
    const list = useStore.getState().notifications
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      kind: 'success',
      title: 'Location set',
      message: 'London, UK',
    })
  })

  it('setLocation falls back to formatted coordinates when there is no label', () => {
    useStore.getState().setLocation({ lat: 1.3521, lon: 103.8198 })
    const list = useStore.getState().notifications
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'success', title: 'Location set' })
    expect(list[0].message).toBe('1.35°N, 103.82°E')
  })

  it('formatLocation handles southern/western hemispheres', () => {
    useStore.getState().setLocation({ lat: -33.87, lon: -151.21 })
    const list = useStore.getState().notifications
    expect(list[0].message).toBe('33.87°S, 151.21°W')
  })

  it('dismissLocationPrompt flips the flag', () => {
    useStore.getState().dismissLocationPrompt()
    expect(useStore.getState().locationPromptDismissed).toBe(true)
  })

  it('resetLocationPrompt clears the dismissal so the prompt can reopen', () => {
    useStore.getState().dismissLocationPrompt()
    expect(useStore.getState().locationPromptDismissed).toBe(true)
    useStore.getState().resetLocationPrompt()
    expect(useStore.getState().locationPromptDismissed).toBe(false)
  })
})
