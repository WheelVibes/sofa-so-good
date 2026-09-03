/**
 * Write an AMPLIFIED absolute-difference image between two frames.
 *
 * **Why this exists.** `img-diff.mjs` reports the statistics of a difference and
 * this arc's rule is to look at the artefact — but a 2-count mean difference is
 * invisible in a side-by-side, and eyeballing two 2560x1600 frames for a
 * few-texel edge artefact does not work. It found the GI seam by attribution
 * failure: the curtain-rod dashes that looked like the seam are present with the
 * feature OFF (they are the rod's own faceting), which a difference image says
 * immediately and a pair of screenshots does not.
 *
 * `--gain=N` multiplies before clipping, so structure in the low counts is
 * legible. The gain is printed in the summary because a diff image without its
 * gain is unreadable as evidence: 40 counts at gain 8 and 5 counts at gain 64
 * look identical.
 *
 * Usage:
 *   node scripts/dev-probes/diff-image.mjs <a.png> <b.png> <out.png> [--gain=8]
 */
import sharp from 'sharp'

const [aPath, bPath, outPath] = process.argv.slice(2)
const gainArg = process.argv.find((s) => s.startsWith('--gain='))
const gain = gainArg ? Number(gainArg.split('=')[1]) : 8

if (!aPath || !bPath || !outPath) {
  console.error('usage: diff-image.mjs <a.png> <b.png> <out.png> [--gain=N]')
  process.exit(1)
}

const read = async (p) => {
  const img = sharp(p).removeAlpha()
  const meta = await img.metadata()
  const data = await img.raw().toBuffer()
  return { data, w: meta.width, h: meta.height }
}
const [a, b] = await Promise.all([read(aPath), read(bPath)])
if (a.w !== b.w || a.h !== b.h) {
  console.error(`size mismatch ${a.w}x${a.h} vs ${b.w}x${b.h}`)
  process.exit(1)
}

const out = Buffer.alloc(a.data.length)
let sum = 0
let max = 0
for (let i = 0; i < a.data.length; i += 1) {
  const d = Math.abs(a.data[i] - b.data[i])
  sum += d
  if (d > max) max = d
  out[i] = Math.min(255, Math.round(d * gain))
}
await sharp(out, { raw: { width: a.w, height: a.h, channels: 3 } })
  .png()
  .toFile(outPath)
console.log(
  `  ${a.w}x${a.h}  mean |diff| ${(sum / a.data.length).toFixed(3)}  max ${max}  gain ${gain}x -> ${outPath}`,
)
