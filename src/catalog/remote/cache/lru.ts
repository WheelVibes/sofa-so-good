import { deleteAsset, getMeta } from './db'

export const DEFAULT_ASSET_CAP_BYTES = 500 * 1024 * 1024
export const DEFAULT_THUMB_CAP_BYTES = 50 * 1024 * 1024

export async function evictUntilUnder(capBytes: number): Promise<void> {
  let meta = await getMeta()
  if (meta.totalBytes <= capBytes) return
  const sorted = [...meta.entries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
  for (const e of sorted) {
    if (meta.totalBytes <= capBytes) break
    await deleteAsset(e.key)
    meta = await getMeta()
  }
}
