// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// getThumb returns a cached blob so the provider-fetch path is skipped entirely.
const getThumb = vi.fn(async () => new Blob(['x'], { type: 'image/png' }) as Blob | undefined)
const putThumb = vi.fn(async () => {})
vi.mock('./cache/db', () => ({
  getThumb: (...a: unknown[]) => getThumb(...(a as [])),
  putThumb: (...a: unknown[]) => putThumb(...(a as [])),
}))

const fetchThumbnail = vi.fn(async () => new Blob(['y'], { type: 'image/png' }))
vi.mock('./providers', () => ({
  PROVIDERS: { polyhaven: { id: 'polyhaven', fetchThumbnail: () => fetchThumbnail() } },
}))

import { useThumbnail } from './hooks'
import type { RemoteEntry } from './types'

const entry = { provider: 'polyhaven', slug: 'test-asset' } as unknown as RemoteEntry

describe('useThumbnail — blob URL lifecycle (BUG-007)', () => {
  const created: string[] = []
  beforeEach(() => {
    created.length = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const u = `blob:test-${created.length}`
      created.push(u)
      return u
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('revokes the created object URL on unmount', async () => {
    const { result, unmount } = renderHook(() => useThumbnail(entry, true))
    await waitFor(() => expect(result.current.url).toBeTruthy())
    const url = result.current.url as string
    expect(created).toContain(url)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled() // still mounted → not revoked
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('does not create a URL while not visible', () => {
    const { result } = renderHook(() => useThumbnail(entry, false))
    expect(result.current.url).toBeUndefined()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('useThumbnail — failure is visible and retryable', () => {
  beforeEach(() => {
    getThumb.mockReset().mockResolvedValue(undefined)
    putThumb.mockReset().mockResolvedValue(undefined)
    fetchThumbnail.mockReset()
  })

  it('reports failed instead of leaving the card on its skeleton forever', async () => {
    fetchThumbnail.mockRejectedValue(new Error('CORS'))
    const { result } = renderHook(() => useThumbnail(entry, true))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.url).toBeUndefined()
  })

  it('retry() re-runs the fetch and clears the failure', async () => {
    fetchThumbnail.mockRejectedValueOnce(new Error('CORS'))
    fetchThumbnail.mockResolvedValue(new Blob(['y'], { type: 'image/png' }))
    const { result } = renderHook(() => useThumbnail(entry, true))
    await waitFor(() => expect(result.current.failed).toBe(true))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.url).toBeTruthy())
    expect(result.current.failed).toBe(false)
  })

  it('shows a fetched thumbnail even when caching it throws (quota/private mode)', async () => {
    fetchThumbnail.mockResolvedValue(new Blob(['y'], { type: 'image/png' }))
    putThumb.mockRejectedValue(new Error('QuotaExceededError'))
    const { result } = renderHook(() => useThumbnail(entry, true))
    await waitFor(() => expect(result.current.url).toBeTruthy())
    expect(result.current.failed).toBe(false)
  })
})
