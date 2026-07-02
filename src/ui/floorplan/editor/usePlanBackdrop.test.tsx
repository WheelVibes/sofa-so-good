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

import type { FloorPlan } from '../../../floorplan/types'
import { useStore } from '../../../state/store'
import { usePlanBackdrop } from './usePlanBackdrop'

// Minimal plan whose planBounds is 10x8 m (drives the centered-fit placement).
const plan: FloorPlan = {
  id: 'p',
  name: 'p',
  ceilingHeight: 2.6,
  extent: [10, 8],
  walls: [],
  openings: [],
  rooms: [],
}

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
  useStore.getState().__resetForTest()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const imageFile = () => new File(['x'], 'plan.png', { type: 'image/png' })

describe('usePlanBackdrop', () => {
  it('starts with no backdrop', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
    expect(result.current.backdrop).toBeNull()
  })

  it('loadBackdrop sets the backdrop, persists the blob, and switches to select', () => {
    const setTool = vi.fn()
    const { result } = renderHook(() => usePlanBackdrop(true, setTool, plan))
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

  it('rejects a non-image file with an error toast', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
    act(() => result.current.loadBackdrop(new File(['x'], 'notes.txt', { type: 'text/plain' })))
    expect(result.current.backdrop).toBeNull()
    expect(persist.persistBackdrop).not.toHaveBeenCalled()
    expect(useStore.getState().notifications.some((n) => n.kind === 'error')).toBe(true)
  })

  it('rejects an oversize file with an error toast and no state change', () => {
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
    const huge = new File([new Uint8Array(1)], 'huge.png', { type: 'image/png' })
    Object.defineProperty(huge, 'size', { value: 26 * 1024 * 1024 })
    act(() => result.current.loadBackdrop(huge))
    expect(result.current.backdrop).toBeNull()
    expect(persist.persistBackdrop).not.toHaveBeenCalled()
    expect(useStore.getState().notifications.some((n) => n.kind === 'error')).toBe(true)
  })

  it('centres and fits a loaded image to the plan bounds', () => {
    // FakeImage is 800x600 px; plan bounds 10x8 m → mPerPx = min(10/800, 8/600)*0.9
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
    act(() => result.current.loadBackdrop(imageFile()))
    const b = result.current.backdrop
    expect(b?.mPerPx).toBeCloseTo(0.01125)
    expect(b?.ox).toBeCloseTo(10 / 2 - (800 * 0.01125) / 2) // 0.5
    expect(b?.oz).toBeCloseTo(8 / 2 - (600 * 0.01125) / 2) // 0.625
  })

  it('debounces calibration writes when the backdrop changes', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
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
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
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
    const { result } = renderHook(() => usePlanBackdrop(true, vi.fn(), plan))
    await waitFor(() => expect(result.current.backdrop).not.toBeNull())
    expect(result.current.backdrop).toMatchObject({ w: 640, opacity: 0.4, mPerPx: 0.02 })
  })

  it('does not rehydrate while the editor is closed', () => {
    persist.readPersistedBackdrop.mockResolvedValue({ blob: new Blob(['x']), meta: {} })
    renderHook(() => usePlanBackdrop(false, vi.fn(), plan))
    expect(persist.readPersistedBackdrop).not.toHaveBeenCalled()
  })
})
