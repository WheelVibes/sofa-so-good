/**
 * WET-GLASS map preview — render the two droplet maps to PNG without a browser or a GPU.
 *
 * The painters are pure (`lighting/dropletField.ts` + `lighting/wetGlassNormals.ts`), so the bytes
 * the app uploads can be inspected directly. Cheaper and far more legible than hunting for a 3 mm
 * drop in a screenshot, and it is the only way to check the SIGN conventions (green channel down,
 * wake above the head) without reading them off a lit frame.
 *
 *   npx tsx scripts/dev-probes/wet-glass-maps.ts /tmp/wet
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { beadField, runnelDroplets, runnelField } from '../../src/scene/lighting/dropletField'
import { paintDropletNormals } from '../../src/scene/lighting/wetGlassNormals'

const out = process.argv[2] ?? '/tmp/wet'
const SIZE = 256
mkdirSync(out, { recursive: true })

const beads = new Uint8ClampedArray(SIZE * SIZE * 4)
paintDropletNormals(beads, SIZE, SIZE, beadField())

const runnels = new Uint8ClampedArray(SIZE * SIZE * 4)
paintDropletNormals(runnels, SIZE, SIZE, runnelDroplets(runnelField()))

// The track map as the material actually sees it: green is a roughness MULTIPLIER, 1 on the film
// and low inside a track. Painted here in greyscale so a glance shows where the pane re-sharpens.
const TRACK = 0.28
const tracks = new Uint8ClampedArray(SIZE * SIZE * 4)
for (let i = 0; i < SIZE * SIZE; i++) {
  // Reuse the runnel normal field's own coverage: anywhere its normal is not flat is inside a drop.
  const flat = runnels[i * 4] === 128 && runnels[i * 4 + 1] === 128 && runnels[i * 4 + 2] === 255
  const v = flat ? 255 : Math.round(TRACK * 255)
  tracks[i * 4] = v
  tracks[i * 4 + 1] = v
  tracks[i * 4 + 2] = v
  tracks[i * 4 + 3] = 255
}

const write = async (name: string, data: Uint8ClampedArray) => {
  const file = path.join(out, name)
  await sharp(Buffer.from(data.buffer), { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toFile(file)
  console.log('wrote', file)
}

const nonFlat = (d: Uint8ClampedArray) => {
  let n = 0
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!(d[i * 4] === 128 && d[i * 4 + 1] === 128 && d[i * 4 + 2] === 255)) n++
  }
  return ((100 * n) / (SIZE * SIZE)).toFixed(1)
}

await write('beads-normal.png', beads)
await write('runnels-normal.png', runnels)
await write('tracks-roughness.png', tracks)
console.log(`coverage: beads ${nonFlat(beads)} %, runnels ${nonFlat(runnels)} % of the tile`)
