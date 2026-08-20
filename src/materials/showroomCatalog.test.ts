/**
 * SHOWROOM-FINISHES — curated-catalog integrity, the remote finish-id
 * round-trip the reload rehydration depends on, and the Simple/Pro flag gate.
 * Pure data/string module → node environment.
 */
import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/featureFlags'
import {
  extractRemoteFinishRefs,
  parseRemoteFinishId,
  remoteEntryForRef,
  SHOWROOM_FINISHES,
  SHOWROOM_RESOLUTION,
  showroomEntry,
  showroomFinishes,
  showroomFinishFor,
  showroomFinishId,
} from './showroomCatalog'

describe('showroom curation integrity', () => {
  it('has unique slugs, valid categories, hex swatches and positive physical uvScales', () => {
    const slugs = new Set<string>()
    for (const f of SHOWROOM_FINISHES) {
      expect(slugs.has(f.slug), `duplicate slug ${f.slug}`).toBe(false)
      slugs.add(f.slug)
      expect(['floor', 'wall']).toContain(f.category)
      expect(f.swatch).toMatch(/^#[0-9a-f]{6}$/i)
      expect(f.uvScale[0]).toBeGreaterThan(0)
      expect(f.uvScale[1]).toBeGreaterThan(0)
      expect(f.name.length).toBeGreaterThan(2)
      // Poly Haven slug shape (lowercase, underscores/digits) — a typo here is
      // a dead chip in the strip.
      expect(f.slug).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('offers finishes for both picker surfaces', () => {
    expect(showroomFinishes('floor').length).toBeGreaterThanOrEqual(5)
    expect(showroomFinishes('wall').length).toBeGreaterThanOrEqual(4)
    // Surface lists are disjoint partitions of the curated list.
    expect(showroomFinishes('floor').length + showroomFinishes('wall').length).toBe(
      SHOWROOM_FINISHES.length,
    )
  })

  it('synthesizes a resolvable RemoteEntry per finish (provider/kind/thumb/source)', () => {
    for (const f of SHOWROOM_FINISHES) {
      const e = showroomEntry(f)
      expect(e.provider).toBe('polyhaven')
      expect(e.kind).toBe('material')
      expect(e.slug).toBe(f.slug)
      expect(e.thumbUrl).toContain(f.slug)
      expect(e.sourceUrl).toBe(`https://polyhaven.com/a/${f.slug}`)
      expect(e.resolutions).toContain(SHOWROOM_RESOLUTION)
    }
  })

  it('looks up curated metadata by slug (and misses honestly)', () => {
    const first = SHOWROOM_FINISHES[0]
    expect(showroomFinishFor(first.slug)).toBe(first)
    expect(showroomFinishFor('no_such_slug')).toBeNull()
  })
})

describe('remote finish id round-trip', () => {
  it('builds and parses the resolved-material id shape', () => {
    const id = showroomFinishId('marble_01')
    expect(id).toBe(`polyhaven:marble_01:${SHOWROOM_RESOLUTION}`)
    expect(parseRemoteFinishId(id)).toEqual({
      provider: 'polyhaven',
      slug: 'marble_01',
      resolution: SHOWROOM_RESOLUTION,
    })
  })

  it('rejects non-remote ids', () => {
    for (const bad of [
      'floor-wood-oak',
      'tint:floor-wood-oak:#aabbcc',
      'compose:wood:#aabbcc',
      '#aabbcc',
      'polyhaven:marble_01', // no resolution
      'polyhaven:marble_01:8k', // unknown resolution
      '',
    ]) {
      expect(parseRemoteFinishId(bad), bad).toBeNull()
    }
  })

  it('extracts remote refs from a serialized state blob — including tint-wrapped ids — deduped', () => {
    const json = JSON.stringify({
      floor: { livingDining: 'polyhaven:marble_01:1k', kitchen: 'floor-tile-beige' },
      walls: { livingDining: 'tint:polyhaven:plastered_wall_02:2k:#aabbcc!r' },
      items: [{ props: { finish: 'mat:ambientcg:Wood094:1k' } }],
      dupe: 'polyhaven:marble_01:1k',
    })
    expect(extractRemoteFinishRefs(json)).toEqual([
      { provider: 'polyhaven', slug: 'marble_01', resolution: '1k' },
      { provider: 'polyhaven', slug: 'plastered_wall_02', resolution: '2k' },
      { provider: 'ambientcg', slug: 'Wood094', resolution: '1k' },
    ])
  })

  it('extracts nothing from a design with no remote finishes', () => {
    expect(
      extractRemoteFinishRefs(JSON.stringify({ floor: { a: 'floor-wood-oak' }, items: [] })),
    ).toEqual([])
  })

  it('synthesizes curated metadata for a showroom slug and an honest generic entry otherwise', () => {
    const curated = remoteEntryForRef({
      provider: 'polyhaven',
      slug: 'marble_01',
      resolution: '1k',
    })
    expect(curated.name).toBe('Cream marble slab')
    expect(curated.category).toBe('floor')

    const generic = remoteEntryForRef({
      provider: 'ambientcg',
      slug: 'wood_094',
      resolution: '2k',
    })
    expect(generic.name).toBe('Wood 094')
    expect(generic.provider).toBe('ambientcg')
    expect(generic.sourceUrl).toContain('ambientcg.com')
  })
})

describe('showroomFinishes flag — Simple/Pro gate', () => {
  it('is on in BOTH modes and BOTH build kinds (simple-tier, prod default on)', () => {
    expect(resolveFlags(false, {}, false, 'simple').showroomFinishes).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').showroomFinishes).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').showroomFinishes).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').showroomFinishes).toBe(true)
  })
})
