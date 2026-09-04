/**
 * Crop a rectangle out of an image and upscale it NEAREST-NEIGHBOUR, so individual
 * texels are legible.
 *
 * **Why this exists.** The arc's rule is to look at the artefact, not just its
 * statistics — but `Read` on a 256² lightmap downscales it to nothing, and
 * `map-sheet.mjs` deliberately shows whole maps side by side rather than detail.
 * The GI seam is an edge artefact a few texels wide, so measuring its SPACING
 * needs the texels visible and countable. Nearest is not a preference here: any
 * smooth filter invents intermediate values and makes a two-texel notch look like
 * a gradient.
 *
 * Rect is in SOURCE PIXELS (`x,y,w,h`) because the question is texel spacing, and
 * a fractional rect would put the answer in a unit the answer is about.
 *
 * Usage:
 *   node scripts/dev-probes/crop-zoom.mjs <in.png> <out.png> <x,y,w,h> [--scale=12]
 */
import sharp from 'sharp'

const [inPath, outPath, rect] = process.argv.slice(2)
const scaleArg = process.argv.find((a) => a.startsWith('--scale='))
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 12

if (!inPath || !outPath || !rect) {
  console.error('usage: crop-zoom.mjs <in.png> <out.png> <x,y,w,h> [--scale=N]')
  process.exit(1)
}
const [x, y, w, h] = rect.split(',').map(Number)
if (![x, y, w, h].every(Number.isFinite)) {
  console.error(`bad rect ${rect}`)
  process.exit(1)
}

const src = sharp(inPath)
const meta = await src.metadata()
if (x < 0 || y < 0 || x + w > meta.width || y + h > meta.height) {
  console.error(`rect ${rect} outside ${meta.width}x${meta.height}`)
  process.exit(1)
}

await sharp(inPath)
  .extract({ left: x, top: y, width: w, height: h })
  .resize({ width: w * scale, height: h * scale, kernel: 'nearest' })
  .png()
  .toFile(outPath)

console.log(
  `  ${inPath} [${rect}] of ${meta.width}x${meta.height} -> ${outPath} at ${scale}x nearest`,
)
