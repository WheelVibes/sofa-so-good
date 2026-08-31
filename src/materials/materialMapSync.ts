/**
 * Re-point a CLONED material's texture slots at whatever its source material
 * currently holds (WALL-FACE-CLONE-STALE).
 *
 * `Material.clone()` copies texture slots by REFERENCE at the instant it runs.
 * That is normally fine — but PERF-C makes procedural textures arrive in two
 * stages: `buildMaterial` bakes a cheap `PROCEDURAL_QUICK_PREVIEW_SIZE` (64²)
 * placeholder synchronously, then an OffscreenCanvas worker delivers the real
 * 256²/512² maps ~80 ms later and hot-swaps them onto the CACHED material. A
 * clone taken in that window keeps pointing at the preview textures — which the
 * swap also disposes — and nothing ever refreshes it, because the clone's
 * `useMemo` is keyed on the source material's IDENTITY and that never changes
 * across a swap (only its map fields do).
 *
 * Kept pure and structurally typed (no three.js import) so the copy rule is
 * unit-testable with plain objects, in the spirit of the other pure modules
 * here. The caller owns `needsUpdate` / `invalidate`.
 */

/** The slots `cache.ts`'s worker upgrade replaces. `metalness` is a scalar the
 *  same swap writes, so it rides along — otherwise a cloned face would keep the
 *  placeholder's metalness after an upgrade changed it. */
export const SWAPPABLE_MAP_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'aoMap',
  'metalnessMap',
  'metalness',
] as const

export type SwappableSlots = Partial<Record<(typeof SWAPPABLE_MAP_SLOTS)[number], unknown>>

/**
 * Copy every swappable slot from `source` to `target` that currently differs.
 * Returns true when anything changed, so the caller can skip `needsUpdate` and
 * a demand-mode `invalidate()` in the common no-op case (this runs on EVERY
 * procedural swap, and most swaps are for materials this clone doesn't derive
 * from).
 */
export function syncMaterialMaps(source: SwappableSlots, target: SwappableSlots): boolean {
  let changed = false
  for (const slot of SWAPPABLE_MAP_SLOTS) {
    if (target[slot] === source[slot]) continue
    target[slot] = source[slot]
    changed = true
  }
  return changed
}
