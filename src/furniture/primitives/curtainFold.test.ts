import { describe, expect, it } from 'vitest'
import { curtainFoldZ } from './Curtain'

const H = 2.75
const DEPTH = 0.05

describe('curtainFoldZ — drapery that is not an extrusion', () => {
  it('is NOT the same cross-section at every height', () => {
    // The defect: the old profile had no `y` term at all, so the panel was a
    // literal extrusion and rendered as flat parallel ribbons.
    const atRod = []
    const atHem = []
    for (let i = 0; i <= 40; i++) {
      const x = -0.5 + i / 40
      atRod.push(curtainFoldZ(x, H, H))
      atHem.push(curtainFoldZ(x, 0, H))
    }
    // Normalise out the deliberate taper — what must differ is the SHAPE.
    const norm = (a: number[]) => {
      const peak = Math.max(...a.map(Math.abs))
      return a.map((v) => v / (peak || 1))
    }
    const a = norm(atRod)
    const b = norm(atHem)
    const maxDiff = Math.max(...a.map((v, i) => Math.abs(v - b[i])))
    expect(maxDiff).toBeGreaterThan(0.15)
  })

  it('is pinned at the rod — no drift where the pleats are fixed', () => {
    // At the rod the phase drift must vanish, or the fabric would slide along
    // the track it is hung from.
    const u = (x: number) => (x + 0.5) * 6 * Math.PI * 2
    for (const x of [-0.4, -0.1, 0.2, 0.45]) {
      const amp = 1 + 0.18 * Math.sin(u(x) * 0.5 + 1.3)
      expect(curtainFoldZ(x, H, H)).toBeCloseTo(DEPTH * amp * 0.5 * Math.sin(u(x)), 6)
    }
  })

  it('stays inside the amplitude the window standoff was sized against', () => {
    // A deeper wave would poke the fabric through the window sill.
    let peak = 0
    for (let iy = 0; iy <= 30; iy++) {
      for (let ix = 0; ix <= 120; ix++) {
        peak = Math.max(peak, Math.abs(curtainFoldZ(-0.5 + ix / 120, (iy / 30) * H, H)))
      }
    }
    expect(peak).toBeLessThanOrEqual(DEPTH * 1.2)
  })

  it('is fuller at the hem than at the rod', () => {
    const rms = (y: number) => {
      let s = 0
      for (let i = 0; i <= 120; i++) s += curtainFoldZ(-0.5 + i / 120, y, H) ** 2
      return Math.sqrt(s / 121)
    }
    expect(rms(0)).toBeGreaterThan(rms(H) * 1.4)
  })

  it('survives a degenerate panel height', () => {
    expect(Number.isFinite(curtainFoldZ(0.1, 1, 0))).toBe(true)
    expect(Number.isFinite(curtainFoldZ(0.1, -5, 2))).toBe(true)
  })
})
