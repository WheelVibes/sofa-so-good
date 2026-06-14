import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import {
  applyWalkBackdropFile,
  clearWalkBackdrop,
  hydrateWalkBackdrop,
  loadWalkBackdrop,
  persistWalkBackdrop,
  removeWalkBackdrop,
} from './walkBackdrop'

// happy-dom lacks createObjectURL; stub a deterministic one.
beforeEach(() => {
  let n = 0
  globalThis.URL.createObjectURL = vi.fn(() => `blob:walk-${n++}`)
  globalThis.URL.revokeObjectURL = vi.fn()
  useStore.getState().setCustomBackdropUrl(null)
  useStore.getState().setBackdrop('city')
})

const imageFile = (bytes = 4) =>
  new File([new Uint8Array(bytes)], 'pano.jpg', { type: 'image/jpeg' })

describe('walk backdrop persistence', () => {
  it('round-trips the blob through IDB and clears it', async () => {
    await persistWalkBackdrop(imageFile())
    expect(await loadWalkBackdrop()).not.toBeNull()
    await removeWalkBackdrop()
    expect(await loadWalkBackdrop()).toBeNull()
  })
})

describe('applyWalkBackdropFile', () => {
  it('accepts an image, persists it, and selects the custom backdrop', async () => {
    const err = await applyWalkBackdropFile(imageFile())
    expect(err).toBeNull()
    expect(useStore.getState().customBackdropUrl).toMatch(/^blob:walk-/)
    expect(useStore.getState().backdrop).toBe('custom')
    expect(await loadWalkBackdrop()).not.toBeNull()
  })

  it('rejects a non-image file without touching the store', async () => {
    const err = await applyWalkBackdropFile(new File(['x'], 'note.txt', { type: 'text/plain' }))
    expect(err).toMatch(/image/i)
    expect(useStore.getState().backdrop).toBe('city')
    expect(useStore.getState().customBackdropUrl).toBeNull()
  })

  it('rejects an oversized image', async () => {
    const big = { type: 'image/png', size: 30 * 1024 * 1024 } as File
    expect(await applyWalkBackdropFile(big)).toMatch(/too large/i)
  })
})

describe('clearWalkBackdrop', () => {
  it('removes the photo and reverts a custom selection to city', async () => {
    await applyWalkBackdropFile(imageFile())
    await clearWalkBackdrop()
    expect(useStore.getState().customBackdropUrl).toBeNull()
    expect(useStore.getState().backdrop).toBe('city')
    expect(await loadWalkBackdrop()).toBeNull()
  })
})

describe('hydrateWalkBackdrop', () => {
  it('exposes a live URL when a photo was persisted, without changing the kind', async () => {
    await persistWalkBackdrop(imageFile())
    useStore.getState().setBackdrop('custom')
    useStore.getState().setCustomBackdropUrl(null)
    await hydrateWalkBackdrop()
    expect(useStore.getState().customBackdropUrl).toMatch(/^blob:walk-/)
    expect(useStore.getState().backdrop).toBe('custom')
  })

  it('is a no-op when nothing was persisted', async () => {
    await removeWalkBackdrop()
    await hydrateWalkBackdrop()
    expect(useStore.getState().customBackdropUrl).toBeNull()
  })
})
