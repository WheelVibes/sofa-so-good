import { describe, expect, it } from 'vitest'
import {
  buildAttribution,
  pickGltfBundle,
  polyhavenCategory,
  slugify,
  sourceUrl,
} from '../polyhaven-select.mjs'

// A trimmed shape mirroring a real Poly Haven `/files/<id>` response.
const filesJson = {
  Diffuse: { '1k': {} },
  gltf: {
    '4k': { gltf: { url: 'https://dl.polyhaven.org/…/Foo_4k.gltf', size: 9000, include: {} } },
    '2k': { gltf: { url: 'https://dl.polyhaven.org/…/Foo_2k.gltf', size: 5000, include: {} } },
    '1k': {
      gltf: {
        url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Foo/Foo_1k.gltf',
        size: 3182,
        md5: 'abc',
        include: {
          'textures/Foo_diff_1k.jpg': { url: 'https://dl…/diff.jpg', size: 100, md5: 'd' },
          'Foo.bin': { url: 'https://dl…/Foo.bin', size: 200, md5: 'b' },
        },
      },
    },
  },
}

describe('pickGltfBundle', () => {
  it('selects the 1k bundle by default with its main url + includes', () => {
    const b = pickGltfBundle(filesJson)
    expect(b).not.toBeNull()
    expect(b?.resolution).toBe('1k')
    expect(b?.url).toContain('/1k/Foo/Foo_1k.gltf')
    expect(b?.includes).toHaveLength(2)
    const rels = b?.includes.map((i) => i.relPath).sort()
    expect(rels).toEqual(['Foo.bin', 'textures/Foo_diff_1k.jpg'])
    // every include carries a download url
    expect(b?.includes.every((i) => i.url.startsWith('https://'))).toBe(true)
  })

  it('honours an explicit resolution', () => {
    expect(pickGltfBundle(filesJson, '2k')?.resolution).toBe('2k')
  })

  it('falls back to the cheapest available when the preferred res is missing', () => {
    const noOneK = { gltf: { '2k': filesJson.gltf['2k'] } }
    expect(pickGltfBundle(noOneK, '1k')?.resolution).toBe('2k')
  })

  it('drops include entries without a url', () => {
    const partial = {
      gltf: {
        '1k': {
          gltf: {
            url: 'https://dl…/x.gltf',
            include: { 'a.bin': { url: 'https://dl…/a.bin' }, 'b.bin': {} },
          },
        },
      },
    }
    expect(pickGltfBundle(partial)?.includes).toHaveLength(1)
  })

  it('returns null when there is no glTF bundle', () => {
    expect(pickGltfBundle({ blend: {}, fbx: {} })).toBeNull()
    expect(pickGltfBundle(null)).toBeNull()
    expect(pickGltfBundle({ gltf: { '1k': { gltf: { size: 1 } } } })).toBeNull()
  })
})

describe('slugify', () => {
  it('produces a filesystem-safe, title-recoverable stem', () => {
    expect(slugify('Arm Chair 01')).toBe('arm-chair-01')
    expect(slugify('modern_coffee_table_01')).toBe('modern-coffee-table-01')
    expect(slugify('  Sofa   02  ')).toBe('sofa-02')
    expect(slugify('Chinese/Tea Table')).toBe('chinese-tea-table')
  })

  it('handles empty / nullish input', () => {
    expect(slugify(undefined)).toBe('')
    expect(slugify('')).toBe('')
  })
})

describe('polyhavenCategory', () => {
  it('maps common furniture by name keyword', () => {
    expect(polyhavenCategory({ name: 'Sofa 02' })).toBe('seating')
    expect(polyhavenCategory({ name: 'Modern Coffee Table 01' })).toBe('tables')
    expect(polyhavenCategory({ name: 'Gothic Bed 01' })).toBe('beds')
  })

  it('prefers storage over tables for a cabinet with no table word', () => {
    // ph tags this "table"; the name keyword (cabinet → storage) should win.
    expect(
      polyhavenCategory({ name: 'Modern Wooden Cabinet', categories: ['furniture', 'table'] }),
    ).toBe('storage')
  })

  it('classifies a desk lamp as lighting, not a desk', () => {
    expect(polyhavenCategory({ name: 'Desk Lamp Arm 01' })).toBe('lighting')
  })

  it('falls back to Poly Haven category tags when the name has no keyword', () => {
    expect(polyhavenCategory({ name: 'Foo 01', categories: ['furniture', 'shelves'] })).toBe(
      'storage',
    )
    expect(polyhavenCategory({ name: 'Bar 09', categories: ['appliances'] })).toBe('appliances')
  })

  it('uses tags as a keyword source', () => {
    expect(polyhavenCategory({ name: 'Untitled', tags: ['vintage', 'chair'] })).toBe('seating')
  })

  it('defaults to others when nothing matches', () => {
    expect(polyhavenCategory({ name: 'Mystery Object', categories: ['props'] })).toBe('others')
    expect(polyhavenCategory({})).toBe('others')
  })
})

describe('buildAttribution / sourceUrl', () => {
  it('records the CC0 author + Poly Haven source', () => {
    expect(buildAttribution({ name: 'Sofa 02', authors: { 'Kirill Sannikov': 'All' } })).toBe(
      'Sofa 02 by Kirill Sannikov (CC0) — Poly Haven',
    )
  })

  it('omits the author clause when unknown', () => {
    expect(buildAttribution({ name: 'Sofa 02' })).toBe('Sofa 02 (CC0) — Poly Haven')
  })

  it('joins multiple authors', () => {
    expect(buildAttribution({ name: 'X', authors: { A: 'x', B: 'y' } })).toBe(
      'X by A, B (CC0) — Poly Haven',
    )
  })

  it('builds the canonical asset page url', () => {
    expect(sourceUrl('sofa_02')).toBe('https://polyhaven.com/a/sofa_02')
  })
})
