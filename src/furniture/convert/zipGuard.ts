/**
 * Zip-bomb guard for the two ZIP-container model formats we ingest (usdz, 3mf).
 *
 * Both are inflated inside their three.js loaders via `fflate.unzipSync(bytes)`
 * with NO size bound (`USDLoader`/`3MFLoader`), so a tiny on-disk archive that
 * declares gigabytes of uncompressed content would expand into memory before
 * anything could stop it. The blunt on-disk cap (`MAX_BYTES_BY_FORMAT`) can't
 * catch this without also rejecting legitimate large models.
 *
 * fflate's `unzipSync(data, { filter })` walks the ZIP central directory and
 * calls `filter({ name, size, originalSize, compression })` per entry — where
 * `originalSize` is the declared *uncompressed* size — and only inflates an
 * entry when its filter returns `true`. We pass an always-`false` filter to
 * enumerate every entry's declared sizes cheaply while inflating nothing, then
 * bound the aggregate + per-entry expansion before the real loader runs.
 */
import { unzipSync } from 'fflate'

/** Thrown on a policy violation or an unparseable archive. */
export class ZipGuardError extends Error {}

export interface ZipEntryInfo {
  name: string
  /** Compressed (on-disk) size, from the central directory. */
  size: number
  /** Declared uncompressed size, from the central directory. */
  originalSize: number
  /** ZIP compression method (0 = stored, 8 = deflate). */
  compression: number
}

/** Max central-directory entries. Real usdz/3mf hold a handful to low hundreds. */
export const MAX_ZIP_ENTRIES = 4096

/** Cap on the SUM of declared uncompressed sizes. Well above the 80 MB on-disk
 *  entry cap so legitimate texture-heavy models pass; a bomb (GB–TB) trips it. */
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

/** Per-entry uncompressed:compressed ratio ceiling (deflate max is ~1032:1;
 *  real mesh/texture data is ~2–10:1). */
export const MAX_ENTRY_RATIO = 200

/** Only apply the ratio rule above this uncompressed size, so a tiny
 *  highly-compressible manifest (e.g. XML) can't false-positive. */
export const RATIO_MIN_ORIGINAL_BYTES = 1024 * 1024

/** Enumerate central-directory entries WITHOUT inflating any of them. */
export function readZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  const entries: ZipEntryInfo[] = []
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({
          name: f.name,
          size: f.size,
          originalSize: f.originalSize,
          compression: f.compression,
        })
        return false // record only — never inflate
      },
    })
  } catch (e) {
    throw new ZipGuardError(
      `Could not read the archive (${e instanceof Error ? e.message : String(e)}).`,
    )
  }
  return entries
}

/** Throw {@link ZipGuardError} if `bytes` looks like a decompression bomb. */
export function assertSafeZip(
  bytes: Uint8Array,
  label: string,
  opts?: { maxEntries?: number; maxTotalUncompressed?: number; maxEntryRatio?: number },
): void {
  const maxEntries = opts?.maxEntries ?? MAX_ZIP_ENTRIES
  const maxTotal = opts?.maxTotalUncompressed ?? MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
  const maxRatio = opts?.maxEntryRatio ?? MAX_ENTRY_RATIO

  const entries = readZipEntries(bytes)
  if (entries.length > maxEntries) {
    throw new ZipGuardError(
      `${label} has too many entries (${entries.length} > ${maxEntries}) — refusing as a possible zip bomb.`,
    )
  }

  let total = 0
  for (const e of entries) {
    if (e.originalSize > RATIO_MIN_ORIGINAL_BYTES) {
      const ratio = e.originalSize / Math.max(e.size, 1)
      if (ratio > maxRatio) {
        throw new ZipGuardError(
          `${label} contains a highly-compressed entry (${Math.round(ratio)}:1) — refusing as a possible zip bomb.`,
        )
      }
    }
    total += e.originalSize
    if (total > maxTotal) {
      const mb = (total / 1_048_576).toFixed(0)
      const cap = (maxTotal / 1_048_576).toFixed(0)
      throw new ZipGuardError(
        `${label} would decompress to over ${mb} MB (limit ${cap} MB) — refusing as a possible zip bomb.`,
      )
    }
  }
}
