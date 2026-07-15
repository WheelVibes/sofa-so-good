import { describe, expect, it } from 'vitest'
import { FURNITURE_CATEGORIES } from '../../furniture/types'
import {
  POLY_HAVEN_BUNDLES,
  polyHavenAttribution,
  polyHavenBasename,
  polyHavenBundle,
  polyHavenSourceUrl,
  resolvePolyHavenGltfFiles,
} from './polyHaven'
import { AVAILABLE_PACKS, visiblePacks } from './registry'

/** A trimmed but shape-accurate Poly Haven `/files/<slug>` response. */
const filesJson = {
  blend: {},
  gltf: {
    '1k': {
      gltf: {
        url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/ceramic_vase_01/ceramic_vase_01_1k.gltf',
        size: 2706,
        include: {
          'ceramic_vase_01.bin': {
            url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/ceramic_vase_01/ceramic_vase_01.bin',
            size: 272000,
          },
          'textures/ceramic_vase_01_diff_1k.jpg': {
            url: 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ceramic_vase_01/ceramic_vase_01_diff_1k.jpg',
            size: 32000,
          },
        },
      },
    },
    '4k': { gltf: { url: 'https://example.com/ceramic_vase_01_4k.gltf', include: {} } },
  },
}

describe('resolvePolyHavenGltfFiles', () => {
  it('extracts the entry glTF url/name + every dependency by basename', () => {
    const plan = resolvePolyHavenGltfFiles(filesJson, '1k')
    expect(plan).not.toBeNull()
    expect(plan?.gltfName).toBe('ceramic_vase_01_1k.gltf')
    expect(plan?.gltfUrl).toContain('/1k/ceramic_vase_01/ceramic_vase_01_1k.gltf')
    // deps use basenames (matches the convert sibling pool + glTF relative refs).
    expect(plan?.deps.map((d) => d.name).sort()).toEqual([
      'ceramic_vase_01.bin',
      'ceramic_vase_01_diff_1k.jpg',
    ])
    const bin = plan?.deps.find((d) => d.name === 'ceramic_vase_01.bin')
    expect(bin?.url).toContain('/8k/ceramic_vase_01/ceramic_vase_01.bin')
  })

  it('defaults to the 1k resolution', () => {
    expect(resolvePolyHavenGltfFiles(filesJson)?.gltfName).toBe('ceramic_vase_01_1k.gltf')
  })

  it('returns null when the resolution has no glTF variant', () => {
    expect(resolvePolyHavenGltfFiles(filesJson, '2k')).toBeNull()
    expect(resolvePolyHavenGltfFiles({ gltf: {} }, '1k')).toBeNull()
    expect(resolvePolyHavenGltfFiles(null)).toBeNull()
    expect(resolvePolyHavenGltfFiles({})).toBeNull()
  })

  it('skips malformed include entries without a url', () => {
    const plan = resolvePolyHavenGltfFiles(
      {
        gltf: {
          '1k': { gltf: { url: 'a/b.gltf', include: { 'x.bin': {}, 'y.bin': { url: 'z' } } } },
        },
      },
      '1k',
    )
    expect(plan?.deps).toEqual([{ name: 'y.bin', url: 'z' }])
  })
})

describe('polyHavenBasename', () => {
  it('takes the last path segment, dropping query/hash', () => {
    expect(polyHavenBasename('textures/foo_1k.jpg')).toBe('foo_1k.jpg')
    expect(polyHavenBasename('https://h/a/b/c.bin?token=1#x')).toBe('c.bin')
    expect(polyHavenBasename('plain.gltf')).toBe('plain.gltf')
  })
})

describe('POLY_HAVEN_BUNDLES data', () => {
  it('has 3 themed bundles with unique ids', () => {
    expect(POLY_HAVEN_BUNDLES).toHaveLength(3)
    const ids = POLY_HAVEN_BUNDLES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every item is well-formed with a valid furniture category + captured author', () => {
    const slugs = new Set<string>()
    for (const bundle of POLY_HAVEN_BUNDLES) {
      expect(bundle.items.length).toBeGreaterThanOrEqual(6)
      for (const item of bundle.items) {
        expect(item.slug).toMatch(/^[a-z0-9_]+$/)
        expect(item.name.length).toBeGreaterThan(0)
        expect(item.author.length).toBeGreaterThan(0)
        expect(FURNITURE_CATEGORIES).toContain(item.category)
        // No duplicate slug across bundles (each maps to a distinct entry id).
        expect(slugs.has(item.slug)).toBe(false)
        slugs.add(item.slug)
      }
    }
  })

  it('credits the author in the attribution and points at the Poly Haven asset page', () => {
    const item = POLY_HAVEN_BUNDLES[0].items[0]
    expect(polyHavenAttribution(item)).toContain(item.author)
    expect(polyHavenAttribution(item)).toContain('CC0')
    expect(polyHavenSourceUrl(item.slug)).toBe(`https://polyhaven.com/a/${item.slug}`)
  })

  it('looks a bundle up by id', () => {
    expect(polyHavenBundle('poly-haven-plants')?.name).toBe('Indoor plants')
    expect(polyHavenBundle('nope')).toBeUndefined()
  })
})

describe('bundle registry surfacing', () => {
  it('registers every bundle as a CC0 poly-haven-bundle pack', () => {
    for (const bundle of POLY_HAVEN_BUNDLES) {
      const pack = AVAILABLE_PACKS.find((p) => p.id === bundle.id)
      expect(pack?.kind).toBe('poly-haven-bundle')
      expect(pack?.license).toBe('CC0')
      expect(pack?.devOnly).toBeFalsy()
    }
  })

  it('bundles are visible in production builds (CC0, keyless, CORS-friendly)', () => {
    const prodIds = new Set(visiblePacks(false).map((p) => p.id))
    for (const bundle of POLY_HAVEN_BUNDLES) expect(prodIds.has(bundle.id)).toBe(true)
  })
})
