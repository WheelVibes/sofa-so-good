/**
 * Tests for the `usePlanBackdrop` hook extracted from FloorPlanEditor (v0.9.0.46).
 * Mocks the IDB persistence + browser image/URL APIs so the load / rehydrate /
 * calibration-persist / remove lifecycle is verifiable headlessly.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persist = vi.hoisted(() => ({
  persistBackdrop: vi.fn(),
  readPersistedBackdrop: vi.fn(),
  removePersistedBackdrop: vi.fn(),
  updateBackdropMeta: vi.fn(),
}))
vi.mock('../backdropPersist', () => persist)

import { usePlanBackdrop } from './usePlanBackdrop'

// A synchronous fake <img> whose `src` setter fires onload immediately, so
// loadBackdrop's decode callback runs in the test.
class FakeImage {
  onload: (() => void) | null = null
  naturalWidth = 800
  naturalHeight = 600
  set src(_v: string) {
    this.onload?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
  for (const f of Object.values(persist)) f.mockReset()
  persist.readPersistedBackdrop.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const imageFile = () => new File(['x'], 'plan.png', { type: 'image/png' })

describe('usePlanBackdrop', () => {
  it('starts with no backdrop', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn()))
    expect(result.current.backdrop).toBeNull()
  })

  it('loadBackdrop sets the backdrop, persists the blob, and switches to select', () => {
    const setTool = vi.fn()
    const { result } = renderHook(() => usePlanBackdrop(true, setTool))
    act(() => result.current.loadBackdrop(imageFile()))
    expect(result.current.backdrop).toMatchObject({
      url: 'blob:fake',
      w: 800,
      h: 600,
      opacity: 0.5,
    })
    expect(persist.persistBackdrop).toHaveBeenCalledTimes(1)
    expect(setTool).toHaveBeenCalledWith('select')
  })

  it('ignores a non-image file', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn()))
    act(() => result.current.loadBackdrop(new File(['x'], 'notes.txt', { type: 'text/plain' })))
    expect(result.current.backdrop).toBeNull()
    expect(persist.persistBackdrop).not.toHaveBeenCalled()
  })

  it('debounces calibration writes when the backdrop changes', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => usePlanBackdrop(true, vi.fn()))
      act(() => result.current.loadBackdrop(imageFile()))
      act(() => result.current.setBackdrop((b) => (b ? { ...b, opacity: 0.8 } : b)))
      act(() => vi.advanceTimersByTime(500))
      expect(persist.updateBackdropMeta).toHaveBeenCalled()
      expect(persist.updateBackdropMeta.mock.calls.at(-1)?.[0]).toMatchObject({ opacity: 0.8 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('removeBackdrop clears state and deletes the stored blob', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn()))
    act(() => result.current.loadBackdrop(imageFile()))
    expect(result.current.backdrop).not.toBeNull()
    act(() => result.current.removeBackdrop())
    expect(result.current.backdrop).toBeNull()
    expect(persist.removePersistedBackdrop).toHaveBeenCalledTimes(1)
  })

  it('rehydrates a persisted backdrop when editing opens', async () => {
    persist.readPersistedBackdrop.mockResolvedValue({
      blob: new Blob(['x']),
      meta: { w: 640, h: 480, opacity: 0.4, mPerPx: 0.02, ox: 1, oz: 2 },
    })
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn()))
    await waitFor(() => expect(result.current.backdrop).not.toBeNull())
    expect(result.current.backdrop).toMatchObject({ w: 640, opacity: 0.4, mPerPx: 0.02 })
  })

  it('does not rehydrate while the editor is closed', () => {
    persist.readPersistedBackdrop.mockResolvedValue({ blob: new Blob(['x']), meta: {} })
    renderHook(() => usePlanBackdrop(false, vi.fn()))
    expect(persist.readPersistedBackdrop).not.toHaveBeenCalled()
  })
})
