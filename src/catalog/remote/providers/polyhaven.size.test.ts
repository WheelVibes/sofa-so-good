import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteEntry } from '../types'
import { polyhaven } from './polyhaven'

const matEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'wood_floor',
  kind: 'material',
  name: 'Wood Floor',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['1k', '2k', '4k'],
  attribution: '',
  sourceUrl: '',
}

const modelEntry: RemoteEntry = {
  ...matEntry,
  slug: 'chair',
  kind: 'furniture',
  category: 'seating',
}

function mockFiles(body: unknown) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => body }) as Response) as never
}

afterEach(() => vi.restoreAllMocks())

describe('polyhaven.fetchSize', () => {
  it('sums the texture channels it would download at the chosen resolution', async () => {
    mockFiles({
      Diffuse: { '2k': { jpg: { url: 'd', size: 1000 } } },
      nor_gl: { '2k': { jpg: { url: 'n', size: 200 } } },
      Rough: { '2k': { jpg: { url: 'r', size: 50 } } },
      AO: { '2k': { jpg: { url: 'a', size: 25 } } },
    })
    expect(await polyhaven.fetchSize?.(matEntry, '2k')).toBe(1275)
  })

  it('sums the gltf + all its include dependencies for a model', async () => {
    mockFiles({
      gltf: {
        '2k': {
          gltf: {
            url: 'g',
            size: 500,
            include: { 'scene.bin': { url: 'b', size: 4000 }, 'tex.jpg': { url: 't', size: 9000 } },
          },
        },
      },
    })
    expect(await polyhaven.fetchSize?.(modelEntry, '2k')).toBe(13500)
  })

  it('returns null when the API exposes no sizes for the picked files', async () => {
    mockFiles({ Diffuse: { '2k': { jpg: { url: 'd' } } } })
    expect(await polyhaven.fetchSize?.(matEntry, '2k')).toBeNull()
  })

  it('falls back to another resolution when the preferred one is missing', async () => {
    mockFiles({ Diffuse: { '1k': { jpg: { url: 'd', size: 333 } } } })
    expect(await polyhaven.fetchSize?.(matEntry, '4k')).toBe(333)
  })
})
