/**
 * WHERE does a frame's top percentile LIVE?
 *
 * `frame-compare.mjs` says the app's brightest percentile is 53 % short of the Cycles
 * reference's. That number says nothing about whether the two frames are even talking
 * about the same part of the picture — a highlight deficit spread over every surface and
 * one concentrated in a single object need completely different fixes, and the whole-frame
 * statistic cannot tell them apart.
 *
 * So this tiles the frame and reports, per tile, the fraction of that tile's pixels above
 * the frame's OWN p99. Normalising to each frame's own percentile is what makes the two
 * comparable across an unmatched exposure: the question is "which tiles hold this frame's
 * brightest 1 %", not "which tiles are bright".
 *
 * In `v0.31.6.10` this returned an unusually clean answer — both frames put 100 % of their
 * top percentile in the SAME two tiles (the window), every other tile at 0.0 % — which is
 * what turned a vague "flat highlights" into a located, priceable item (l) question.
 *
 * Takes the same `--crop` as `frame-compare.mjs`, and for the same reason: an app
 * screenshot contains the app's own white UI chrome, which is bright enough to own a tile.
 *
 * Usage:
 *   node scripts/dev-probes/highlight-locate.mjs <a.png> <b.png> [--crop=x,y,w,h] [--tiles=NXxNY]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: highlight-locate.mjs <a.png> <b.png> [--crop=x,y,w,h] [--tiles=NXxNY]')
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
  const n = info.width * info.height
  const lum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    lum[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]
  }
  const p99 = Float64Array.from(lum).sort()[Math.floor(0.99 * (n - 1))]
  return { lum, w: info.width, h: info.height, p99 }
}

/** Per-tile % of pixels above the image's own p99. */
function grid(im) {
  const out = []
  for (let ty = 0; ty < NY; ty++) {
    const row = []
    for (let tx = 0; tx < NX; tx++) {
      const x0 = Math.floor((tx * im.w) / NX)
      const x1 = Math.floor(((tx + 1) * im.w) / NX)
      const y0 = Math.floor((ty * im.h) / NY)
      const y1 = Math.floor(((ty + 1) * im.h) / NY)
      let hot = 0
      let tot = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          tot++
          if (im.lum[y * im.w + x] > im.p99) hot++
        }
      }
      row.push((100 * hot) / tot)
    }
    out.push(row)
  }
  return out
}

const [A, B] = await Promise.all(files.map(load))
const [ga, gb] = [grid(A), grid(B)]
const la = files[0].split('/').pop()
const lb = files[1].split('/').pop()
console.log(`per-tile % of pixels above that frame's OWN p99 (rows = top -> bottom, ${NX}x${NY})`)
console.log(`  ${la} p99=${A.p99.toFixed(1)}   ${lb} p99=${B.p99.toFixed(1)}\n`)
const f = (v) => v.toFixed(1).padStart(6)
for (let y = 0; y < NY; y++) {
  console.log(`  A ${ga[y].map(f).join('')}      B ${gb[y].map(f).join('')}`)
}
