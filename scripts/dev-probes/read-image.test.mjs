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

  it('reads a 16-BIT source at full precision, not divided by 256', async () => {
    // The bug this locks out. `raw({depth:'ushort'})` alone DOWNCONVERTS a 16-bit
    // source to 8 bits and then widens, so values come back /256 while `maxFor`
    // still returns 65535 -- every reading 256x too dark. `v0.31.7.105` read the
    // first 16-bit irradiance bake as 0.0 on all six slots of all 40 maps and
    // very nearly wrote up "the new bake is entirely black". The file was right.
    //
    // `toColourspace('rgb16')` is also what makes a 16-bit PNG WRITABLE here --
    // earlier rounds recorded a 16-bit fixture as impossible to synthesise, and
    // the missing ingredient was this call rather than `raw.depth`.
    const n = 8
    const buf = Buffer.alloc(n * 3 * 2)
    for (let i = 0; i < n; i += 1) {
      const val = Math.round((i / (n - 1)) * 60000)
      for (let c = 0; c < 3; c += 1) buf.writeUInt16LE(val, (i * 3 + c) * 2)
    }
    const f = join(dir, 'sixteen.png')
    await sharp(buf, { raw: { width: n, height: 1, channels: 3, depth: 'ushort' } })
      .toColourspace('rgb16')
      .png()
      .toFile(f)

    const { v, depth, max } = await readRed(f)
    expect(depth).toBe('ushort')
    expect(max).toBe(65535)
    // The exact top value shifts with the colourspace conversion, so assert the
    // ORDER OF MAGNITUDE that distinguishes a correct read from a /256 one.
    expect(Math.max(...v)).toBeGreaterThan(40000)
    // And agree with sharp's own statistics, which were never affected by the bug
    // and are therefore an independent check rather than a restatement.
    const stats = await sharp(f).stats()
    expect(Math.max(...v)).toBe(stats.channels[0].max)
    expect(v[0]).toBe(0)
  })
})
