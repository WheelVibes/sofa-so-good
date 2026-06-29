import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * HDRI environment selection (F3/R-HDRI). Default is null (procedural probe, no
 * look change); selecting an id opts into a captured CC0 HDRI for IBL.
 */
describe('hdri environment selection', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to null (procedural probe)', () => {
    expect(useStore.getState().hdriId).toBeNull()
  })

  it('sets and clears the selected HDRI', () => {
    useStore.getState().setHdri('studio_small_09')
    expect(useStore.getState().hdriId).toBe('studio_small_09')
    useStore.getState().setHdri(null)
    expect(useStore.getState().hdriId).toBeNull()
  })
})
