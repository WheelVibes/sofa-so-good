/**
 * The equirect→cube resample. Tested on ROUND-TRIP consistency against `skyGradient.ts`'s own
 * `equirectDir`, because the failure mode that matters is a backdrop that is sharp and pointing the
 * wrong way — which looks like success to any numeric probe and like nonsense out of the window.
 */
import { describe, expect, it } from 'vitest'
import { cubeFaceDir, dirToEquirectUv, equirectToCubeFaces, type Rgba } from './equirectToCube'
import { equirectDir } from './lighting/skyGradient'

describe('cubeFaceDir', () => {
  it('returns unit vectors', () => {
    for (let f = 0; f < 6; f += 1)
      for (const [s, t] of [
        [0.5, 0.5],
        [0, 0],
        [1, 1],
      ])
        expect(Math.hypot(...cubeFaceDir(f, s!, t!))).toBeCloseTo(1, 10)
  })

  it('points each face centre along its own axis', () => {
    const axes: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]
    axes.forEach((axis, f) => {
      const d = cubeFaceDir(f, 0.5, 0.5)
      expect(d[0]).toBeCloseTo(axis[0], 6)
      expect(d[1]).toBeCloseTo(axis[1], 6)
      expect(d[2]).toBeCloseTo(axis[2], 6)
    })
  })
})

describe('dirToEquirectUv', () => {
  it('ROUND-TRIPS against skyGradient.equirectDir, which owns the convention', () => {
    // The one assertion that catches a mirrored or rotated backdrop. `equirectDir(col, row, w, h)`
    // maps a pixel to a direction; this maps a direction back to normalised uv.
    const w = 64
    const h = 32
    for (const [col, row] of [
      [0, 8],
      [16, 16],
      [33, 5],
      [63, 24],
    ]) {
      // `equirectDir` adds the half-texel itself (`(col + 0.5) / w`), so passing `col + 0.5`
      // double-counts it -- which is what the first version of this test did, and it read as a
      // bug in the module rather than in the test.
      const d = equirectDir(col!, row!, w, h)
      const [u, v] = dirToEquirectUv(d)
      expect(u * w, `col ${col}`).toBeCloseTo(col! + 0.5, 3)
      expect(v * h, `row ${row}`).toBeCloseTo(row! + 0.5, 3)
    }
  })
})

describe('equirectToCubeFaces', () => {
  /** A source whose red channel encodes column and green encodes row. */
  const ramp = (w: number, h: number): Rgba => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4
        data[o] = Math.round((255 * x) / (w - 1))
        data[o + 1] = Math.round((255 * y) / (h - 1))
        data[o + 3] = 255
      }
    return { width: w, height: h, data }
  }

  it('produces six square faces of the requested size', () => {
    const faces = equirectToCubeFaces(ramp(64, 32), 16)
    expect(faces).toHaveLength(6)
    for (const f of faces) {
      expect(f.width).toBe(16)
      expect(f.height).toBe(16)
      expect(f.data).toHaveLength(16 * 16 * 4)
    }
  })

  it('puts the +Y face at the top of the source and -Y at the bottom', () => {
    // Green encodes source row, so the up face must sample row ~0 and the down face row ~h-1.
    const faces = equirectToCubeFaces(ramp(64, 32), 8)
    const centre = (f: Rgba) => f.data[(4 * 8 + 4) * 4 + 1]!
    expect(centre(faces[2]!)).toBeLessThan(40) // +Y -> top rows
    expect(centre(faces[3]!)).toBeGreaterThan(215) // -Y -> bottom rows
  })

  it('is opaque everywhere, so a face cannot render as a hole', () => {
    const faces = equirectToCubeFaces(ramp(32, 16), 8)
    for (const f of faces) for (let i = 3; i < f.data.length; i += 4) expect(f.data[i]).toBe(255)
  })
})
