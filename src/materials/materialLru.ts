/**
 * A tiny bounded LRU map for the in-memory furniture material / texture caches
 * (AUD-002). The furniture caches in `furnitureMaterials.ts` key entries on free
 * hex colours + cloned textures, so without a bound they grow unboundedly over a
 * session and VRAM ratchets upward (every cached `MeshStandardMaterial` owns its
 * own cloned `map`/`normalMap`/`roughnessMap`).
 *
 * Disposal safety — why this is an LRU, not eager dispose:
 *   The furniture material getters are called *inline during React render* and
 *   the returned material is handed straight to a mounted `<mesh material={…}>`.
 *   A mounted mesh therefore holds a live reference to whatever the cache last
 *   returned for its key. Disposing an entry that is still assigned to a mounted
 *   mesh would break that mesh's GPU material mid-frame. We cannot know which
 *   entries are still mounted without a use-count, so we follow the same idiom as
 *   `evictGltfAsset` (GltfModel.tsx): pick a bound far above any realistic count
 *   of *simultaneously on-screen* distinct materials, so an evicted (least-
 *   recently-used) entry is almost certainly orphaned, and defer the actual GPU
 *   disposal one frame so any still-mounted instance has unmounted first.
 *
 *   Re-inserting an existing key refreshes its recency in place and never
 *   disposes the live value (it is the same object identity the caller already
 *   holds) — see `set`.
 */

/** Run `fn` after React has had a chance to commit any unmount that the current
 *  synchronous tick scheduled, so we never dispose a GPU resource still assigned
 *  to a live mesh. Mirrors `GltfModel.afterUnmount`. `requestAnimationFrame`
 *  runs after the commit; `setTimeout` is the non-DOM (test/SSR) fallback. */
function afterUnmount(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn())
  else setTimeout(fn, 0)
}

export interface LruCacheOptions<V> {
  /** Maximum number of live entries. Inserting past this evicts the LRU entry. */
  max: number
  /** Dispose the GPU resources owned by an evicted value. Called one frame after
   *  eviction (deferred) so a still-mounted mesh has unmounted first. */
  dispose: (value: V) => void
}

/**
 * Insertion-order = recency LRU over a `Map`. `Map` preserves insertion order,
 * so the first key is the least-recently-used; `get`/`set` of an existing key
 * delete-then-re-insert to move it to the most-recent (last) slot.
 */
export class LruCache<V> {
  private readonly map = new Map<string, V>()
  private readonly max: number
  private readonly disposeValue: (value: V) => void

  constructor(opts: LruCacheOptions<V>) {
    this.max = Math.max(1, opts.max)
    this.disposeValue = opts.dispose
  }

  get size(): number {
    return this.map.size
  }

  /** Look up a key, refreshing its recency to most-recent on a hit. */
  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    // Refresh recency: re-insert so it moves to the tail (most recent).
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  /** Insert/replace a value, then evict the LRU entry while over capacity.
   *  Re-inserting the *same* key (same object identity) refreshes recency and
   *  never disposes — only distinct evicted entries are disposed. */
  set(key: string, value: V): void {
    // Refresh recency on re-insert; a same-key replace deletes the stale slot
    // WITHOUT disposing (the caller may still hold/render the old value, and on
    // the hot path the value is identical to what is already stored).
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      const evicted = this.map.get(oldestKey) as V
      this.map.delete(oldestKey)
      afterUnmount(() => this.disposeValue(evicted))
    }
  }

  /** Remove a key immediately (no deferred dispose, no eviction bookkeeping)
   *  and return its value, or `undefined` if absent. The caller owns disposal
   *  — use this for an explicit, caller-initiated removal (e.g. a user deletes
   *  a saved material) where the caller already knows it's safe to free, as
   *  opposed to size-based eviction which defers a frame for mount safety. */
  delete(key: string): V | undefined {
    const value = this.map.get(key)
    this.map.delete(key)
    return value
  }

  /** Snapshot of the current keys (no recency refresh) — lets an explicit
   *  deletion sweep find every derived entry for a base id (`disposeCached
   *  MaterialsFor`) without exposing the backing map. */
  keys(): string[] {
    return [...this.map.keys()]
  }

  /** Test-only: clear all entries (disposing each immediately/synchronously). */
  clearForTest(): void {
    for (const value of this.map.values()) this.disposeValue(value)
    this.map.clear()
  }
}
