// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { useUnifiedCatalog } from './useUnifiedCatalog'

/**
 * parametricStairs gating: the built-in `staircase` catalog card is a pro-tier
 * feature (structural authoring for multi-level plans), so it must be HIDDEN in
 * Simple mode. `useUnifiedCatalog(_, _, _, includeStairs)` drops the single
 * `staircase` def when the flag is off — from the browse grid, the flat `all`
 * search list, favourites AND recents (mirroring the pets-category gate).
 */

const STAIRCASE_ID = 'staircase'
const hasStaircase = (items: { kind: string }[]) =>
  items.some(
    (it) =>
      it.kind === 'local' && (it as unknown as { def: { id: string } }).def.id === STAIRCASE_ID,
  )

describe('useUnifiedCatalog — parametricStairs gating (both modes)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('Pro (includeStairs=true): the Staircase card is present in the grid and search', () => {
    const { result } = renderHook(() => useUnifiedCatalog(true, true, true, true))
    expect(hasStaircase(result.current.byCategory.others)).toBe(true)
    expect(hasStaircase(result.current.all)).toBe(true)
  })

  it('Simple (includeStairs=false): the Staircase card is hidden from grid, search, favourites, recents', () => {
    useStore.setState({ favouriteDefIds: [STAIRCASE_ID], recentDefIds: [STAIRCASE_ID] })
    const { result } = renderHook(() => useUnifiedCatalog(true, true, true, false))
    expect(hasStaircase(result.current.byCategory.others)).toBe(false)
    expect(hasStaircase(result.current.all)).toBe(false)
    expect(hasStaircase(result.current.favourites)).toBe(false)
    expect(hasStaircase(result.current.recent)).toBe(false)
  })

  it('Pro: a favourited / recently-placed Staircase surfaces on those strips', () => {
    useStore.setState({ favouriteDefIds: [STAIRCASE_ID], recentDefIds: [STAIRCASE_ID] })
    const { result } = renderHook(() => useUnifiedCatalog(true, true, true, true))
    expect(hasStaircase(result.current.favourites)).toBe(true)
    expect(hasStaircase(result.current.recent)).toBe(true)
  })
})
