import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  assertSafeZip,
  MAX_ENTRY_RATIO,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
  readZipEntries,
  ZipGuardError,
} from './zipGuard'

// Build a real ZIP whose single entry is a long run of a repeated byte, so
// deflate compresses it far past the ratio ceiling (a miniature zip bomb).
function bombZip(uncompressedBytes: number): Uint8Array {
  const payload = new Uint8Array(uncompressedBytes) // all zeros → tiny deflate output
  return zipSync({ 'bomb.bin': payload }) // fflate deflates by default
}

// A benign archive: a few small, poorly-compressible entries.
function benignZip(): Uint8Array {
  const rnd = (n: number) => {
    const a = new Uint8Array(n)
    for (let i = 0; i < n; i++) a[i] = (i * 2654435761) & 0xff
    return a
  }
  return zipSync({ 'mesh.bin': rnd(4096), 'tex.bin': rnd(8192), 'model.xml': rnd(512) })
}

describe('readZipEntries', () => {
  it('enumerates central-directory entries with declared sizes, inflating nothing', () => {
    const entries = readZipEntries(benignZip())
    expect(entries.map((e) => e.name).sort()).toEqual(['mesh.bin', 'model.xml', 'tex.bin'])
    const mesh = entries.find((e) => e.name === 'mesh.bin')!
    expect(mesh.originalSize).toBe(4096)
    expect(mesh.size).toBeGreaterThan(0)
  })

  it('throws ZipGuardError on bytes that are not a valid archive', () => {
    expect(() => readZipEntries(new Uint8Array([1, 2, 3, 4]))).toThrow(ZipGuardError)
  })
})

describe('assertSafeZip', () => {
  it('passes a benign archive', () => {
    expect(() => assertSafeZip(benignZip(), 'ok.3mf')).not.toThrow()
  })

  it('rejects a single-entry high-ratio bomb', () => {
    // 8 MB of zeros deflates to a few KB → ratio far over the ceiling.
    expect(() => assertSafeZip(bombZip(8 * 1024 * 1024), 'evil.3mf')).toThrow(ZipGuardError)
  })

  it('rejects when total declared uncompressed size exceeds the cap', () => {
    const bytes = bombZip(4 * 1024 * 1024)
    expect(() =>
      // Tiny total cap, generous ratio → only the total-size rule can trip.
      assertSafeZip(bytes, 'big.usdz', {
        maxTotalUncompressed: 1024,
        maxEntryRatio: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(ZipGuardError)
  })

  it('rejects when the entry count exceeds the cap', () => {
    const many: Record<string, Uint8Array> = {}
    for (let i = 0; i < 20; i++) many[`f${i}.bin`] = new Uint8Array([i])
    expect(() => assertSafeZip(zipSync(many), 'many.3mf', { maxEntries: 10 })).toThrow(
      ZipGuardError,
    )
  })

  it('does not trip the ratio rule on a small highly-compressible entry (under the 1 MB floor)', () => {
    // 100 KB of zeros → high ratio but originalSize is under RATIO_MIN_ORIGINAL_BYTES.
    expect(() => assertSafeZip(bombZip(100 * 1024), 'small.3mf')).not.toThrow()
  })

  it('exports sane default policy constants', () => {
    expect(MAX_ZIP_ENTRIES).toBeGreaterThan(0)
    expect(MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES).toBeGreaterThan(80 * 1024 * 1024)
    expect(MAX_ENTRY_RATIO).toBeGreaterThan(1)
  })
})
