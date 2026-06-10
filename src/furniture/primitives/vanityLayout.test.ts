import { describe, expect, it } from 'vitest'
import {
  buildVanity,
  MIN_KNEE,
  pedestalWidth,
  VANITY_TABLE_H,
  VANITY_TOP_T,
  type VanityLayoutKind,
  type VanityPart,
} from './vanityLayout'

const LAYOUTS: VanityLayoutKind[] = ['legs', 'single-pedestal', 'double-pedestal']
const EPS = 1e-9

/** All sampled footprints across the catalog's param range. */
const SIZES: [number, number][] = [
  [0.8, 0.35],
  [1.0, 0.42],
  [1.3, 0.5],
  [1.5, 0.5],
]

const left = (p: VanityPart) => p.x - p.w / 2
const right = (p: VanityPart) => p.x + p.w / 2
const bottom = (p: VanityPart) => p.y - p.h / 2
const top = (p: VanityPart) => p.y + p.h / 2
const back = (p: VanityPart) => p.z - p.d / 2
const front = (p: VanityPart) => p.z + p.d / 2

describe('buildVanity', () => {
  it('tabletop spans the footprint with its top face at VANITY_TABLE_H', () => {
    for (const [w, d] of SIZES) {
      for (const layout of LAYOUTS) {
        const b = buildVanity(w, d, layout)
        expect(b.top.w).toBeCloseTo(w, 12)
        expect(b.top.d).toBeCloseTo(d, 12)
        expect(top(b.top)).toBeCloseTo(VANITY_TABLE_H, 12)
      }
    }
  })

  it('every support reaches floor → underside of the top (structural soundness)', () => {
    for (const [w, d] of SIZES) {
      for (const layout of LAYOUTS) {
        const b = buildVanity(w, d, layout)
        expect(b.supports.length).toBeGreaterThan(0)
        for (const s of b.supports) {
          expect(bottom(s), `${layout} ${s.key} floor contact`).toBeCloseTo(0, 12)
          expect(top(s), `${layout} ${s.key} reaches top`).toBeCloseTo(
            VANITY_TABLE_H - VANITY_TOP_T,
            12,
          )
        }
      }
    }
  })

  it('every part stays inside the footprint (x and z)', () => {
    for (const [w, d] of SIZES) {
      for (const layout of LAYOUTS) {
        const b = buildVanity(w, d, layout)
        const parts = [b.top, ...b.supports, ...b.aprons, ...b.drawerFronts]
        for (const p of parts) {
          expect(left(p), `${layout} ${p.key} left`).toBeGreaterThanOrEqual(-w / 2 - EPS)
          expect(right(p), `${layout} ${p.key} right`).toBeLessThanOrEqual(w / 2 + EPS)
          expect(back(p), `${layout} ${p.key} back`).toBeGreaterThanOrEqual(-d / 2 - EPS)
          expect(front(p), `${layout} ${p.key} front`).toBeLessThanOrEqual(d / 2 + EPS)
        }
      }
    }
  })

  it('maps layout → support kinds: 4 legs / pedestal+2 legs / 2 pedestals', () => {
    const [w, d] = [1.0, 0.42]
    expect(buildVanity(w, d, 'legs').supports).toHaveLength(4)

    const single = buildVanity(w, d, 'single-pedestal')
    expect(single.supports.map((s) => s.key)).toEqual(['ped', 'leg-front', 'leg-back'])
    // Pedestal hugs the left edge; the legs sit on the right edge.
    expect(left(single.supports[0])).toBeCloseTo(-w / 2, 12)
    expect(single.supports[1].x).toBeGreaterThan(0)

    const dbl = buildVanity(w, d, 'double-pedestal')
    expect(dbl.supports.map((s) => s.key)).toEqual(['ped-l', 'ped-r'])
    // Pedestals are mirrored about the centre and flush to the side edges.
    expect(dbl.supports[0].x).toBeCloseTo(-dbl.supports[1].x, 12)
    expect(left(dbl.supports[0])).toBeCloseTo(-w / 2, 12)
    expect(right(dbl.supports[1])).toBeCloseTo(w / 2, 12)
  })

  it('drawer counts per layout: 2 apron / 3 pedestal / 7 kneehole', () => {
    const [w, d] = [1.2, 0.42]
    expect(buildVanity(w, d, 'legs').drawerFronts).toHaveLength(2)
    expect(buildVanity(w, d, 'single-pedestal').drawerFronts).toHaveLength(3)
    expect(buildVanity(w, d, 'double-pedestal').drawerFronts).toHaveLength(7)
  })

  it('pedestal drawer fronts stay within their pedestal span and clear the floor', () => {
    for (const [w, d] of SIZES) {
      for (const layout of ['single-pedestal', 'double-pedestal'] as const) {
        const b = buildVanity(w, d, layout)
        const peds = b.supports.filter((s) => s.key.startsWith('ped'))
        for (const f of b.drawerFronts.filter((p) => p.key.startsWith('ped'))) {
          const ped = peds.find((s) => f.key.startsWith(s.key))!
          expect(left(f), `${layout} ${f.key}`).toBeGreaterThanOrEqual(left(ped) - EPS)
          expect(right(f), `${layout} ${f.key}`).toBeLessThanOrEqual(right(ped) + EPS)
          expect(bottom(f), `${layout} ${f.key}`).toBeGreaterThan(0)
          expect(top(f), `${layout} ${f.key}`).toBeLessThanOrEqual(
            VANITY_TABLE_H - VANITY_TOP_T + EPS,
          )
          // The front is backed flush against (not floating off) the carcass face.
          expect(back(f), `${layout} ${f.key} flush`).toBeCloseTo(front(ped), 12)
        }
      }
    }
  })

  it('apron drawer fronts are backed flush against the apron', () => {
    for (const [w, d] of SIZES) {
      for (const layout of ['legs', 'double-pedestal'] as const) {
        const b = buildVanity(w, d, layout)
        const apron = b.aprons[0]
        expect(apron).toBeDefined()
        // Aprons attach to the underside of the top (no gap).
        expect(top(apron)).toBeCloseTo(VANITY_TABLE_H - VANITY_TOP_T, 12)
        for (const f of b.drawerFronts.filter((p) => p.key.startsWith('apron'))) {
          expect(back(f), `${layout} ${f.key}`).toBeCloseTo(front(apron), 12)
        }
      }
    }
  })

  it('double-pedestal preserves a usable knee space across the width range', () => {
    for (const w of [0.8, 1.0, 1.2, 1.5]) {
      const b = buildVanity(w, 0.42, 'double-pedestal')
      expect(b.kneeWidth, `width ${w}`).toBeGreaterThanOrEqual(MIN_KNEE - EPS)
      // Knee space = footprint minus both pedestals.
      expect(b.kneeWidth).toBeCloseTo(w - 2 * pedestalWidth(w, 'double-pedestal'), 12)
    }
  })

  it('pedestalWidth caps so pedestals never collide or exceed the footprint', () => {
    for (const w of [0.8, 1.0, 1.5]) {
      expect(pedestalWidth(w, 'single-pedestal')).toBeLessThan(w)
      expect(2 * pedestalWidth(w, 'double-pedestal')).toBeLessThan(w)
    }
  })
})
