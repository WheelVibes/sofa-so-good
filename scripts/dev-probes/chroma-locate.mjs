/**
 * WHERE does the chroma gap live?
 *
 * `frame-compare.mjs` reports the app at mean R−B **+8.6** against the Cycles reference's
 * **−31.6** — a 40-count gap, and the one whole-frame figure that `v0.31.6.9` found the fill
 * level does not move at all. But a 40-count *frame mean* is compatible with two completely
 * different pictures: a uniform cast over every surface (a fill-colour problem, fixable with
 * one per-channel scalar) or one large strongly-coloured region dragging the mean (in which
 * case the surfaces may already agree and the mean is a red herring).
 *
 * `v0.31.6.10` learned that lesson the expensive way on luminance: the reference's whole-frame
 * dynamic range turned out to live entirely in one narrow strip, and the app was already at
 * physics everywhere else. So localise first, then price.
 *
 * Per tile this reports mean R−B for both frames and the difference. Unlike luminance, chroma
 * needs no exposure normalisation — R−B is a channel difference, so a common scale factor
 * cancels — which is why this is a fair comparison against an unmatched-exposure reference.
 *
 * Takes the same `--crop` as `frame-compare.mjs`, and for the same reason: the app's own UI
 * chrome is neutral-to-cool and would pull a tile's mean toward zero.
 *
 * **The raw A−B difference is not a valid comparison, and the report says so.** `.315`
 * established that **absolute** R−B is white-balance dependent and has no photographic anchor
 * — only a **within-frame** difference is WB-invariant and crosses between pipelines. The app
 * applies a white balance; a Cycles reference lit by a blue sky does not. So a raw 40-count
 * frame-mean gap is mostly the two pipelines' different idea of white, not a transport error.
 *
 * Hence the last block: each frame's own mean is subtracted before differencing, which cancels
 * any per-channel gain either pipeline applies globally and leaves only *relative* chroma
 * structure — the part that means something. Read that block, not the raw one.
 *
 * Usage:
 *   node scripts/dev-probes/chroma-locate.mjs <app.png> <ref.png> [--crop=x,y,w,h] [--tiles=NXxNY]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: chroma-locate.mjs <app.png> <ref.png> [--crop=x,y,w,h] [--tiles=NXxNY]')
  process.exit(1)
}
const cropArg = args.find((a) => a.startsWith('--crop='))
const crop = cropArg ? cropArg.slice(7).split(',').map(Number) : null
if (crop && (crop.length !== 4 || crop.some((v) => !Number.isFinite(v)))) {
  console.error('--crop wants four fractional numbers: x,y,w,h')
  process.exit(1)
}
const tilesArg = args.find((a) => a.startsWith('--tiles='))
const [NX, NY] = tilesArg ? tilesArg.slice(8).split('x').map(Number) : [6, 4]

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
  return { data, w: info.width, h: info.height }
}

/** Per-tile mean R−B, and the whole-region mean. */
function tiles(im) {
  const g = []
  let sum = 0
  let count = 0
  for (let ty = 0; ty < NY; ty++) {
    const row = []
    for (let tx = 0; tx < NX; tx++) {
      const x0 = Math.floor((tx * im.w) / NX)
      const x1 = Math.floor(((tx + 1) * im.w) / NX)
      const y0 = Math.floor((ty * im.h) / NY)
      const y1 = Math.floor(((ty + 1) * im.h) / NY)
      let s = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * im.w + x) * 3
          s += im.data[i] - im.data[i + 2]
          n++
        }
      }
      row.push(s / n)
      sum += s
      count += n
    }
    g.push(row)
  }
  return { g, mean: sum / count }
}

const [A, B] = await Promise.all(files.map(load))
const ta = tiles(A)
const tb = tiles(B)
const f = (v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)).padStart(7)
console.log(`mean R-B per tile (rows = top -> bottom, ${NX}x${NY})`)
console.log(`  A = ${files[0]}   whole-region mean ${f(ta.mean)}`)
console.log(`  B = ${files[1]}   whole-region mean ${f(tb.mean)}`)
console.log(`\n  A (app)`)
for (const row of ta.g) console.log(`   ${row.map(f).join('')}`)
console.log(`\n  B (reference)`)
for (const row of tb.g) console.log(`   ${row.map(f).join('')}`)
console.log(`\n  A - B  RAW (white-balance dependent -- NOT a valid comparison, see header)`)
for (let y = 0; y < NY; y++) {
  console.log(`   ${ta.g[y].map((v, x) => f(v - tb.g[y][x])).join('')}`)
}
// The WB-invariant residual: de-mean each frame first, so any global per-channel gain
// cancels and only relative chroma structure survives (`.315`).
const resid = []
for (let y = 0; y < NY; y++) {
  resid.push(ta.g[y].map((v, x) => v - ta.mean - (tb.g[y][x] - tb.mean)))
}
console.log(`\n  (A - meanA) - (B - meanB)   WB-INVARIANT RESIDUAL -- read THIS one`)
for (const row of resid) console.log(`   ${row.map(f).join('')}`)
const flat = resid.flat()
const rms = Math.sqrt(flat.reduce((a, v) => a + v * v, 0) / flat.length)
const worst = flat.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0)
console.log(
  `\n  residual rms ${rms.toFixed(1)} counts, worst tile ${f(worst).trim()}` +
    `   (raw frame-mean gap ${f(ta.mean - tb.mean).trim()}, of which the WB term is` +
    ` ${f(ta.mean - tb.mean).trim()} by construction)`,
)
