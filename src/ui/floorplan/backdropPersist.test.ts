import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import {
  type BackdropMeta,
  persistBackdrop,
  readPersistedBackdrop,
  removePersistedBackdrop,
  updateBackdropMeta,
} from './backdropPersist'

const META: BackdropMeta = { w: 800, h: 600, opacity: 0.4, mPerPx: 0.02, ox: 1.5, oz: -2 }

function blobOf(text = 'PNGDATA'): Blob {
  return new Blob([text], { type: 'image/png' })
}

describe('backdrop persistence', () => {
  beforeEach(async () => {
    await removePersistedBackdrop()
  })

  it('round-trips a backdrop blob + calibration', async () => {
    await persistBackdrop(blobOf(), META)
    const p = await readPersistedBackdrop()
    expect(p).not.toBeNull()
    expect(p?.mime).toBe('image/png')
    expect(p?.meta).toEqual(META)
    expect(p?.blob).toBeTruthy() // blob round-tripped (text() unavailable post structured-clone)
  })

  it('updates calibration without dropping the blob', async () => {
    await persistBackdrop(blobOf('IMG'), META)
    await updateBackdropMeta({ ...META, opacity: 0.9, mPerPx: 0.05 })
    const p = await readPersistedBackdrop()
    expect(p?.meta.opacity).toBe(0.9)
    expect(p?.meta.mPerPx).toBe(0.05)
    expect(p?.blob).toBeTruthy() // blob preserved through the meta update
  })

  it('updateBackdropMeta is a no-op when nothing is stored', async () => {
    await updateBackdropMeta(META)
    expect(await readPersistedBackdrop()).toBeNull()
  })

  it('clears the backdrop', async () => {
    await persistBackdrop(blobOf(), META)
    await removePersistedBackdrop()
    expect(await readPersistedBackdrop()).toBeNull()
  })

  it('uses a single fixed slot (re-persist replaces, no accumulation)', async () => {
    await persistBackdrop(blobOf('a'), META)
    await persistBackdrop(blobOf('b'), META)
    const all = await IdbAssetStore.list()
    expect(all.filter((r) => r.name === 'floor-plan-backdrop')).toHaveLength(1)
  })
})
