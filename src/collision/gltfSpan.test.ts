import { describe, expect, it } from 'vitest'
import { spanFromFootprint } from './gltfSpan'

describe('spanFromFootprint', () => {
  it('builds a floor-anchored span and footprint from a cached bbox', () => {
    const r = spanFromFootprint({ w: 1.2, d: 0.6, h: 0.75, ox: 0, oz: 0 })
    expect(r.defaultFootprint).toEqual({ w: 1.2, d: 0.6, h: 0.75 })
    expect(r.verticalSpan).toEqual({ base: 0, top: 0.75 })
  })

  it('honours a baseY by lifting the span base (mounted models)', () => {
    const r = spanFromFootprint({ w: 0.8, d: 0.3, h: 0.5, ox: 0, oz: 0 }, { baseY: 1.4 })
    expect(r.verticalSpan).toEqual({ base: 1.4, top: 1.9 })
  })

  it('ignores ox/oz (placement.ts applies the center offset, not the footprint)', () => {
    const centered = spanFromFootprint({ w: 1, d: 1, h: 1, ox: 0, oz: 0 })
    const offset = spanFromFootprint({ w: 1, d: 1, h: 1, ox: 0.5, oz: -0.3 })
    expect(offset).toEqual(centered)
  })
})
