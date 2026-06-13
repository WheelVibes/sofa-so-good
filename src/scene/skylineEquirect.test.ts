import { describe, expect, it } from 'vitest'
import {
  buildingWindows,
  buildSkylineBuildings,
  EQUIRECT_H,
  EQUIRECT_W,
  HORIZON_Y,
} from './skylineEquirect'

describe('buildSkylineBuildings', () => {
  it('is deterministic for a given seed', () => {
    expect(buildSkylineBuildings(42)).toEqual(buildSkylineBuildings(42))
  })

  it('differs across seeds', () => {
    expect(buildSkylineBuildings(1)).not.toEqual(buildSkylineBuildings(2))
  })

  it('keeps every building above the horizon with positive width', () => {
    for (const b of buildSkylineBuildings()) {
      expect(b.w).toBeGreaterThan(0)
      expect(b.top).toBeGreaterThanOrEqual(0)
      expect(b.top).toBeLessThan(HORIZON_Y)
      expect(b.depth === 0 || b.depth === 1).toBe(true)
    }
  })

  it('spans the full equirect width across both depth layers', () => {
    const blocks = buildSkylineBuildings()
    const far = blocks.filter((b) => b.depth === 1)
    const near = blocks.filter((b) => b.depth === 0)
    for (const layer of [far, near]) {
      expect(Math.min(...layer.map((b) => b.x))).toBeLessThanOrEqual(0)
      expect(Math.max(...layer.map((b) => b.x + b.w))).toBeGreaterThanOrEqual(EQUIRECT_W)
    }
  })

  it('duplicates seam-crossing buildings on the opposite edge so it tiles', () => {
    const blocks = buildSkylineBuildings()
    for (const b of blocks) {
      if (b.x + b.w > EQUIRECT_W) {
        expect(
          blocks.some((o) => o.seed === b.seed && Math.abs(o.x - (b.x - EQUIRECT_W)) < 1e-6),
        ).toBe(true)
      }
    }
  })
})

describe('buildingWindows', () => {
  it('keeps lit windows inside the building rect', () => {
    for (const b of buildSkylineBuildings(7)) {
      for (const w of buildingWindows(b)) {
        expect(w.x).toBeGreaterThanOrEqual(b.x)
        expect(w.x + w.w).toBeLessThanOrEqual(b.x + b.w)
        expect(w.y).toBeGreaterThanOrEqual(b.top)
        expect(w.y + w.h).toBeLessThanOrEqual(HORIZON_Y)
      }
    }
  })
})

describe('equirect dimensions', () => {
  it('is a 2:1 panorama with the horizon at its vertical centre', () => {
    expect(EQUIRECT_W).toBe(EQUIRECT_H * 2)
    expect(HORIZON_Y).toBe(EQUIRECT_H / 2)
  })
})
