/**
 * Statistics of a SHIPPED lightmap PNG, in irradiance units.
 *
 * **Why this exists (`(z7)`).** The app's floor renders ~19 % darker than an exposure-matched
 * Cycles reference, and the open question is whether the baked MAP is short or the shading that
 * consumes it is. Answering that means comparing a shipped map against a freshly baked one — but
 * `bake_material.py` reports per-object `mean`/`int_mean`/`max` for its own output and the index
 * keeps only `scale`, so there was no way to get the same statistics out of a map on disk.
 *
 * Reports the same three the bake does, so the two are directly comparable:
 *   - `mean`     whole map, including the dilated padding
 *   - `int_mean` only texels inside the atlas slots the index declares interior
 *   - `max`      the peak, which is what `scale = pre_max * 1.02` was derived from
 *
 * All multiplied by the entry's `scale`, which is what the runtime does (`texel * scale * gain`),
 * so the numbers are irradiance rather than storage units.
 *
 * `int_mean` is the one to compare. `max` is the most NOISE-SENSITIVE statistic there is, and two
 * bakes at different sample counts cannot be compared on it -- the shipped set used 1024 samples.
 * And a whole-map mean is the proxy `v0.31.7.244` already discarded once, having read 2.164 where
 * the true patch value was 0.926: the padding and the exterior slots dominate it.
 *
 * Usage:
 *   node scripts/dev-probes/map-stats.mjs <key> [<key> ...]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const DIR = join(import.meta.dirname, '..', '..', 'public', 'assets', 'lightmaps')
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'))
const entries = Array.isArray(index.maps) ? index.maps : Object.values(index.maps)
const keys = process.argv.slice(2)
if (keys.length === 0) {
  console.error('usage: map-stats.mjs <key> [<key> ...]')
  process.exit(1)
}

console.log(`index: pass=${index.pass} albedo=${index.albedo} encode=${index.encode}`)
for (const key of keys) {
  const e = entries.find((x) => x.key === key)
  if (!e) {
    console.log(`  ${key}  NOT IN INDEX`)
    continue
  }
  const { data, info } = await sharp(join(DIR, e.file)).raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels } = info
  // 3x2 box atlas: slot [col,row] spans thirds horizontally and halves vertically.
  //
  // The ROW IS FLIPPED against PNG order, and getting that wrong is not a subtle error -- it
  // reports `int_mean` from the empty mirror slot, so a correctly-baked map reads 0.0006 while a
  // point probe on the same map reads 0.4863. `lightmapUv.ts` sets
  // `uv.y = (row + ...) / ATLAS_ROWS`, so slot row 0 occupies uv.y in [0, 0.5); UV y = 0 is the
  // BOTTOM of the texture while PNG row 0 is the top. `gi-point.mjs` resolves the same thing as
  // `py = (1 - v) * h`. So slot row 0 is PNG rows [h/2, h), and row 1 is [0, h/2).
  const inSlot = (x, y) =>
    e.slots.some(([c, r]) => {
      const x0 = Math.floor((c * w) / 3)
      const x1 = Math.floor(((c + 1) * w) / 3)
      const y0 = Math.floor((1 - (r + 1) / 2) * h)
      const y1 = Math.floor((1 - r / 2) * h)
      return x >= x0 && x < x1 && y >= y0 && y < y1
    })
  let sum = 0
  let n = 0
  let iSum = 0
  let iN = 0
  let max = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Red channel: the bake writes a single-channel irradiance replicated across RGB.
      const v = data[(y * w + x) * channels] / 255
      sum += v
      n += 1
      if (v > max) max = v
      if (inSlot(x, y)) {
        iSum += v
        iN += 1
      }
    }
  }
  const s = e.scale
  console.log(
    `  ${key}  obj=${e.object} area=${e.area}m2 ${w}x${h} scale=${s.toFixed(4)} slots=${JSON.stringify(e.slots)}\n` +
      `        mean=${((sum / n) * s).toFixed(4)}  int_mean=${((iSum / iN) * s).toFixed(4)} (${iN} texels)  max=${(max * s).toFixed(4)}`,
  )
}
