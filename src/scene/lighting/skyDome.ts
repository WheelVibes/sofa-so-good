/**
 * SKY-DOME-FAR — the geometry contract between the surround dome and the camera.
 *
 * These two numbers used to live as unrelated literals in three files: `far: 400`
 * in `Scene.tsx`, `far: 400` in `RoomEditorScene.tsx`, and `DOME_RADIUS = 400` in
 * `Sky.tsx` under a comment asserting the radius sat "well inside the camera far
 * plane". It did not — it EQUALLED it, and the dome is centred on the world origin
 * while the camera orbits away from it, so the far side of the sphere fell outside
 * the frustum entirely. Measured on the default flat at the boot pose (camera at
 * 20.8, 10.6, 19.2): dome vertex distances spanned 369.8–430.2 m against `far` 400,
 * with **436 of 825 vertices beyond the far plane**. More than half the surround was
 * clipped away, and because the cut runs through a 32x24 sphere it followed the
 * facet edges — the orbit background rendered as a faceted polygon of sky sitting in
 * a field of page background. `scripts/dev-probes/dome-clip.mjs` measures this.
 *
 * Two changes make the class of bug impossible rather than just moving the number:
 *
 *  1. The dome now FOLLOWS THE CAMERA (`Sky.tsx` copies `camera.position` each
 *     frame). A sky has no parallax anyway, so tracking is the physically right
 *     model — and it means the dome's distance from the camera is EXACTLY its
 *     radius in every direction, at every orbit distance, on every plan. The old
 *     world-anchored dome's distance varied with the camera's dolly, so no fixed
 *     radius could be proven safe by inspection.
 *  2. The far plane is a shared constant both Canvases import, and the radius is
 *     checked against it by {@link domeRadiusIsSafe} in a unit test — so raising
 *     one without the other fails the suite instead of shipping a clipped sky.
 */

/** Camera far plane for both Canvases (main scene + room editor). */
export const SCENE_CAMERA_FAR = 400

/**
 * Radius of the camera-tracking surround dome. Must clear every scene object (the
 * largest shipped plan is ~14 m across, and the orbit camera stays within tens of
 * metres of it) while staying comfortably inside {@link SCENE_CAMERA_FAR}.
 */
export const SKY_DOME_RADIUS = 200

/**
 * Fraction of the far plane a camera-tracking dome may occupy. Half would be enough
 * arithmetically; the margin exists so a later far-plane reduction doesn't silently
 * land the dome on the boundary, where depth precision is worst.
 */
export const DOME_FAR_MARGIN = 0.75

/**
 * Is a camera-tracking dome of `radius` safely inside a frustum of depth `far`?
 * Pure so the shipped pair — and the pair that shipped the bug — can both be
 * asserted in a test.
 */
export function domeRadiusIsSafe(radius: number, far: number): boolean {
  if (!Number.isFinite(radius) || !Number.isFinite(far)) return false
  if (radius <= 0 || far <= 0) return false
  return radius <= far * DOME_FAR_MARGIN
}
