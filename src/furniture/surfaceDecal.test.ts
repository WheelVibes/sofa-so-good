import { describe, expect, it } from 'vitest'
import { MAX_DECOR_HALF, surfaceDecalSpec } from './surfaceDecal'

const decorDef = { noClip: true, kind: 'parametric' as const, mounted: false }

describe('surfaceDecalSpec', () => {
  it('returns a decal for small noClip parametric decor with a surfaceHeight', () => {
    const spec = surfaceDecalSpec(decorDef, { surfaceHeight: 0.42 }, 0.12, 0.1)
    expect(spec).toEqual({ y: 0.42, w: 0.24, d: 0.2 })
  })

  it('places the decal at the host surface height (so it grounds, not floats)', () => {
    expect(surfaceDecalSpec(decorDef, { surfaceHeight: 0.74 }, 0.1, 0.1)?.y).toBe(0.74)
  })

  it('skips an item without a numeric surfaceHeight (a floor-standing piece)', () => {
    expect(surfaceDecalSpec(decorDef, {}, 0.1, 0.1)).toBeNull()
    expect(surfaceDecalSpec(decorDef, { surfaceHeight: 'x' }, 0.1, 0.1)).toBeNull()
  })

  it('skips a floor-level surfaceHeight (≤0.01 — effectively on the floor)', () => {
    expect(surfaceDecalSpec(decorDef, { surfaceHeight: 0 }, 0.1, 0.1)).toBeNull()
  })

  it('skips a rug (noClip but no surfaceHeight)', () => {
    expect(surfaceDecalSpec(decorDef, { color: '#ccc' }, 1.5, 1.0)).toBeNull()
  })

  it('skips a large noClip piece (not tabletop decor)', () => {
    expect(surfaceDecalSpec(decorDef, { surfaceHeight: 0.4 }, MAX_DECOR_HALF + 0.1, 0.1)).toBeNull()
    expect(surfaceDecalSpec(decorDef, { surfaceHeight: 0.4 }, 0.1, MAX_DECOR_HALF + 0.1)).toBeNull()
  })

  it('accepts a piece exactly at the size limit', () => {
    expect(
      surfaceDecalSpec(decorDef, { surfaceHeight: 0.4 }, MAX_DECOR_HALF, MAX_DECOR_HALF),
    ).not.toBeNull()
  })

  it('skips non-noClip, non-parametric, or mounted items', () => {
    const sh = { surfaceHeight: 0.42 }
    expect(
      surfaceDecalSpec({ noClip: false, kind: 'parametric', mounted: false }, sh, 0.1, 0.1),
    ).toBeNull()
    expect(
      surfaceDecalSpec({ noClip: true, kind: 'gltf', mounted: false }, sh, 0.1, 0.1),
    ).toBeNull()
    expect(
      surfaceDecalSpec({ noClip: true, kind: 'parametric', mounted: true }, sh, 0.1, 0.1),
    ).toBeNull()
  })
})
