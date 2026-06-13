import { describe, expect, it } from 'vitest'
import {
  buildHillBands,
  buildingWindows,
  buildSkylineBuildings,
  buildTreeline,
  EQUIRECT_H,
  EQUIRECT_W,
  HORIZON_Y,
  hillRidgeY,
} from './backdropHorizon'

describe('equirect dimensions', () => {
  it('is a 2:1 panorama with the horizon at its vertical centre', () => {
    expect(EQUIRECT_W).toBe(EQUIRECT_H * 2)
    expect(HORIZON_Y).toBe(EQUIRECT_H / 2)
  })
})

describe('buildSkylineBuildings', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(buildSkylineBuildings(42)).toEqual(buildSkylineBuildings(42))
    expect(buildSkylineBuildings(1)).not.toEqual(buildSkylineBuildings(2))
  })

  it('keeps every building above the horizon with positive width', () => {
    for (const b of buildSkylineBuildings()) {
      expect(b.w).toBeGreaterThan(0)
      expect(b.top).toBeGreaterThanOrEqual(0)
      expect(b.top).toBeLessThan(HORIZON_Y)
    }
  })

  it('spans the full width and seam-wraps crossing buildings so it tiles', () => {
    const blocks = buildSkylineBuildings()
    expect(Math.min(...blocks.map((b) => b.x))).toBeLessThanOrEqual(0)
    expect(Math.max(...blocks.map((b) => b.x + b.w))).toBeGreaterThanOrEqual(EQUIRECT_W)
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

  it('lights more windows as litScale rises (dusk)', () => {
    const blocks = buildSkylineBuildings(3)
    const total = (scale: number) =>
      blocks.reduce((n, b) => n + buildingWindows(b, scale).length, 0)
    expect(total(3)).toBeGreaterThan(total(1))
  })
})

describe('buildTreeline', () => {
  it('covers the full width with positive-radius canopies', () => {
    const trees = buildTreeline()
    expect(trees.length).toBeGreaterThan(0)
    for (const t of trees) expect(t.r).toBeGreaterThan(0)
    expect(Math.min(...trees.map((t) => t.cx - t.r))).toBeLessThanOrEqual(0)
    expect(Math.max(...trees.map((t) => t.cx + t.r))).toBeGreaterThanOrEqual(EQUIRECT_W)
  })
})

describe('buildHillBands / hillRidgeY', () => {
  it('produces ridges that stay above the horizon and tile across the seam', () => {
    for (const band of buildHillBands()) {
      // Seam continuity: the ridge at x=0 equals the ridge at x=EQUIRECT_W
      // (frequencies are integer multiples of 2π/W).
      expect(Math.abs(hillRidgeY(band, 0) - hillRidgeY(band, EQUIRECT_W))).toBeLessThan(1e-6)
      for (let x = 0; x <= EQUIRECT_W; x += 128) {
        expect(hillRidgeY(band, x)).toBeLessThanOrEqual(HORIZON_Y)
      }
    }
  })
})
