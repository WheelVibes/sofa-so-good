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

/** `LINEAR=1` decodes sRGB per pixel before averaging — see the note in the stat function. */
const LINEAR = process.env.LINEAR === '1'

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

/** Mean L, mean R−B, sd, percentiles and MICROCONTRAST of L over one fractional rect. */
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
  // Every luma, so PERCENTILES are available alongside the mean. A mean is the wrong statistic
  // for a patch containing two populations: at the window, thin grille bars and bright glass. Both
  // `v0.31.7.279`'s "the pane emissive saturates" and `.280`'s bar-brightening were conclusions
  // about a BAR-DOMINATED mean that could not see the glass move at all. p95 reads the glass, p05
  // reads the bars, and the two together say which one a change actually touched.
  const lumas = new Float64Array(n)
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Rec.601 luma, matching sharp's own greyscale so figures compare with the
    // probe's band means.
    //
    // LINEAR=1 sRGB-DECODES each channel first, so the mean is a mean of LIGHT rather than of
    // display code values. Needed to compare a GRADIENT against a bake: a lightmap holds linear
    // irradiance, and a ratio of tone-mapped bytes is not a ratio of light — near the AgX shoulder
    // a linear ratio of 0.82 shows up as about 0.86 in bytes (`(z11)`). Decoding per PIXEL and
    // then averaging is the point: `sRGB_to_linear(mean)` is not `mean(sRGB_to_linear)` on a
    // patch that spans a gradient, which is exactly the case this exists for. Only valid on a
    // render whose transform IS the sRGB OETF -- Blender's `Standard`, not AgX.
    const dec = (v) => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const l = LINEAR
      ? 255 * (0.299 * dec(r) + 0.587 * dec(g) + 0.114 * dec(b))
      : 0.299 * r + 0.587 * g + 0.114 * b
    sum += l
    sumSq += l * l
    rb += r - b
    lumas[i / 3] = l
  }
  // MICROCONTRAST: mean |neighbour difference| (right + down) inside the patch. Added for
  // GLASS-CLARITY (v0.33.0.10): mean/sd/percentiles are all blind to BLUR — a mip-blurred façade
  // and a crisp one carry the same luminance distribution, and only the pixel-to-pixel figure
  // separates them. It is the same statistic the material probes report (`surface-detail.mjs`,
  // and every microcontrast number in `src/materials/CLAUDE.md`), so figures compare across arcs.
  const mean = sum / n
  // Row-major copy, because `lumas` is about to be SORTED for the percentiles and the
  // neighbour difference needs the pixels still in place.
  const grid = Float64Array.from(lumas)
  const at = (x, y) => grid[y * width + x]
  let micro = 0
  let microN = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x + 1 < width) {
        micro += Math.abs(at(x, y) - at(x + 1, y))
        microN++
      }
      if (y + 1 < height) {
        micro += Math.abs(at(x, y) - at(x, y + 1))
        microN++
      }
    }
  }
  lumas.sort()
  const q = (f) => lumas[Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))))]
  return {
    mean,
    sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
    rb: rb / n,
    p05: q(0.05),
    p95: q(0.95),
    micro: microN ? micro / microN : 0,
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
  `\n${'patch'.padEnd(w)}  ${'image'.padEnd(28)}  ${'mean'.padStart(7)}  ${'p05'.padStart(6)}  ${'p95'.padStart(6)}  ${'spread'.padStart(6)}  ${'R-B'.padStart(7)}  ${'sd'.padStart(6)}  ${'micro'.padStart(6)}  px`,
)
for (const p of patches) {
  for (const r of rows.filter((x) => x.patch === p.name)) {
    console.log(
      `${r.patch.padEnd(w)}  ${r.image.padEnd(28)}  ${r.mean.toFixed(1).padStart(7)}  ${r.p05.toFixed(0).padStart(6)}  ${r.p95.toFixed(0).padStart(6)}  ${(r.p95 - r.p05).toFixed(0).padStart(6)}  ${r.rb.toFixed(1).padStart(7)}  ${r.sd.toFixed(1).padStart(6)}  ${r.micro.toFixed(2).padStart(6)}  ${r.px}`,
    )
  }
  // Two images → print the delta, which is the figure every (p) round wants.
  const two = rows.filter((x) => x.patch === p.name)
  if (two.length === 2) {
    console.log(
      `${''.padEnd(w)}  ${'delta'.padEnd(28)}  ${(two[1].mean - two[0].mean).toFixed(1).padStart(7)}  ${''.padStart(6)}  ${''.padStart(6)}  ${''.padStart(6)}  ${(two[1].rb - two[0].rb).toFixed(1).padStart(7)}  ${''.padStart(6)}  ${(two[1].micro - two[0].micro).toFixed(2).padStart(6)}`,
    )
  }
}
