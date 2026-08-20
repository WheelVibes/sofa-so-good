/**
 * SHOWROOM-FINISHES — reload rehydration: applied remote-material finish ids
 * (room finishes, accents, tint-wrapped, furniture props) are collected from
 * the restored state and re-resolved through `resolveRemoteAsset`, so a photo
 * finish keeps rendering after a reload instead of dropping to the builtin
 * fallback. Deliberately NOT flag-gated (gating is browse/add only).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { collectRemoteFinishRefs, rehydrateRemoteFinishes } from './rehydrateRemoteFinishes'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('collectRemoteFinishRefs', () => {
  it('finds remote ids across finishes and item props, deduped', () => {
    const refs = collectRemoteFinishRefs({
      finishes: {
        floor: { livingDining: 'polyhaven:marble_01:1k', kitchen: 'floor-tile-beige' },
        walls: { livingDining: 'tint:polyhaven:plastered_wall_02:1k:#aabbcc!r' },
        ceiling: {},
        wallAccents: { 'w1:livingDining': 'polyhaven:marble_01:1k' },
      },
      items: [{ props: { finish: 'mat:polyhaven:wood_floor:2k' } }],
    })
    expect(refs).toEqual([
      { provider: 'polyhaven', slug: 'marble_01', resolution: '1k' },
      { provider: 'polyhaven', slug: 'plastered_wall_02', resolution: '1k' },
      { provider: 'polyhaven', slug: 'wood_floor', resolution: '2k' },
    ])
  })

  it('returns nothing for a design with only builtin/procedural finishes', () => {
    expect(
      collectRemoteFinishRefs({
        finishes: { floor: { a: 'floor-vinyl-oak' }, walls: { a: '#aabbcc' } },
        items: [{ props: {} }],
      }),
    ).toEqual([])
  })
})

describe('rehydrateRemoteFinishes', () => {
  it('re-resolves each applied remote finish at its saved resolution', async () => {
    const resolveMock = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ resolveRemoteAsset: resolveMock } as never)
    useStore.getState().setFloorFinish('livingDining', 'polyhaven:marble_01:1k')
    useStore.getState().setWallFinish('livingDining', 'polyhaven:plastered_wall_02:2k')

    await rehydrateRemoteFinishes()

    expect(resolveMock).toHaveBeenCalledTimes(2)
    const calls = resolveMock.mock.calls.map(([entry, res]) => [entry.slug, res])
    expect(calls).toContainEqual(['marble_01', '1k'])
    expect(calls).toContainEqual(['plastered_wall_02', '2k'])
    // The curated slug re-resolves with its curated (honest) name.
    const marbleEntry = resolveMock.mock.calls.find(([e]) => e.slug === 'marble_01')?.[0]
    expect(marbleEntry.name).toBe('Cream marble slab')
  })

  it('a per-finish resolve failure is swallowed (boot never aborts)', async () => {
    const resolveMock = vi.fn().mockRejectedValue(new Error('offline'))
    useStore.setState({ resolveRemoteAsset: resolveMock } as never)
    useStore.getState().setFloorFinish('livingDining', 'polyhaven:marble_01:1k')
    await expect(rehydrateRemoteFinishes()).resolves.toBeUndefined()
  })

  it('no remote finishes → no resolve calls', async () => {
    const resolveMock = vi.fn()
    useStore.setState({ resolveRemoteAsset: resolveMock } as never)
    await rehydrateRemoteFinishes()
    expect(resolveMock).not.toHaveBeenCalled()
  })
})
