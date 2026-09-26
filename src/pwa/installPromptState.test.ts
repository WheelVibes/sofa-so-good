// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getInstallPromptState,
  installInstallPromptDevSeam,
  setInstallPromptState,
  useInstallPromptState,
} from './installPromptState'

afterEach(() => {
  setInstallPromptState({ type: 'unavailable' })
  window.__installPrompt = undefined
})

describe('installPromptState', () => {
  it('defaults to unavailable', () => {
    expect(getInstallPromptState()).toEqual({ type: 'unavailable' })
  })

  it('set/get round-trips every stage shape', () => {
    const stages: Parameters<typeof setInstallPromptState>[0][] = [
      { type: 'unavailable' },
      { type: 'available' },
      { type: 'prompting' },
      { type: 'accepted' },
      { type: 'dismissed' },
      { type: 'installed' },
    ]
    for (const s of stages) {
      setInstallPromptState(s)
      expect(getInstallPromptState()).toEqual(s)
    }
  })

  describe('installInstallPromptDevSeam', () => {
    it('installs window.__installPrompt in DEV', () => {
      installInstallPromptDevSeam()
      expect(window.__installPrompt).toBeDefined()
      window.__installPrompt?.set({ type: 'available' })
      expect(getInstallPromptState()).toEqual({ type: 'available' })
      expect(window.__installPrompt?.get()).toEqual({ type: 'available' })
    })

    it('is a no-op outside DEV', () => {
      vi.stubEnv('DEV', false)
      try {
        installInstallPromptDevSeam()
        expect(window.__installPrompt).toBeUndefined()
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it('simulateBeforeInstallPrompt dispatches a real event the app listener can capture', async () => {
      installInstallPromptDevSeam()
      let captured: Event | undefined
      window.addEventListener('beforeinstallprompt', (e) => {
        captured = e
      })
      window.__installPrompt?.simulateBeforeInstallPrompt('accepted')
      expect(captured).toBeDefined()
      const withPrompt = captured as Event & {
        prompt?: () => Promise<void>
        userChoice?: Promise<{ outcome: string }>
      }
      expect(typeof withPrompt.prompt).toBe('function')
      await expect(withPrompt.userChoice).resolves.toEqual({ outcome: 'accepted', platform: 'web' })
    })
  })
})

describe('useInstallPromptState (hook wiring)', () => {
  it('re-renders the caller with the live snapshot on every change', () => {
    const { result } = renderHook(() => useInstallPromptState())
    expect(result.current).toEqual({ type: 'unavailable' })
    act(() => setInstallPromptState({ type: 'available' }))
    expect(result.current).toEqual({ type: 'available' })
    act(() => setInstallPromptState({ type: 'installed' }))
    expect(result.current).toEqual({ type: 'installed' })
  })
})
