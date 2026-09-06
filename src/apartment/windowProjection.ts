/**
 * windowProjection.ts — how far a window assembly sticks INTO the room.
 *
 * `apartment/Window.tsx` builds a window as three interior-facing layers, all
 * positioned in the window's own frame whose origin is the host wall's
 * **centre-line** and whose local +Z points into the room:
 *
 *  - the FRAME bars, a `FRAME_D`-deep box centred on the centre-line;
 *  - the GRILLE / mullion bars, a group offset `GRILLE_Z` in front of the glass;
 *  - the interior SILL LEDGE, a `SILL_LEDGE_D`-deep box centred `SILL_LEDGE_Z`
 *    in front of the centre-line — the deepest of the three by a wide margin.
 *
 * Anything that has to hang CLEAR of a window (curtains, blinds) needs the
 * distance those layers project past the wall's interior FACE, which depends on
 * the host wall thickness. That derivation lives here — one pure module both the
 * renderer and `furniture/placement/` import — so the placement maths can never
 * drift from the geometry it is clearing (the pre-`curtainFlush` standoff
 * duplicated "~0.14" as a comment in three files).
 *
 * Pure numbers only (no three/React), so it unit-tests headlessly.
 */

import { GRILLE_BAR_D } from '../floorplan/windowGrilleLayout'

/** Window frame bar depth (m), across the wall, centred on the wall centre-line. */
export const WINDOW_FRAME_DEPTH = 0.08
/** Interior offset (m) of the grille/mullion group from the wall centre-line. */
export const WINDOW_GRILLE_Z = 0.05
/** Interior sill ledge depth (m), across the wall. */
export const WINDOW_SILL_LEDGE_DEPTH = 0.16
/** Interior sill ledge centre (m) in front of the wall centre-line. */
export const WINDOW_SILL_LEDGE_Z = 0.06

/** How far (m) a layer whose box is centred `centreZ` from the wall centre-line
 *  and `depth` deep reaches past the interior face of a `wallThickness` wall.
 *  Never negative — a layer buried inside the wall projects 0. */
function projection(centreZ: number, depth: number, wallThickness: number): number {
  return Math.max(0, centreZ + depth / 2 - Math.max(0, wallThickness) / 2)
}

/** How far (m) the interior SILL LEDGE reaches past the wall's interior face.
 *  0.04 on the default flat's 0.2 m external walls; 0.09 on a 0.1 m internal one. */
export function windowSillProjection(wallThickness: number): number {
  return projection(WINDOW_SILL_LEDGE_Z, WINDOW_SILL_LEDGE_DEPTH, wallThickness)
}

/**
 * The DEEPEST interior projection (m) of the whole window assembly past the
 * wall's interior face — the sill ledge, the grille bars or the frame,
 * whichever reaches furthest. This is the number a curtain has to clear.
 */
export function windowInteriorProjection(wallThickness: number): number {
  return Math.max(
    windowSillProjection(wallThickness),
    projection(WINDOW_GRILLE_Z, GRILLE_BAR_D, wallThickness),
    projection(0, WINDOW_FRAME_DEPTH, wallThickness),
  )
}
