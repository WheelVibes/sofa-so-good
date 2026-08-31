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

/**
 * The metalness a surface should actually render with, given what it ASKED for
 * and whether there is an environment to reflect. Pure, so the rule lives in one
 * place and is unit-testable.
 */
export function effectiveMetalness(requested: number, iblActive: boolean = active): number {
  return iblActive ? requested : Math.min(requested, NO_IBL_METALNESS)
}

/** Minimal shape this module needs from a three material. */
interface CappableMaterial {
  metalness: number
}

/**
 * Materials whose metalness must be re-derived when the IBL state changes
 * (IBL-CAP-LIVE).
 *
 * The cap used to be applied ONCE, inside each material factory, at creation
 * time — and nothing re-applied it afterwards. That was correct only while the
 * render tier was static. It is not: TIER-ADAPTIVE walks the ladder at RUNTIME
 * (boot at `medium`, promote to `high`, demote to `performance` on weak
 * hardware), so a material built with IBL on outlives that state the moment the
 * ladder demotes. Measured on the default flat: at `performance` the wardrobes'
 * sliding-door frame panels sat at metalness **0.75** — fully uncapped, with no
 * environment to reflect, which is exactly the black-slab defect
 * `NO_IBL_METALNESS` exists to prevent — while the door pull, which reaches three
 * through the SUBSCRIBING `MetalMaterial` component, was correctly at 0.25.
 * Scene-wide at `performance`: 69 meshes across 15 material kinds above the cap.
 *
 * Held as WEAK references and pruned on every sweep, because these materials live
 * in an LRU cache that disposes evicted entries — a strong Set here would pin
 * every material ever built for the life of the page.
 */
const cappable = new Set<{ ref: WeakRef<CappableMaterial>; requested: number }>()

/**
 * Apply the cap now and keep the material in step with later IBL changes. Call
 * from any factory that bakes a metalness value; pass what the caller ASKED for,
 * not the capped result, or a later promotion cannot restore it.
 */
export function registerCappedMetal<T extends CappableMaterial>(material: T, requested: number): T {
  material.metalness = effectiveMetalness(requested)
  cappable.add({ ref: new WeakRef(material), requested })
  return material
}

function reapplyCaps(): void {
  for (const entry of cappable) {
    const m = entry.ref.deref()
    if (!m) {
      cappable.delete(entry)
      continue
    }
    m.metalness = effectiveMetalness(entry.requested)
  }
}

/** Set by `SceneEnvironment` / the store whenever the tier's IBL state changes. */
export function setIblActive(next: boolean): void {
  if (active === next) return
  active = next
  reapplyCaps()
  for (const l of listeners) l()
}

/** Test seam: how many live capped materials are tracked. */
export function cappedMetalCount(): number {
  let n = 0
  for (const entry of cappable) {
    if (entry.ref.deref()) n++
    else cappable.delete(entry)
  }
  return n
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
