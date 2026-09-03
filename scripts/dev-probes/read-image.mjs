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
 * Asking for `ushort` always is the fix — with one wrinkle sharp does not document
 * loudly: it widens the CONTAINER to 16 bits but does NOT rescale an 8-bit
 * source's values, so a `uchar` file still yields 0..255. Hence `max` is reported
 * per file and callers normalise by it; only fractions are comparable across
 * depths, never raw counts. (Found by the test below failing.)
 */
import sharp from 'sharp'

/** Full-scale value for a file's own bit depth. `ushort` reads keep 8-bit values
 *  unscaled, so this is what makes the two depths comparable as fractions. */
export function maxFor(depth) {
  return depth === 'ushort' || depth === 'short' ? 65535 : 255
}

/** `{ lum, w, h, depth, max }` — luminance in RAW COUNTS at the file's own depth. */
export async function readLuma(file) {
  const img = sharp(file).removeAlpha()
  const meta = await img.metadata()
  const { data, info } = await img.raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true })
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
  const img = sharp(file).removeAlpha()
  const meta = await img.metadata()
  const { data, info } = await img.raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = data.readUInt16LE(i * info.channels * 2)
  return { v: out, w: info.width, h: info.height, depth: meta.depth, max: maxFor(meta.depth) }
}
