import { type Box3, BoxGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { applyPlump, plumpBoxGeometry } from './plump'

function bbox(geo: { computeBoundingBox: () => void; boundingBox: Box3 | null }) {
  geo.computeBoundingBox()
  return geo.boundingBox as Box3
}

describe('applyPlump', () => {
  it('is a no-op at amount 0', () => {
    const geo = new BoxGeometry(0.5, 0.15, 0.5, 4, 4, 4)
    const before = geo.getAttribute('position').array.slice()
    applyPlump(geo, 0, [0.5, 0.15, 0.5])
    expect(Array.from(geo.getAttribute('position').array)).toEqual(Array.from(before))
  })

  it('crowns the top so the bulged box is taller than the flat one', () => {
    const flat = new BoxGeometry(0.5, 0.15, 0.5, 8, 8, 8)
    const flatTop = bbox(flat).max.y
    const plumped = new BoxGeometry(0.5, 0.15, 0.5, 8, 8, 8)
    applyPlump(plumped, 1, [0.5, 0.15, 0.5])
    const plumpTop = bbox(plumped).max.y
    expect(plumpTop).toBeGreaterThan(flatTop)
  })

  it('keeps every vertex + recomputed normal finite', () => {
    const geo = new BoxGeometry(0.5, 0.15, 0.5, 8, 8, 8)
    applyPlump(geo, 0.8, [0.5, 0.15, 0.5])
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true)
      expect(Number.isFinite(pos.getY(i))).toBe(true)
      expect(Number.isFinite(pos.getZ(i))).toBe(true)
      const n = new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i))
      expect(Number.isFinite(n.length())).toBe(true)
    }
  })

  it('pins the corners (a corner vertex barely moves)', () => {
    const geo = new BoxGeometry(0.5, 0.15, 0.5, 8, 8, 8)
    // Find a top corner vertex before the bulge.
    const pos0 = geo.getAttribute('position')
    let cornerIdx = -1
    for (let i = 0; i < pos0.count; i++) {
      if (
        Math.abs(pos0.getX(i)) > 0.24 &&
        Math.abs(pos0.getY(i)) > 0.074 &&
        Math.abs(pos0.getZ(i)) > 0.24
      ) {
        cornerIdx = i
        break
      }
    }
    expect(cornerIdx).toBeGreaterThanOrEqual(0)
    const y0 = pos0.getY(cornerIdx)
    applyPlump(geo, 1, [0.5, 0.15, 0.5])
    const y1 = geo.getAttribute('position').getY(cornerIdx)
    expect(Math.abs(y1 - y0)).toBeLessThan(0.01)
  })
})

describe('plumpBoxGeometry', () => {
  it('returns a tessellated, already-plumped box with finite bounds', () => {
    const geo = plumpBoxGeometry(0.5, 0.15, 0.5, 0.02, 0.6)
    const box = bbox(geo)
    expect(box.max.y).toBeGreaterThan(0.075) // crowned above the flat top
    expect(Number.isFinite(box.min.x)).toBe(true)
    expect(geo.getAttribute('position').count).toBeGreaterThan(24)
  })
})
