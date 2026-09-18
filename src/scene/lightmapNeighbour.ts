/**
 * LIGHTMAP-NEIGHBOUR-INHERIT — which BAKED mesh an UNMAPPED shell mesh should borrow its
 * irradiance from.
 *
 * **The defect this fixes, and it is one defect wearing two faces.** A mapped surface renders
 * `visAnalytic * visNight + max( visLit, visAnalytic * visSpill )` (`visibilityLightmap.ts`); an
 * unmapped one is never patched at all and renders the WHOLE analytic fill. In a bright room those
 * two are close; in a dark one they are not, and every boundary between them is a hard step:
 *
 * | measured, phone Metal, 13:00 lights off | unmapped | mapped |
 * | --- | --- | --- |
 * | bath2 south wall either side of x = 4.655 (**W4**) | 124.1 | 8.2 |
 * | wall-head joint against the wall below it (**W14**) | ~160 | ~1 |
 *
 * Both boundaries are the SAME mechanism. `bake_material.py --min-area` (1.0 m² on the shipped
 * set) skips a small mesh, and `applyVisibilityLightmaps.ts:MIN_SPAN_M` (1.5 m) skips it again on
 * the app side — so the 0.09 m and 0.6 m wall-face panels either side of the bath2 window, and
 * every 70 mm crown moulding and 90 mm skirting strip in the flat, carry no map while the wall
 * they sit on does. The seam is dead straight and lands where no geometry changes because it is a
 * MESH boundary, not a shading one.
 *
 * **The fix is to give the receiver its host's map at its own place on that host**, rather than to
 * bake hundreds of extra sub-square-metre maps. Geometrically that is exactly right: a skirting
 * board is a 90 mm-tall strip of the wall behind it and receives what that strip of wall receives.
 *
 * This module is the DONOR CHOICE only — pure, dependency-free (no three, no store), so the rule
 * can be unit-tested on boxes. `applyVisibilityLightmaps.ts` does the transform and the UV build
 * through `lightmapUv.ts:computeBoxAtlasUv`'s `bounds` option.
 */

/** A world-space axis-aligned box. Flat triples so a caller can pass a `Box3`'s parts without
 *  this module importing three. */
export interface WorldAabb {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
}

/**
 * How far outside a donor's own box a receiver may sit and still count as ON it, in metres.
 *
 * A wall FACE plane is modelled 1 mm proud of the wall body it paints, a skirting board stands
 * ~14 mm off it and a crown moulding ~16 mm; 60 mm covers all of them with room for a mitre
 * overhang, and is small enough that it cannot reach across a room to an unrelated wall.
 */
export const NEIGHBOUR_TOL_M = 0.06

/**
 * The thickest a donor may be, in metres, measured on its SHORTEST world axis.
 *
 * **This is the whole safety argument, so it is a gate and not a preference.** Without it a
 * receiver would match any mapped mesh whose box happens to contain it — and a room-sized piece of
 * furniture contains the objects standing on it, so a teapot would inherit a sideboard's wall
 * irradiance. A shell wall is 0.1–0.3 m thick and a floor/ceiling plane is 0 m, so every surface
 * this mechanism is FOR passes; a cabinet, a sofa or a bed does not. 0.45 leaves headroom above
 * the 0.3 m RC walls of the household shelter without admitting a carcass.
 */
export const DONOR_MAX_THICKNESS_M = 0.45

/** Half-open span test with the tolerance applied to the DONOR, not the receiver. */
function containedIn(receiver: WorldAabb, donor: WorldAabb, tol: number): boolean {
  for (let k = 0; k < 3; k += 1) {
    if (receiver.min[k] < donor.min[k] - tol) return false
    if (receiver.max[k] > donor.max[k] + tol) return false
  }
  return true
}

/**
 * How big a donor is, for "smallest wins" — with each axis floored at the tolerance.
 *
 * A wall FACE plane has zero thickness and would otherwise score 0 and beat every box, including
 * the one plane that is not coplanar with the receiver. Flooring each axis at `tol` compares the
 * donors at the resolution the containment test already works to.
 */
function donorScore(d: WorldAabb, tol: number): number {
  let v = 1
  for (let k = 0; k < 3; k += 1) v *= Math.max(d.max[k] - d.min[k], tol)
  return v
}

/**
 * Pick the baked mesh an unmapped mesh should borrow from, or `null` for none.
 *
 * Returns an INDEX into `donors` rather than the entry, so the caller can carry whatever it likes
 * alongside each donor (texture, gain, matrices) without this module knowing about any of it.
 *
 * The rule, in order:
 * 1. the donor must be slab-like ({@link DONOR_MAX_THICKNESS_M}) — see that constant for why this
 *    is what keeps furniture out;
 * 2. the receiver's box must sit inside the donor's, dilated by {@link NEIGHBOUR_TOL_M};
 * 3. of those, the SMALLEST donor wins — the tightest host is the one the receiver is actually on,
 *    and a big floor slab that merely spans the same footprint loses to the wall beneath the
 *    skirting.
 *
 * Deliberately no orientation test: a receiver's faces choose their own atlas slot from their own
 * winding, so a moulding's up-facing top takes the donor's top slot and its room-facing front
 * takes the donor's front slot — which is the correct answer for both, and an orientation filter
 * would only throw away the multi-face receivers.
 */
export function chooseNeighbourDonor(
  receiver: WorldAabb,
  donors: readonly WorldAabb[],
  tol: number = NEIGHBOUR_TOL_M,
  maxThickness: number = DONOR_MAX_THICKNESS_M,
): number | null {
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 0; i < donors.length; i += 1) {
    const d = donors[i]
    const thickness = Math.min(d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2])
    if (thickness > maxThickness) continue
    if (!containedIn(receiver, d, tol)) continue
    const score = donorScore(d, tol)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return best === -1 ? null : best
}
