import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'
import { useStore } from '../store'

describe('favouritesSlice', () => {
  beforeEach(() => {
    useStore.getState().clearFavourites()
  })

  it('starts empty', () => {
    expect(useStore.getState().favouriteDefIds).toEqual([])
  })

  it('toggleFavourite adds an id', () => {
    useStore.getState().toggleFavourite('sofa-2-seat')
    expect(useStore.getState().favouriteDefIds).toContain('sofa-2-seat')
  })

  it('toggleFavourite removes an already-favourited id', () => {
    useStore.getState().toggleFavourite('sofa-2-seat')
    useStore.getState().toggleFavourite('sofa-2-seat')
    expect(useStore.getState().favouriteDefIds).not.toContain('sofa-2-seat')
  })

  it('dedupes — toggling twice then once leaves it present', () => {
    useStore.getState().toggleFavourite('armchair')
    useStore.getState().toggleFavourite('armchair') // remove
    useStore.getState().toggleFavourite('armchair') // re-add
    expect(useStore.getState().favouriteDefIds).toContain('armchair')
    expect(useStore.getState().favouriteDefIds.filter((id) => id === 'armchair').length).toBe(1)
  })

  it('preserves insertion order (oldest first)', () => {
    useStore.getState().toggleFavourite('a')
    useStore.getState().toggleFavourite('b')
    useStore.getState().toggleFavourite('c')
    expect(useStore.getState().favouriteDefIds).toEqual(['a', 'b', 'c'])
  })

  it('ignores empty ids', () => {
    useStore.getState().toggleFavourite('')
    expect(useStore.getState().favouriteDefIds).toEqual([])
  })

  it('isFavourite returns true for a starred id', () => {
    useStore.getState().toggleFavourite('dining-table')
    expect(useStore.getState().isFavourite('dining-table')).toBe(true)
  })

  it('isFavourite returns false for an unstarred id', () => {
    expect(useStore.getState().isFavourite('not-starred')).toBe(false)
  })

  it('clearFavourites empties the list', () => {
    useStore.getState().toggleFavourite('a')
    useStore.getState().toggleFavourite('b')
    useStore.getState().clearFavourites()
    expect(useStore.getState().favouriteDefIds).toEqual([])
  })

  it('handles multiple different ids', () => {
    useStore.getState().toggleFavourite('id-1')
    useStore.getState().toggleFavourite('id-2')
    useStore.getState().toggleFavourite('id-3')
    const ids = useStore.getState().favouriteDefIds
    expect(ids).toHaveLength(3)
    expect(ids).toContain('id-1')
    expect(ids).toContain('id-2')
    expect(ids).toContain('id-3')
  })
})

describe('finish favourites (PC2-FAVOURITE-MATERIALS)', () => {
  beforeEach(() => {
    useStore.setState({ favouriteFinishIds: [] })
  })

  it('is a separate list from furniture favourites', () => {
    useStore.getState().toggleFavourite('sofa-2seat')
    useStore.getState().toggleFinishFavourite('oak-floor')
    // Finish favourites must NOT leak into the furniture list (catalog tab) and
    // vice-versa.
    expect(useStore.getState().favouriteDefIds).not.toContain('oak-floor')
    expect(useStore.getState().favouriteFinishIds).not.toContain('sofa-2seat')
    expect(useStore.getState().favouriteFinishIds).toEqual(['oak-floor'])
  })

  it('toggleFinishFavourite adds, removes, and dedupes', () => {
    useStore.getState().toggleFinishFavourite('marble')
    expect(useStore.getState().isFinishFavourite('marble')).toBe(true)
    useStore.getState().toggleFinishFavourite('marble') // remove
    expect(useStore.getState().isFinishFavourite('marble')).toBe(false)
    useStore.getState().toggleFinishFavourite('marble') // re-add
    expect(useStore.getState().favouriteFinishIds.filter((id) => id === 'marble').length).toBe(1)
  })

  it('preserves insertion order and ignores empty ids', () => {
    useStore.getState().toggleFinishFavourite('a')
    useStore.getState().toggleFinishFavourite('')
    useStore.getState().toggleFinishFavourite('b')
    expect(useStore.getState().favouriteFinishIds).toEqual(['a', 'b'])
  })
})

describe('catalogFavourites feature flag — Simple vs Pro mode', () => {
  it('is on in Simple mode (tier: simple)', () => {
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    const simpleFlags = resolveFlags(true, {}, false, 'simple')
    expect(simpleFlags.catalogFavourites).toBe(true)
  })

  it('is on in Pro mode', () => {
    const proFlags = resolveFlags(true, {}, false, 'pro')
    expect(proFlags.catalogFavourites).toBe(true)
  })

  it('has default: true (prod-safe)', () => {
    expect(FEATURE_FLAGS.catalogFavourites.default).toBe(true)
  })

  it('is tier: simple (core furnish loop)', () => {
    expect(FEATURE_FLAGS.catalogFavourites.tier).toBe('simple')
  })

  it('the store reflects the flag on in both modes', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.catalogFavourites).toBe(true)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.catalogFavourites).toBe(true)
  })
})
