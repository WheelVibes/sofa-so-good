import { evictAssetsUntilUnder } from './db'

export const DEFAULT_ASSET_CAP_BYTES = 500 * 1024 * 1024
export const DEFAULT_THUMB_CAP_BYTES = 50 * 1024 * 1024

/** Evict least-recently-used cached assets until total ≤ `capBytes`. Delegates
 *  to the meta-locked primitive in `db.ts` so the eviction can't interleave with
 *  a concurrent `putAsset` and corrupt the byte accounting (BUG-011). */
export async function evictUntilUnder(capBytes: number): Promise<void> {
  await evictAssetsUntilUnder(capBytes)
}
