import { afterEach, describe, expect, it, vi } from 'vitest'
import { polyhaven } from './polyhaven'

const mockFetch = (handlers: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    for (const [pat, body] of Object.entries(handlers)) {
      if (url.includes(pat)) {
        return new Response(JSON.stringify(body), { status: 200 })
      }
    }
    return new Response('not found', { status: 404 })
  })

describe('polyhaven.fetchIndex', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns furniture and material entries', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        't=models': {
          modern_arm_chair_01: {
            name: 'Modern Arm Chair 01',
            categories: ['chair', 'seating'],
            authors: { Bob: 'modeller' },
          },
        },
        't=textures': {
          wood_floor_diff: {
            name: 'Wood Floor',
            categories: ['floor', 'wood'],
            authors: { Alice: 'photog' },
          },
        },
      }),
    )

    const entries = await polyhaven.fetchIndex()
    expect(entries.find((e) => e.kind === 'furniture')?.slug).toBe('modern_arm_chair_01')
    expect(entries.find((e) => e.kind === 'material')?.slug).toBe('wood_floor_diff')
    expect(entries[0].attribution).toContain('Poly Haven')
  })
})

describe('polyhaven.fetchSize', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sums exactly the files a material download picks, for the chosen resolution', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/files/wood_floor': {
          Diffuse: { '2k': { jpg: { url: 'd', size: 1_000_000 } } },
          nor_gl: { '2k': { jpg: { url: 'n', size: 500_000 } } },
          Rough: { '2k': { jpg: { url: 'r', size: 300_000 } } },
          AO: { '2k': { jpg: { url: 'a', size: 200_000 } } },
        },
      }),
    )
    const entry = { provider: 'polyhaven', slug: 'wood_floor', kind: 'material' } as never
    const size = await polyhaven.fetchSize!(entry, '2k')
    expect(size).toBe(2_000_000)
  })

  it('returns null when the files endpoint reports no sizes', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/files/x': { Diffuse: { '2k': { jpg: { url: 'd' } } } } }))
    const entry = { provider: 'polyhaven', slug: 'x', kind: 'material' } as never
    expect(await polyhaven.fetchSize!(entry, '2k')).toBeNull()
  })
})
