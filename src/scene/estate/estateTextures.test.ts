// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  FACADE_TILE_H,
  FACADE_TILE_W,
  paintFacadeTile,
  paintGroundTile,
  paintRoadTile,
  paintTreeSprite,
  TILE_BAYS,
  TILE_H_M,
  TILE_STOREYS,
  TILE_W_M,
  WALL_PAINTS,
} from './estateTextures'

// happy-dom has no real 2D context, so these assert the canvas contract (size, no
// throw) — the same posture as `backdropEquirect.test.ts`. Pixel content is judged
// by looking (real-GPU scenario), like every backdrop change in this repo.
describe('estate texture painters', () => {
  it('façade tile is sized to the bay × storey period at the stated texel density', () => {
    expect(TILE_W_M).toBeCloseTo(3.6 * TILE_BAYS)
    expect(TILE_H_M).toBeCloseTo(2.8 * TILE_STOREYS)
    expect(FACADE_TILE_W / FACADE_TILE_H).toBeCloseTo(TILE_W_M / TILE_H_M, 1)
    for (const paint of WALL_PAINTS.keys()) {
      for (const kind of ['windows', 'corridor'] as const) {
        for (const night of [false, true]) {
          const c = paintFacadeTile({ kind, paint, night })
          expect(c.width).toBe(FACADE_TILE_W)
          expect(c.height).toBe(FACADE_TILE_H)
        }
      }
    }
  })
  it('ground, road and tree sprites do not throw and are square', () => {
    for (const c of [paintGroundTile(), paintRoadTile(), paintTreeSprite(0), paintTreeSprite(2)]) {
      expect(c.width).toBe(c.height)
      expect(c.width).toBeGreaterThanOrEqual(256)
    }
  })
})
