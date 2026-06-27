/**
 * Pure camera-facing-wall reveal decision, shared by the isolated-room shells
 * (`RoomShell` + `PlanRoomShell`). A clipped wall hides itself when the orbit
 * camera sits on its outward side, so the user always sees *into* the room
 * (the IKEA-planner-style camera-facing wall reveal).
 *
 * Extracted so the per-frame visibility test is headlessly unit-testable and
 * the shells can run it allocation-free (they keep one reusable `Vector2` for
 * the camera direction rather than allocating one per wall per frame).
 */

/** Outward wall normal in the X/Z ground plane (matches three's `Vector2`
 *  field names so a `Vector2` can be passed directly). */
export interface WallNormal {
  x: number
  y: number
}

/** Reveal threshold: a small positive margin so the wall stays visible until
 *  the camera is firmly on its outward side — matches the original inline
 *  `camDir.dot(normal) <= 0.05`. */
export const WALL_FACE_THRESHOLD = 0.05

/**
 * True iff the wall faces *away* from the camera — the camera is on the wall's
 * outward side, so the wall should hide to reveal the room. Mirrors the
 * original inline test `camDir.dot(normal) <= threshold`, where `camDir` is the
 * vector from the wall midpoint to the camera (projected to the ground plane)
 * and `normal` is the wall's outward normal.
 */
export function wallFacesAway(
  camX: number,
  camZ: number,
  midX: number,
  midZ: number,
  normal: WallNormal,
  threshold: number = WALL_FACE_THRESHOLD,
): boolean {
  const dirX = camX - midX
  const dirZ = camZ - midZ
  return dirX * normal.x + dirZ * normal.y <= threshold
}
