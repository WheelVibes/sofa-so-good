import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// getThumb returns a cached blob so the provider-fetch path is skipped entirely.
vi.mock('./cache/db', () => ({
  getThumb: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
  putThumb: vi.fn(async () => {}),
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
    await waitFor(() => expect(result.current).toBeTruthy())
    const url = result.current as string
    expect(created).toContain(url)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled() // still mounted → not revoked
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('does not create a URL while not visible', () => {
    const { result } = renderHook(() => useThumbnail(entry, false))
    expect(result.current).toBeUndefined()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
