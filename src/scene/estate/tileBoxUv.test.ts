import { describe, expect, it } from 'vitest'
import { tileBoxUv } from './Estate'
import { TILE_H_M, TILE_W_M } from './estateTextures'

// BoxGeometry face order: +x, −x, +y, −y, +z, −z; 4 vertices each; default uv 0..1.
describe('tileBoxUv — façade tiles repeat in metres, not per face', () => {
  it('a block one tile wide and one tile tall maps its ±z faces to exactly one tile', () => {
    const geo = tileBoxUv(TILE_W_M, TILE_H_M, 11)
    const uv = geo.attributes.uv
    const face = (f: number) =>
      [0, 1, 2, 3].map((k) => [uv.getX(f * 4 + k), uv.getY(f * 4 + k)] as const)
    for (const f of [4, 5]) {
      const us = face(f).map((p) => p[0])
      const vs = face(f).map((p) => p[1])
      expect(Math.max(...us)).toBeCloseTo(1, 6)
      expect(Math.max(...vs)).toBeCloseTo(1, 6)
      expect(Math.min(...us)).toBeCloseTo(0, 6)
      expect(Math.min(...vs)).toBeCloseTo(0, 6)
    }
  })
  it('a 72 m × 3-tile-tall block repeats 5 tiles along and 3 up, end walls by depth', () => {
    const geo = tileBoxUv(72, 3 * TILE_H_M, 11)
    const uv = geo.attributes.uv
    const maxU = (f: number) => Math.max(...[0, 1, 2, 3].map((k) => uv.getX(f * 4 + k)))
    const maxV = (f: number) => Math.max(...[0, 1, 2, 3].map((k) => uv.getY(f * 4 + k)))
    expect(maxU(4)).toBeCloseTo(72 / TILE_W_M, 6)
    expect(maxV(4)).toBeCloseTo(3, 6)
    expect(maxU(0)).toBeCloseTo(11 / TILE_W_M, 6)
    expect(maxV(0)).toBeCloseTo(3, 6)
    geo.dispose()
  })
})
