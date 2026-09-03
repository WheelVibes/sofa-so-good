import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { maxFor, readRed } from './read-image.mjs'

const dir = mkdtempSync(join(tmpdir(), 'readimg-'))

describe('readRed', () => {
  it('maps each bit depth to the full-scale value that makes them comparable', () => {
    // The 16-bit end-to-end path is exercised by the real baked maps, not by a
    // synthetic fixture: sharp writes an 8-bit PNG from a Uint16Array and from
    // `raw.depth: 'ushort'` alike, so any fixture built here would silently be
    // 8-bit and the test would pass while checking nothing — which is exactly what
    // the first two versions of it did. So the depth→max rule is tested directly,
    // and the read path is tested on the depth a fixture can actually express.
    expect(maxFor('uchar')).toBe(255)
    expect(maxFor('ushort')).toBe(65535)
    expect(maxFor('short')).toBe(65535)
    // Anything unrecognised must fail SAFE at 8-bit: treating an 8-bit file as
    // 16-bit divides every value by 257 and silently reports a near-black image.
    expect(maxFor('float')).toBe(255)
    expect(maxFor(undefined)).toBe(255)
  })

  it('reads an 8-bit source unscaled, and reports the max that makes it comparable', async () => {
    // sharp widens the container but does NOT rescale, so an 8-bit file still
    // yields 0..255. Callers must divide by `max`; raw counts are not comparable
    // across depths. This test is why the helper reports `max` at all.
    const f = join(dir, 'eight.png')
    await sharp(Buffer.from([0, 1, 128, 255]), { raw: { width: 4, height: 1, channels: 1 } })
      .png()
      .toFile(f)
    const { v, depth, max } = await readRed(f)
    expect(depth).toBe('uchar')
    expect(max).toBe(255)
    expect([...v]).toEqual([0, 1, 128, 255])
  })
})
