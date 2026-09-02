/**
 * The SPATIAL SHAPE of the app-vs-reference luminance error.
 *
 * `v0.31.7.6` found the app is far flatter than physics in a deep room (`livingDining`
 * mid-tone occupancy 92.3 % against 59.2 %) and matches it in a small one (`bedroom3`,
 * 90.3 % vs 90.5 %). An error that scales with room depth is a *distance-dependent* one, and
 * the app's only occlusion term is N8AO at a **1.0 m** radius — a contact-scale effect that
 * cannot produce a 4–6 m gradient. So the question is no longer whether the term is missing
 * but what SHAPE it has, because the shape decides what can approximate it cheaply.
 *
 * Whole-frame histograms cannot answer that: they discard position by construction. This
 * reports mean luminance per column and per row, each **divided by its own frame's median**,
 * so the two sides are comparable despite unmatched exposure (the same normalisation
 * `frame-compare.mjs` uses). The ratio of those two profiles is the error's spatial
 * signature:
 *
 *   - flat across the frame  → a global gain error, fixable with one scalar
 *   - monotone toward one edge → a distance/aperture falloff, needs a spatial term
 *   - spiky  → a specific object, not a transport property
 *
 * Takes the same `--crop` as the other comparison probes, and needs it for the same reason:
 * the app's own UI chrome sits in specific columns and would read as a luminance feature.
 *
 * `--explain=<img>` tests a CANDIDATE CAUSE. Give it a third image whose brightness is the
 * quantity you think is missing — e.g. `render_visibility.py`'s aperture-visibility map — and
 * it reports `(app ÷ ref) × candidate`. If the candidate is what the app lacks, that product
 * is flat, and the drop in spread from `A/B` to the product is **how much of the spatial error
 * the candidate explains**. This turns "the missing term is X" from a diagnosis into a
 * falsifiable prediction with a number attached.
 *
 * Usage:
 *   node scripts/dev-probes/spatial-profile.mjs <app.png> <ref.png> [--crop=x,y,w,h] [--bins=N]
 *                                               [--explain=<candidate.png>]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: spatial-profile.mjs <app.png> <ref.png> [--crop=x,y,w,h] [--bins=N]')
  process.exit(1)
}
const cropArg = args.find((a) => a.startsWith('--crop='))
const crop = cropArg ? cropArg.slice(7).split(',').map(Number) : null
if (crop && (crop.length !== 4 || crop.some((v) => !Number.isFinite(v)))) {
  console.error('--crop wants four fractional numbers: x,y,w,h')
  process.exit(1)
}
const binsArg = args.find((a) => a.startsWith('--bins='))
const BINS = binsArg ? Number(binsArg.slice(7)) : 10

async function load(file) {
  let img = sharp(file).removeAlpha()
  if (crop) {
    const meta = await img.metadata()
    const [fx, fy, fw, fh] = crop
    img = img.extract({
      left: Math.round(fx * meta.width),
      top: Math.round(fy * meta.height),
      width: Math.round(fw * meta.width),
      height: Math.round(fh * meta.height),
    })
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const lum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    lum[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]
  }
  const median = Float64Array.from(lum).sort()[Math.floor(0.5 * (n - 1))]
  return { lum, w: info.width, h: info.height, median }
}

/** Mean luminance per bin along one axis, normalised by the frame's own median. */
function profile(im, axis) {
  const len = axis === 'col' ? im.w : im.h
  const other = axis === 'col' ? im.h : im.w
  const out = []
  for (let b = 0; b < BINS; b++) {
    const a0 = Math.floor((b * len) / BINS)
    const a1 = Math.floor(((b + 1) * len) / BINS)
    let s = 0
    let n = 0
    for (let a = a0; a < a1; a++) {
      for (let o = 0; o < other; o++) {
        s += axis === 'col' ? im.lum[o * im.w + a] : im.lum[a * im.w + o]
        n++
      }
    }
    out.push(s / n / im.median)
  }
  return out
}

const explainArg = args.find((a) => a.startsWith('--explain='))
const [A, B, C] = await Promise.all(
  [files[0], files[1], ...(explainArg ? [explainArg.slice(10)] : [])].map(load),
)
const f = (v) => v.toFixed(3).padStart(7)
for (const [axis, label] of [
  ['col', 'COLUMNS (left -> right)'],
  ['row', 'ROWS (top -> bottom)'],
]) {
  const pa = profile(A, axis)
  const pb = profile(B, axis)
  const ratio = pa.map((v, i) => v / pb[i])
  console.log(`\n  ${label}   mean luminance / own median, ${BINS} bins`)
  console.log(`   app   ${pa.map(f).join('')}`)
  console.log(`   ref   ${pb.map(f).join('')}`)
  console.log(`   A/B   ${ratio.map(f).join('')}`)
  const lo = Math.min(...ratio)
  const hi = Math.max(...ratio)
  const spread = hi / lo
  console.log(
    `   spread ${spread.toFixed(2)}x  (flat => a global gain error; sloped => a spatial term is missing)`,
  )
  if (C) {
    const pc = profile(C, axis)
    const prod = ratio.map((v, i) => v * pc[i])
    console.log(`   cand  ${pc.map(f).join('')}`)
    console.log(`   A/B x cand${prod.map(f).join('')}`)
    const plo = Math.min(...prod)
    const phi = Math.max(...prod)
    const pspread = phi / plo
    // Log-ratio, because "how much of the error is explained" is a multiplicative
    // question: halving a 4x spread is not the same as halving a 1.1x one.
    const explained = 1 - Math.log(pspread) / Math.log(spread)
    console.log(
      `   residual spread ${pspread.toFixed(2)}x  ` +
        `=> the candidate explains ${(100 * explained).toFixed(0)} % of the spatial error`,
    )
  }
}
