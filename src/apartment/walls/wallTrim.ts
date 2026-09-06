/**
 * Wall trim dimensions + the ORBIT-CLEAN-CUT section-cap box math.
 *
 * The skirting/crown sizes used to live inside `WallSegment.tsx`; they moved here so the
 * section-cap geometry can be derived from them (and unit-tested) without importing a component.
 */

export const BASEBOARD_H = 0.09
/** Crown molding height (matches skirting board proportions). */
export const CROWN_H = 0.07
/** Crown molding thickness (proud of wall face). */
export const CROWN_T = 0.016
/** Gap between the wall face and the crown's inner face. */
export const CROWN_STANDOFF = 0.004
/** How far the crown reaches beyond the wall's body face: standoff + half its thickness. */
export const CROWN_PROUD = CROWN_STANDOFF + CROWN_T / 2

/** How far the interior FACE PLANE sits proud of the body (`FACE_OFFSET`), plus a hair so the
 *  cap's skirt clears it rather than sitting coplanar with its top edge. */
export const FACE_PROUD = 0.0015

/** Thickness of the section cap slab (metres). Thin enough to read as a cut, thick enough to
 *  swallow the crown's top bevel and the face plane's top edge. */
export const SECTION_CAP_H = 0.004
/** How far the cap's top surface sits above the wall top, so it is never coplanar with the body
 *  cap / crown top it replaces. Sub-millimetre: invisible, but decisive for the depth test. */
export const SECTION_CAP_LIFT = 0.0006

export interface SectionCapBox {
  /** Along-axis length (local X). */
  length: number
  /** Height (local Y). */
  height: number
  /** Thickness-axis depth (local Z). */
  depth: number
  /** Centre in the wall's local frame (X centred on the wall midpoint, Y from the floor). */
  center: [number, number, number]
}

export interface SectionCapInput {
  /** Wall centre-line length (metres). */
  length: number
  /** Wall body thickness (metres). */
  thickness: number
  /** Height of the wall top (metres above the floor). */
  wallTop: number
  /** Thickness of the wall this one abuts at its START, or 0 for a free end. */
  startNeighborThickness: number
  /** Thickness of the wall this one abuts at its END, or 0 for a free end. */
  endNeighborThickness: number
  /** Does the local +Z face carry a crown molding at the ceiling? */
  crownPositive: boolean
  /** Does the local −Z face carry a crown molding at the ceiling? */
  crownNegative: boolean
}

/**
 * The ORBIT-CLEAN-CUT section cap: one thin slab laid over a wall's whole top so the orbit
 * dollhouse sees a SINGLE section-cut tone instead of the three parallel bands the stack of
 * (body cap · crown top · face-plane top edge) produces.
 *
 * Two rules do all the work:
 *
 *  - **Cover everything proud of the body.** Each side reaches `thickness/2 + CROWN_PROUD` when
 *    that side carries a crown, and `thickness/2 + FACE_PROUD` when it only carries the 1 mm
 *    face plane — so the slab never overhangs a bare exterior face by a crown's width.
 *  - **Cross the junction.** At any abutted end (a mitred L-corner *or* a T-junction) the slab
 *    runs `tNeighbour/2 + proud` past the wall's endpoint: past the neighbour's centre-line, past
 *    its far face, and past its far crown. That is what closes the T-junction sliver — the
 *    abutting wall's body retracts to the through wall's near face, leaving the through wall's
 *    proud face plane and crown standing over an uncapped strip. Free ends extend by nothing.
 *
 * Two caps that overlap at a corner are harmless: they are the same colour, the same material and
 * the same up-facing normal, so a depth tie between them resolves to an identical pixel.
 */
export function sectionCapBox({
  length,
  thickness,
  wallTop,
  startNeighborThickness,
  endNeighborThickness,
  crownPositive,
  crownNegative,
}: SectionCapInput): SectionCapBox {
  const proudPos = crownPositive ? CROWN_PROUD : FACE_PROUD
  const proudNeg = crownNegative ? CROWN_PROUD : FACE_PROUD
  // The along-axis reach has to clear whichever side of the NEIGHBOUR stands proudest, and the
  // cap is one slab per wall, so take the larger of this wall's two.
  const proudAlong = Math.max(proudPos, proudNeg)
  const ext = (nbThickness: number) => (nbThickness > 0 ? nbThickness / 2 + proudAlong : 0)
  const x0 = -length / 2 - ext(startNeighborThickness)
  const x1 = length / 2 + ext(endNeighborThickness)
  const zPos = thickness / 2 + proudPos
  const zNeg = thickness / 2 + proudNeg
  return {
    length: x1 - x0,
    height: SECTION_CAP_H,
    depth: zPos + zNeg,
    center: [(x0 + x1) / 2, wallTop + SECTION_CAP_LIFT - SECTION_CAP_H / 2, (zPos - zNeg) / 2],
  }
}
