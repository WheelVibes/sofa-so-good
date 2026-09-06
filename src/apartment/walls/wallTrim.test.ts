import { describe, expect, it } from 'vitest'
import {
  CROWN_PROUD,
  CROWN_STANDOFF,
  CROWN_T,
  FACE_PROUD,
  SECTION_CAP_H,
  SECTION_CAP_LIFT,
  sectionCapBox,
} from './wallTrim'

const base = {
  length: 4,
  thickness: 0.1,
  wallTop: 2.8,
  startNeighborThickness: 0,
  endNeighborThickness: 0,
  crownPositive: true,
  crownNegative: true,
}

describe('sectionCapBox (ORBIT-CLEAN-CUT)', () => {
  it('derives the crown reach from the crown geometry it has to cover', () => {
    expect(CROWN_PROUD).toBeCloseTo(CROWN_STANDOFF + CROWN_T / 2, 12)
  })

  it('covers both crowns across the thickness and stays centred on the wall', () => {
    const cap = sectionCapBox(base)
    expect(cap.depth).toBeCloseTo(0.1 + 2 * CROWN_PROUD, 12)
    expect(cap.center[2]).toBeCloseTo(0, 12)
  })

  it('sits its top a hair above the wall top so nothing is coplanar with it', () => {
    const cap = sectionCapBox(base)
    expect(cap.height).toBe(SECTION_CAP_H)
    const top = cap.center[1] + cap.height / 2
    expect(top).toBeCloseTo(2.8 + SECTION_CAP_LIFT, 12)
    // …and its underside reaches down INTO the body/crown it replaces.
    expect(cap.center[1] - cap.height / 2).toBeLessThan(2.8)
  })

  it('does not overhang a bare face by a crown width', () => {
    // An exterior wall's outward side carries no crown, only the 1 mm face plane.
    const cap = sectionCapBox({ ...base, crownNegative: false })
    expect(cap.depth).toBeCloseTo(0.1 + CROWN_PROUD + FACE_PROUD, 12)
    // Asymmetric, so the box shifts toward the crowned side.
    expect(cap.center[2]).toBeCloseTo((CROWN_PROUD - FACE_PROUD) / 2, 12)
  })

  it('leaves a free end unextended', () => {
    const cap = sectionCapBox(base)
    expect(cap.length).toBeCloseTo(4, 12)
    expect(cap.center[0]).toBeCloseTo(0, 12)
  })

  it('crosses a T-junction past the through wall’s far crown', () => {
    // The abutting wall's endpoint sits on the 300 mm through wall's CENTRE-LINE; its own body
    // retracts to the near face, and the through wall's face plane + crown stand proud over the
    // strip that left uncapped. The cap has to reach the far crown's outer edge.
    const cap = sectionCapBox({ ...base, endNeighborThickness: 0.3 })
    const farEdge = cap.center[0] + cap.length / 2
    expect(farEdge).toBeCloseTo(2 + 0.15 + CROWN_PROUD, 12)
  })

  it('reaches the outer corner (plus crown) at a mitred L-corner, both ends', () => {
    const cap = sectionCapBox({
      ...base,
      startNeighborThickness: 0.1,
      endNeighborThickness: 0.1,
    })
    expect(cap.length).toBeCloseTo(4 + 2 * (0.05 + CROWN_PROUD), 12)
    expect(cap.center[0]).toBeCloseTo(0, 12)
  })

  it('uses the proudest of the two sides for the along-axis reach', () => {
    // One crowned side is enough: the neighbour's crown may be on either of ITS faces.
    const cap = sectionCapBox({ ...base, crownNegative: false, endNeighborThickness: 0.1 })
    expect(cap.center[0] + cap.length / 2).toBeCloseTo(2 + 0.05 + CROWN_PROUD, 12)
  })

  it('shrinks to the face plane when crown molding is off entirely', () => {
    const cap = sectionCapBox({
      ...base,
      crownPositive: false,
      crownNegative: false,
      endNeighborThickness: 0.1,
    })
    expect(cap.depth).toBeCloseTo(0.1 + 2 * FACE_PROUD, 12)
    expect(cap.center[0] + cap.length / 2).toBeCloseTo(2 + 0.05 + FACE_PROUD, 12)
  })
})
