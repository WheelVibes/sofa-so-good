/**
 * Contact sheet of baked lightmaps, upscaled nearest-neighbour so 64² texels are
 * actually visible.
 *
 * A 64×64 map displayed at native size is four thousand pixels of nothing you can
 * read. The arc's rule is to look at the artefact, not just its statistics — which
 * needs the artefact to be legible.
 *
 *   node scripts/dev-probes/map-sheet.mjs <out.png> <a.png> [b.png ...] [--scale=8]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const scaleArg = args.find((a) => a.startsWith('--scale='))
const SCALE = scaleArg ? Number(scaleArg.slice(8)) : 8
if (files.length < 2) {
  console.error('usage: map-sheet.mjs <out.png> <in.png> [more.png ...] [--scale=N]')
  process.exit(1)
}
const [out, ...ins] = files
const tiles = await Promise.all(
  ins.map(async (f) => {
    const img = sharp(f)
    const m = await img.metadata()
    return {
      f,
      buf: await img
        .resize({
          width: (m.width ?? 64) * SCALE,
          height: (m.height ?? 64) * SCALE,
          kernel: 'nearest',
        })
        .png()
        .toBuffer(),
      w: (m.width ?? 64) * SCALE,
      h: (m.height ?? 64) * SCALE,
    }
  }),
)
const GAP = 8
const W = tiles.reduce((a, t) => a + t.w + GAP, GAP)
const H = Math.max(...tiles.map((t) => t.h)) + GAP * 2
let x = GAP
const composites = tiles.map((t) => {
  const c = { input: t.buf, left: x, top: GAP }
  x += t.w + GAP
  return c
})
await sharp({ create: { width: W, height: H, channels: 3, background: '#303030' } })
  .composite(composites)
  .png()
  .toFile(out)
console.log(`  ${out}  ${W}x${H}  (${tiles.length} maps at ${SCALE}x nearest)`)
