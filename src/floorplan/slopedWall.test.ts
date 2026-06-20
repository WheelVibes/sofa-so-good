import { describe, expect, it } from 'vitest'
import { isSlopedWall, slopedWallHeights, slopedWallTriangles } from './slopedWall'
import type { PlanWall } from './types'

const flat: PlanWall = { id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal' }
const sloped: PlanWall = { ...flat, topHeight: 2.6, topHeightEnd: 1.4 }

describe('isSlopedWall', () => {
  it('is true only when topHeightEnd is set', () => {
    expect(isSlopedWall(flat)).toBe(false)
    expect(isSlopedWall(sloped)).toBe(true)
  })
})

describe('slopedWallHeights', () => {
  it('defaults the start height to topHeight (or ceiling) and end to topHeightEnd', () => {
    expect(slopedWallHeights(sloped, 2.6)).toEqual([2.6, 1.4])
    expect(slopedWallHeights(flat, 2.6)).toEqual([2.6, 2.6])
    expect(slopedWallHeights({ ...flat, topHeightEnd: 1 }, 3)).toEqual([3, 1])
  })
})

describe('slopedWallTriangles', () => {
  it('emits 12 triangles (36 verts) within the wall height + footprint', () => {
    const tris = slopedWallTriangles(sloped, 2.6)
    expect(tris.length).toBe(36 * 3)
    let maxY = 0
    let minY = Infinity
    for (let i = 1; i < tris.length; i += 3) {
      maxY = Math.max(maxY, tris[i])
      minY = Math.min(minY, tris[i])
    }
    expect(minY).toBeCloseTo(0, 6) // sits on the floor
    expect(maxY).toBeCloseTo(2.6, 6) // peaks at the taller (start) end
  })

  it('honours the resolved thickness for the prism cross-span (BUG-009)', () => {
    // Wall runs along +X, so its half-thickness offsets along Z. With a 0.4 m
    // override the full Z span must be 0.4 (not the 0.1 m internal default).
    const tris = slopedWallTriangles({ ...sloped, thicknessM: 0.4 }, 2.6, 0.4)
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 2; i < tris.length; i += 3) {
      minZ = Math.min(minZ, tris[i])
      maxZ = Math.max(maxZ, tris[i])
    }
    expect(maxZ - minZ).toBeCloseTo(0.4, 6)
  })

  it('falls back to the category default thickness when none is passed', () => {
    // internal wall along +X → 0.1 m default Z span.
    const tris = slopedWallTriangles(sloped, 2.6)
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 2; i < tris.length; i += 3) {
      minZ = Math.min(minZ, tris[i])
      maxZ = Math.max(maxZ, tris[i])
    }
    expect(maxZ - minZ).toBeCloseTo(0.1, 6)
  })

  it('the start end is taller than the end end (the top ramps down)', () => {
    const tris = slopedWallTriangles(sloped, 2.6)
    // Collect top-vertex heights near x≈0 (start) vs x≈4 (end).
    let startTop = 0
    let endTop = 0
    for (let i = 0; i < tris.length; i += 3) {
      const [x, y] = [tris[i], tris[i + 1]]
      if (y > 0.01) {
        if (x < 0.5) startTop = Math.max(startTop, y)
        if (x > 3.5) endTop = Math.max(endTop, y)
      }
    }
    expect(startTop).toBeCloseTo(2.6, 6)
    expect(endTop).toBeCloseTo(1.4, 6)
  })
})
