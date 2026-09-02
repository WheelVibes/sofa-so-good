/**
 * Read named rectangular patches from one or two images and print, per patch,
 * mean luminance, mean R−B and the standard deviation — plus a MARKED overlay of
 * every patch on every image.
 *
 * Extracted in `.326`. Every raster-vs-traced round from `.298` on re-implemented
 * this inline, and the recurring failure was never the arithmetic: it was patches
 * landing somewhere other than intended (`.300` wrong wall, `.315` window wall and
 * a framed picture, `.316` the HUD toolbar and a structural beam, `.319` a patch
 * never physically placed, `.323` the HUD MINIMAP). So the overlay is not optional
 * output here — it is written on every run, because the arc's rule is to LOOK.
 *
 * Rects are FRACTIONAL (x,y,w,h in 0..1) so one set applies to two images of
 * different pixel sizes — the raster capture is deviceScaleFactor 2 while the
 * traced canvas is its own backing size. They are NOT transferable across poses
 * or framings (`.247`, `.320`): a patch set is verified for one pose only.
 *
 * Usage:
 *   node scripts/dev-probes/patch-read.mjs <out-dir> <img[:label]> [img2[:label2]] \
 *     -- name=x,y,w,h [name2=x,y,w,h ...]
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const sep = argv.indexOf('--')
if (sep < 2) {
  console.error('usage: patch-read.mjs <out-dir> <img[:label]> [img2] -- name=x,y,w,h ...')
  process.exit(1)
}
const outDir = argv[0]
const images = argv.slice(1, sep).map((a) => {
  const i = a.lastIndexOf(':')
  // A drive-letter-free path: only treat a trailing ":label" as a label.
  return i > 1 && !a.slice(i + 1).includes('/')
    ? { file: a.slice(0, i), label: a.slice(i + 1) }
    : { file: a, label: path.basename(a, '.png') }
})
const patches = argv.slice(sep + 1).map((a) => {
  const [name, spec] = a.split('=')
  const [x, y, w, h] = (spec || '').split(',').map(Number)
  if ([x, y, w, h].some((n) => !Number.isFinite(n)))
    throw new Error(`patch "${a}": expected name=x,y,w,h with four finite numbers`)
  if (x < 0 || y < 0 || x + w > 1 || y + h > 1)
    throw new Error(`patch "${a}": fractional rect out of bounds`)
  return { name, x, y, w, h }
})
fs.mkdirSync(outDir, { recursive: true })

/** Mean L, mean R−B and sd of L over one fractional rect. */
async function readPatch(file, meta, p) {
  const left = Math.round(p.x * meta.width)
  const top = Math.round(p.y * meta.height)
  const width = Math.max(1, Math.round(p.w * meta.width))
  const height = Math.max(1, Math.round(p.h * meta.height))
  const { data } = await sharp(file)
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let sumSq = 0
  let rb = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Rec.601 luma, matching sharp's own greyscale so figures compare with the
    // probe's band means.
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    sum += l
    sumSq += l * l
    rb += r - b
  }
  const mean = sum / n
  return {
    mean,
    sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
    rb: rb / n,
    px: `${width}x${height}`,
  }
}

const rows = []
for (const img of images) {
  const meta = await sharp(img.file).metadata()
  const marks = []
  for (const p of patches) {
    const r = await readPatch(img.file, meta, p)
    rows.push({ image: img.label, patch: p.name, ...r })
    marks.push(
      `<rect x="${p.x * meta.width}" y="${p.y * meta.height}" width="${p.w * meta.width}" height="${p.h * meta.height}" fill="none" stroke="#ff00ff" stroke-width="3"/>` +
        `<text x="${p.x * meta.width + 4}" y="${p.y * meta.height - 6}" font-family="monospace" font-size="20" fill="#ff00ff">${p.name}</text>`,
    )
  }
  const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`
  const out = `${outDir}/marked-${img.label}.png`
  // Resize-then-composite: sizing the SVG from the ORIGINAL metadata and
  // compositing onto a resized base fails with "Image to composite must have
  // same dimensions or smaller" (`.315`). Here the base is never resized, so the
  // SVG is built at full size and the two always agree.
  await sharp(img.file)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(out)
  console.log(`marked -> ${out}`)
}

const w = Math.max(...rows.map((r) => r.patch.length), 8)
console.log(
  `\n${'patch'.padEnd(w)}  ${'image'.padEnd(12)}  ${'mean'.padStart(7)}  ${'R-B'.padStart(7)}  ${'sd'.padStart(6)}  px`,
)
for (const p of patches) {
  for (const r of rows.filter((x) => x.patch === p.name)) {
    console.log(
      `${r.patch.padEnd(w)}  ${r.image.padEnd(12)}  ${r.mean.toFixed(1).padStart(7)}  ${r.rb.toFixed(1).padStart(7)}  ${r.sd.toFixed(1).padStart(6)}  ${r.px}`,
    )
  }
  // Two images → print the delta, which is the figure every (p) round wants.
  const two = rows.filter((x) => x.patch === p.name)
  if (two.length === 2) {
    console.log(
      `${''.padEnd(w)}  ${'delta'.padEnd(12)}  ${(two[1].mean - two[0].mean).toFixed(1).padStart(7)}  ${(two[1].rb - two[0].rb).toFixed(1).padStart(7)}`,
    )
  }
}
