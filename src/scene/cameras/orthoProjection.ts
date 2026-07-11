/**
 * Perspective ↔ orthographic scale bridge (R3-FEAT-3, parallel-projection toggle).
 *
 * A drei `<OrthographicCamera>` whose frustum spans the canvas in *pixels* (its
 * default when `left`/`right`/… are unset) renders one world unit as `zoom`
 * pixels — so a world height `H` fills `zoom · H` pixels. A perspective camera at
 * distance `d` from the pivot shows a world height of `2 · d · tan(fov/2)` across
 * the viewport's `H_px` pixels. Matching the on-screen scale at the pivot when we
 * swap projection therefore needs
 *
 *   zoom = H_px / (2 · d · tan(fov/2))
 *
 * `orthoZoomForPerspective` and `perspectiveDistanceForOrthoZoom` are exact
 * inverses so toggling projection (either way) preserves the framing with no
 * zoom jump. Pure + dependency-free (no three.js) so the toggle logic in
 * `OrbitCamera.tsx` stays unit-testable — mirrors `frameSelection.ts`.
 */

/** Clamp the returned ortho zoom to a sane range so a degenerate distance/fov
 *  can never produce a 0 / Infinity zoom that blanks the frustum. */
export const ORTHO_MIN_ZOOM = 0.01
export const ORTHO_MAX_ZOOM = 1000

/** Orthographic `zoom` that reproduces a perspective camera's on-screen scale at
 *  the pivot (distance `d`, vertical FOV in radians, viewport height in pixels). */
export function orthoZoomForPerspective(
  distance: number,
  fovRad: number,
  viewportHeightPx: number,
): number {
  const d = Math.max(distance, 1e-3)
  const h = Math.max(viewportHeightPx, 1)
  const t = Math.tan(fovRad / 2)
  if (!(t > 0)) return 1
  const zoom = h / (2 * d * t)
  return Math.min(ORTHO_MAX_ZOOM, Math.max(ORTHO_MIN_ZOOM, zoom))
}

/** Inverse of `orthoZoomForPerspective`: the perspective camera distance that
 *  reproduces an orthographic `zoom`'s on-screen scale — used to reposition the
 *  perspective camera along its view direction when switching back, so a
 *  zoomed-in ortho view maps to an equally-close perspective view. */
export function perspectiveDistanceForOrthoZoom(
  zoom: number,
  fovRad: number,
  viewportHeightPx: number,
): number {
  const z = Math.max(zoom, ORTHO_MIN_ZOOM)
  const h = Math.max(viewportHeightPx, 1)
  const t = Math.tan(fovRad / 2)
  if (!(t > 0)) return 1
  return h / (2 * z * t)
}
