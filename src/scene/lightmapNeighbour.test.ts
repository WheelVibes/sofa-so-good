import { describe, expect, it } from 'vitest'
import {
  chooseNeighbourDonor,
  DONOR_MAX_THICKNESS_M,
  NEIGHBOUR_TOL_M,
  type WorldAabb,
} from './lightmapNeighbour'

const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): WorldAabb => ({ min: [x0, y0, z0], max: [x1, y1, z1] })

/** The real bath2 south wall this mechanism was measured on (W4, `constants.ts`): the wall BODY
 *  `wall-int-bath1-acLedge` runs x 1.555..4.655 at z 6.775..6.875, and the narrow face panels
 *  beside `win-bath2-S` sit 1 mm proud of it at z 6.774. */
const BATH2_WALL_BODY = box(1.555, 0, 6.775, 4.655, 2.6, 6.875)

describe('chooseNeighbourDonor', () => {
  it('gives a narrow wall-face panel the wall body it sits on (W4)', () => {
    const panel = box(3.865, 0, 6.774, 3.965, 2.6, 6.774)
    expect(chooseNeighbourDonor(panel, [BATH2_WALL_BODY])).toBe(0)
  })

  it('gives a crown moulding strip the same wall (W14)', () => {
    const crown = box(3.865, 2.53, 6.763, 3.965, 2.6, 6.779)
    expect(chooseNeighbourDonor(crown, [BATH2_WALL_BODY])).toBe(0)
  })

  it('gives a skirting strip the same wall', () => {
    const skirting = box(3.865, 0, 6.76, 3.965, 0.09, 6.778)
    expect(chooseNeighbourDonor(skirting, [BATH2_WALL_BODY])).toBe(0)
  })

  it('refuses a donor thicker than a slab, so furniture never lends its map', () => {
    const wardrobe = box(0, 0, 0, 2, 2.2, 0.6)
    const knob = box(0.9, 1, -0.02, 1.0, 1.1, 0.02)
    expect(wardrobe.max[2] - wardrobe.min[2]).toBeGreaterThan(DONOR_MAX_THICKNESS_M)
    expect(chooseNeighbourDonor(knob, [wardrobe])).toBeNull()
  })

  it('refuses a receiver that leaves the donor by more than the tolerance', () => {
    // A panel on the NEXT wall along: past the donor's far face by more than the tolerance.
    const far = box(3.865, 0, 6.875 + NEIGHBOUR_TOL_M + 0.01, 3.965, 2.6, 7.0)
    expect(chooseNeighbourDonor(far, [BATH2_WALL_BODY])).toBeNull()
  })

  it('picks the TIGHTEST containing donor, not the first', () => {
    const slab = box(0, 0, 0, 10, 0.2, 10)
    const wall = box(3, 0, 0, 4, 0.2, 10)
    const strip = box(3.4, 0.05, 2, 3.6, 0.15, 3)
    expect(chooseNeighbourDonor(strip, [slab, wall])).toBe(1)
    expect(chooseNeighbourDonor(strip, [wall, slab])).toBe(0)
  })

  it('does not let a zero-thickness plane win on volume alone', () => {
    // A coplanar FACE plane and the wall body behind it both contain the strip; the plane's box
    // has zero volume, so without the per-axis floor it would always win — including when it is a
    // plane the receiver is not actually on.
    const wall = box(3, 0, 0, 3.2, 2.6, 2)
    const wholeFloorPlane = box(0, 0, 0, 20, 0, 20)
    const strip = box(3.05, 0, 0.5, 3.15, 0.09, 1.5)
    expect(chooseNeighbourDonor(strip, [wholeFloorPlane, wall])).toBe(1)
  })

  it('returns null with no donors at all', () => {
    expect(chooseNeighbourDonor(box(0, 0, 0, 1, 1, 1), [])).toBeNull()
  })
})
