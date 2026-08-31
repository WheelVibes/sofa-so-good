/**
 * Module-level "is the photographic look active" signal (PHOTO-FILL-SIGNAL).
 *
 * The material factories (`materials/furnitureMaterials.ts`) are plain functions
 * outside React, and they need the same answer the render path uses: the FEATURE
 * FLAG ships the control, the STORE SETTING is the user's choice, and both must
 * be on. They cannot read the store directly — `look.ts` is deliberately
 * dependency-free and materials importing the UI store would close a cycle — so
 * `Lighting` publishes it here, the same shape as `lighting/fixtureGlow.ts`.
 *
 * Defaults to `false`, which is the shipped look: a material built before
 * `Lighting` mounts is built exactly as it always was, and the weave value is
 * folded into the material cache key, so flipping the setting serves a different
 * cached variant rather than mutating a shared one.
 */
let active = false

/** Publish the resolved state (flag AND setting). Called from `Lighting`. */
export function setPhotographicLook(on: boolean): void {
  active = on
}

/** Is the photographic look on right now? */
export function photographicLookActive(): boolean {
  return active
}
