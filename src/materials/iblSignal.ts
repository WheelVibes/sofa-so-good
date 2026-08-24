/**
 * Whether the active render tier provides image-based lighting.
 *
 * A module-level signal rather than a store read, deliberately: the material
 * factories are imported by unit tests that mock `features/featureFlags`, and
 * importing the Zustand store here drags `resolveFlags` into those mocks and
 * breaks them. This mirrors `proceduralSwapSignal` — the scene pushes state
 * down, the pure material layer never reaches up.
 *
 * Why materials care: a fully metallic PBR surface has no diffuse term, so with
 * `scene.environment === null` it has nothing to reflect and renders BLACK.
 * `getMetalMaterial` caps metalness while this is false (see NO_IBL_METALNESS).
 */
/**
 * Metalness ceiling to use when there is no environment to reflect.
 *
 * A highly metallic surface has no diffuse term, so with `scene.environment ===
 * null` it renders BLACK (or flat grey against ambient) and loses its albedo
 * entirely — this is what made the default kitchen read as a grey box (Chrome
 * audit 2026-08). Capping metalness lets the base colour / albedo texture carry
 * the look while keeping a little sheen. Shared by `furnitureMaterials`'
 * procedural metal presets and `cache.ts`'s scanned `metalnessMap` binding.
 */
export const NO_IBL_METALNESS = 0.25

let active = true

const listeners = new Set<() => void>()

/** Set by `SceneEnvironment` / the store whenever the tier's IBL state changes. */
export function setIblActive(next: boolean): void {
  if (active === next) return
  active = next
  for (const l of listeners) l()
}

/** Subscribe to IBL-state changes (for `useSyncExternalStore`). */
export function subscribeIbl(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when metals have an environment to reflect. Defaults true (physically correct);
 *  the app pushes the real tier state at store init — see `uiSlice`. */
export function isIblActive(): boolean {
  return active
}
