/**
 * Depth-correct image reads for probes.
 *
 * **The trap this exists for.** `sharp(f).raw().toBuffer()` silently returns 8-BIT
 * data for a 16-bit PNG. Every probe in this arc used the bare form, which was
 * correct while every baked map was 8-bit (`--float-buffer` off) — the shipped
 * visibility lightmaps are `uchar` and their measurements stand. But
 * `--pass irradiance` writes `ushort`, and read through the bare form its dark
 * texels collapse: a true value of 3/65535 reads as 0/255, so any difference there
 * becomes a ~100 % relative error.
 *
 * That produced a real wrong answer, not a hypothetical one: `v0.31.7.72` first
 * measured the irradiance bake's dark-texel error at **48.4 %** and its seed-pair
 * noise at **31.9 %**, concluded the sample count was hopeless, and was wrong on
 * both counts — at true 16-bit the error is **5.2 %**, uniform across levels. The
 * hypothesis that caught it (8-bit quantisation) was right about the mechanism and
 * wrong about the culprit: the truncation was in the measuring script.
 *
 * Asking for `ushort` is NOT sufficient on its own, and `v0.31.7.105` measured why.
 * Two separate sharp behaviours, both undocumented loudly:
 *
 * 1. For an **8-bit** source, `raw({depth:'ushort'})` widens the CONTAINER to 16
 *    bits but does NOT rescale the values, so a `uchar` file still yields 0..255.
 *    Hence `max` is reported per file and callers normalise by it; only fractions
 *    are comparable across depths, never raw counts. (Found by the test below.)
 * 2. For a **16-bit** source, `raw({depth:'ushort'})` *downconverts to 8 bits* and
 *    then widens, so the values come back divided by 256 — while `maxFor` still
 *    returns 65535. Measured on a real baked map: `max` read **183** where
 *    `sharp().stats()` reports **46888**, i.e. every value **256x too dark**.
 *    `toColourspace('rgb16')` is the only variant that preserves them; both
 *    `pipelineColourspace('rgb16')` and a bare `raw()` do not.
 *
 * (2) bit immediately. The first `--scale`d irradiance bake — 40 maps, verifiably
 * `bitdepth 16`, `"clipped": false`, `sharp().stats()` max 46888/65535 = 0.715
 * exactly matching the reported 2.862/4 — read back as **0.0 mean on all six atlas
 * slots of all 40 maps**. A confident "the new bake is entirely black". The file was
 * right; the ruler was wrong, for the second time in this arc and in the same place.
 *
 * It does not invalidate anything earlier: nothing wrote a 16-bit PNG before
 * `v0.31.7.104` set `color_depth`, and the shipped visibility set proves it — baked
 * with a float buffer (`dilate > 0`) and saved at `bitdepth 8`. The `5.2 %`
 * dark-texel figure above was measured on 8-bit files and stands.
 */
import sharp from 'sharp'

/** Full-scale value for a file's own bit depth. `ushort` reads keep 8-bit values
 *  unscaled, so this is what makes the two depths comparable as fractions. */
export function maxFor(depth) {
  return depth === 'ushort' || depth === 'short' ? 65535 : 255
}

/**
 * A pipeline that will actually hand back 16-bit samples for a 16-bit file.
 *
 * `toColourspace('rgb16')` ONLY when the source is already `ushort` — applied to an
 * 8-bit file it would rescale 0..255 up to 0..65535, and `maxFor('uchar')` would
 * then divide by 255. Conditional, not unconditional, is the whole point.
 */
function wide(file, meta) {
  const img = sharp(file).removeAlpha()
  return meta.depth === 'ushort' || meta.depth === 'short' ? img.toColourspace('rgb16') : img
}

/** `{ lum, w, h, depth, max }` — luminance in RAW COUNTS at the file's own depth. */
export async function readLuma(file) {
  const meta = await sharp(file).metadata()
  const { data, info } = await wide(file, meta)
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const lum = new Float64Array(n)
  const ch = info.channels
  for (let i = 0; i < n; i++) {
    const o = i * ch * 2
    const r = data.readUInt16LE(o)
    const g = ch > 1 ? data.readUInt16LE(o + 2) : r
    const b = ch > 2 ? data.readUInt16LE(o + 4) : r
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return { lum, w: info.width, h: info.height, depth: meta.depth, max: maxFor(meta.depth) }
}

/** Single-channel (red) read, for maps where the three channels are equal. */
export async function readRed(file) {
  const meta = await sharp(file).metadata()
  const { data, info } = await wide(file, meta)
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = data.readUInt16LE(i * info.channels * 2)
  return { v: out, w: info.width, h: info.height, depth: meta.depth, max: maxFor(meta.depth) }
}
