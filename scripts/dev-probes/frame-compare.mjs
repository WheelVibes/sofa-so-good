/**
 * Compare the TONAL DISTRIBUTION of two frames, exposure-invariantly.
 *
 * The graphics arc measured patches — a mean here, a ratio there. But "looks
 * photographic" is largely a whole-frame property: how much of the image is clipped,
 * how deep the shadows go, how wide the mid-tones spread. `.261` of that arc found the
 * app can be 100 % mid-tone or 9.4 % mid-tone but never simultaneously blown AND
 * mid-tone-rich the way a real interior photograph is — and had no reference to check it
 * against.
 *
 * Now there is one (Blender/Cycles, physically lit). The obstacle is that the reference's
 * absolute exposure is not matched to the app's and need not be, so every raw level
 * differs. So this **normalises both frames to a common median** before comparing shape.
 * Everything reported is then a property of the DISTRIBUTION, not of the exposure:
 *
 *   - percentiles (p01..p99) as ratios to the median
 *   - clipped fraction at the top, crushed fraction at the bottom
 *   - mid-tone occupancy
 *   - dynamic range p99/p01
 *   - chroma (mean R−B), which is near exposure-invariant already
 *
 * Usage:
 *   node scripts/dev-probes/frame-compare.mjs <a.png> <b.png> [--labels A,B]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: frame-compare.mjs <a.png> <b.png> [--labels A,B]')
  process.exit(1)
}
const labelsArg = args.find((a) => a.startsWith('--labels='))
const labels = labelsArg ? labelsArg.slice(9).split(',') : files.map((f) => f.split('/').pop())

/** Luminance + chroma histogram of one image. */
async function stats(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const lum = new Float64Array(n)
  let rb = 0
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    // Rec.601, matching the rest of this arc's tooling so figures are comparable.
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    rb += data[i] - data[i + 2]
  }
  const sorted = Float64Array.from(lum).sort()
  const q = (f) => sorted[Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))))]
  const median = q(0.5)
  return {
    px: n,
    median,
    rb: rb / n,
    // Fractions are computed on the RAW levels, because clipping is a property of the
    // encoded image: a normalised "clip" would be meaningless.
    clipped: lum.reduce((a, v) => a + (v > 250 ? 1 : 0), 0) / n,
    crushed: lum.reduce((a, v) => a + (v < 8 ? 1 : 0), 0) / n,
    midtone: lum.reduce((a, v) => a + (v >= 60 && v <= 240 ? 1 : 0), 0) / n,
    p: Object.fromEntries([1, 5, 25, 50, 75, 95, 99].map((k) => [k, q(k / 100)])),
  }
}

const [A, B] = await Promise.all(files.map(stats))

const row = (name, a, b, fmt = (v) => v.toFixed(1)) =>
  `  ${name.padEnd(26)} ${fmt(a).padStart(9)}  ${fmt(b).padStart(9)}`
const pct = (v) => `${(v * 100).toFixed(1)} %`

console.log(`\n${''.padEnd(26)} ${labels[0].padStart(9)}  ${labels[1].padStart(9)}`)
console.log(row('pixels', A.px, B.px, (v) => String(v)))
console.log(row('median (raw)', A.median, B.median))
console.log('\n  -- exposure-invariant shape (percentile / median) --')
for (const k of [1, 5, 25, 75, 95, 99]) {
  console.log(
    row(`p${String(k).padStart(2, '0')} / median`, A.p[k] / A.median, B.p[k] / B.median, (v) =>
      v.toFixed(3),
    ),
  )
}
console.log(
  row('dynamic range p99/p01', A.p[99] / Math.max(1, A.p[1]), B.p[99] / Math.max(1, B.p[1]), (v) =>
    v.toFixed(1),
  ),
)
console.log('\n  -- level-dependent (clipping is a property of the encoding) --')
console.log(row('clipped  > 250', A.clipped, B.clipped, pct))
console.log(row('crushed  < 8', A.crushed, B.crushed, pct))
console.log(row('mid-tone 60..240', A.midtone, B.midtone, pct))
console.log('\n  -- chroma --')
console.log(row('mean R-B', A.rb, B.rb))
console.log()
