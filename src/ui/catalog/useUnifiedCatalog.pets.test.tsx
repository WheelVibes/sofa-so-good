// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../../state/store'
import { useUnifiedCatalog } from './useUnifiedCatalog'

/**
 * petFittings gap: a favourited PETS card must not surface when the pets tab is
 * off (`includePets=false`), on EVERY favourite branch — local, remote AND
 * shared — mirroring the local-branch guard. (Pets are builtin local defs today,
 * so remote/shared pets are defensive, but the branches must filter uniformly.)
 */

const sharedPet: SharedLibraryItem = {
  group: 'catbed',
  groupKey: 'catbed',
  name: 'Cat Bed',
  type: 'Pet Bed',
  category: 'pets',
  size: '',
  series: '',
  variants: 1,
  thumbnail: 'c.jpg',
  price: 39,
  currency: 'SGD',
}

const remotePet: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'pet_crate',
  kind: 'furniture',
  name: 'Pet Crate',
  category: 'pets',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://polyhaven.com/a/pet_crate',
}

function seed() {
  useStore.setState((s) => ({
    sharedLibrary: { ...s.sharedLibrary, status: 'ready', items: [sharedPet] },
    remoteIndexes: {
      ...s.remoteIndexes,
      polyhaven: { status: 'ready', entries: [remotePet] },
    },
    // Favourite BOTH the remote entry (id = provider:slug) and the shared item
    // (id = ikea-<groupKey>, its predicted imported def id).
    favouriteDefIds: ['polyhaven:pet_crate', 'ikea-catbed'],
  }))
}

describe('useUnifiedCatalog — favourites honour includePets on every branch', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('includes remote + shared pets favourites when includePets=true', () => {
    seed()
    const { result } = renderHook(() => useUnifiedCatalog(true, true, true))
    const favs = result.current.favourites
    expect(favs.some((it) => it.kind === 'remote' && it.entry.slug === 'pet_crate')).toBe(true)
    expect(favs.some((it) => it.kind === 'shared' && it.item.groupKey === 'catbed')).toBe(true)
  })

  it('drops remote + shared pets favourites when includePets=false', () => {
    seed()
    const { result } = renderHook(() => useUnifiedCatalog(true, true, false))
    const favs = result.current.favourites
    expect(favs.some((it) => it.kind === 'remote' && it.entry.slug === 'pet_crate')).toBe(false)
    expect(favs.some((it) => it.kind === 'shared' && it.item.groupKey === 'catbed')).toBe(false)
  })
})
