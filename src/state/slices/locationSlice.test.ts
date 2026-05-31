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
