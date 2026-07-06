import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../types'
import { extrudeWallBody } from './wallBodyGeometry'
import { buildWallBodyOutline } from './wallBodyShape'

/**
 * Mitre geometry (WALL-CORNER-MITER): the extruded body's mitred end is cut to the
 * 45° corner diagonal — the EXTERIOR edge reaches the outer corner (halfLen + t/2),
 * the INTERIOR edge retracts to the inner corner (halfLen − t/2). Two walls meeting
 * at a corner clamp to the SAME diagonal, so their end-faces are exactly coincident
 * (opposite normals → backface-culled → seamless, no z-fight).
 */
describe('extrudeWallBody — mitred end', () => {
  const T = 0.1
  const HALF = 1 // wall length 2 → halfLen 1
  const wall: WallSpec = {
    id: 'w',
    start: [-1, 0],
    end: [1, 0],
    thickness: 'internal',
    cutouts: [],
  }

  // Outline extended at the +X end by t/2 (the mitre abut), then clamped.
  const outline = buildWallBodyOutline(wall, 2.6, 2, 0, T / 2)

  const maxXNear = (
    geo: {
      getAttribute: (n: string) => {
        count: number
        getX: (i: number) => number
        getZ: (i: number) => number
      }
    },
    zSide: number,
  ) => {
    const pos = geo.getAttribute('position')
    let mx = -Infinity
    for (let i = 0; i < pos.count; i++) {
      if (Math.sign(pos.getZ(i)) === zSide && Math.abs(pos.getZ(i)) > T / 4) {
        mx = Math.max(mx, pos.getX(i))
      }
    }
    return mx
  }

  it('endSlope +1: +z edge reaches halfLen+t/2 (long side), −z retracts to halfLen−t/2', () => {
    const geo = extrudeWallBody(outline, T, undefined, { halfLen: HALF, endSlope: 1 })
    expect(maxXNear(geo, 1)).toBeCloseTo(HALF + T / 2) // long side extends
    expect(maxXNear(geo, -1)).toBeCloseTo(HALF - T / 2) // short side retracts
  })

  it('endSlope −1 flips the diagonal (−z is now the long side)', () => {
    const geo = extrudeWallBody(outline, T, undefined, { halfLen: HALF, endSlope: -1 })
    expect(maxXNear(geo, -1)).toBeCloseTo(HALF + T / 2)
    expect(maxXNear(geo, 1)).toBeCloseTo(HALF - T / 2)
  })

  it('leaves the geometry un-mitred (perpendicular end) when no miter is passed', () => {
    const geo = extrudeWallBody(outline, T)
    // Both z sides reach the same (extended) end — a square, perpendicular cap.
    expect(maxXNear(geo, 1)).toBeCloseTo(HALF + T / 2)
    expect(maxXNear(geo, -1)).toBeCloseTo(HALF + T / 2)
  })
})
