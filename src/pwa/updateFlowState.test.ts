// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getUpdateFlowState,
  installUpdateFlowDevSeam,
  setUpdateFlowState,
  useUpdateFlowState,
} from './updateFlowState'

afterEach(() => {
  setUpdateFlowState({ type: 'idle' })
  window.__updateFlow = undefined
})

describe('updateFlowState', () => {
  it('defaults to idle', () => {
    expect(getUpdateFlowState()).toEqual({ type: 'idle' })
  })

  it('set/get round-trips every stage shape', () => {
    const stages: Parameters<typeof setUpdateFlowState>[0][] = [
      { type: 'checking' },
      { type: 'upToDate' },
      { type: 'available', from: '1.0.0.0', to: '1.0.0.1' },
      { type: 'downloading', done: null, total: null },
      { type: 'ready' },
      { type: 'ready', version: '1.0.0.1' },
      { type: 'reloading' },
      { type: 'offline' },
      { type: 'error', msg: 'boom' },
    ]
    for (const s of stages) {
      setUpdateFlowState(s)
      expect(getUpdateFlowState()).toEqual(s)
    }
  })

  describe('installUpdateFlowDevSeam', () => {
    it('installs window.__updateFlow in DEV', () => {
      installUpdateFlowDevSeam()
      expect(window.__updateFlow).toBeDefined()
      window.__updateFlow?.set({ type: 'ready' })
      expect(getUpdateFlowState()).toEqual({ type: 'ready' })
      expect(window.__updateFlow?.get()).toEqual({ type: 'ready' })
    })

    it('is a no-op outside DEV', () => {
      vi.stubEnv('DEV', false)
      try {
        installUpdateFlowDevSeam()
        expect(window.__updateFlow).toBeUndefined()
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })
})

describe('useUpdateFlowState (hook wiring)', () => {
  it('re-renders the caller with the live snapshot on every change', () => {
    const { result } = renderHook(() => useUpdateFlowState())
    expect(result.current).toEqual({ type: 'idle' })
    act(() => setUpdateFlowState({ type: 'checking' }))
    expect(result.current).toEqual({ type: 'checking' })
    act(() => setUpdateFlowState({ type: 'available', from: '1.0.0.0', to: '1.0.0.1' }))
    expect(result.current).toEqual({ type: 'available', from: '1.0.0.0', to: '1.0.0.1' })
  })
})
