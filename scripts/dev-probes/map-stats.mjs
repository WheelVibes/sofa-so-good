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
 * `FILE`+`SCALE` read an ARBITRARY map instead of a shipped one, and `AT=u,v` additionally
 * samples one texel. That is what makes a fresh bake comparable to a shipped one: a fresh bake
 * gets its own `plan_context` so the app's index cannot resolve it, but `bake_material.py --uv
 * existing --uv-layer UVMap.001` bakes into the app's OWN runtime atlas, so the same uv1 a probe
 * used on the shipped map addresses the same surface point in the fresh one (item `(z7)`).
 *
 * Usage:
 *   node scripts/dev-probes/map-stats.mjs <key> [<key> ...]
 *   FILE=/tmp/x.png SCALE=0.3423 AT=0.857,0.273 node scripts/dev-probes/map-stats.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const DIR = join(import.meta.dirname, '..', '..', 'public', 'assets', 'lightmaps')
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'))
const entries = Array.isArray(index.maps) ? index.maps : Object.values(index.maps)
const keys = process.argv.slice(2)

if (process.env.FILE) {
  const scale = Number(process.env.SCALE ?? 1)
  const { data, info } = await sharp(process.env.FILE).raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels } = info
  let sum = 0
  let max = 0
  for (let i = 0; i < w * h; i += 1) {
    const v = data[i * channels] / 255
    sum += v
    if (v > max) max = v
  }
  let at = ''
  if (process.env.AT) {
    const [u, v] = process.env.AT.split(',').map(Number)
    // Same mapping `gi-point.mjs` uses: UV origin bottom-left, PNG row 0 top.
    const px = Math.min(w - 1, Math.max(0, Math.round(u * w - 0.5)))
    const py = Math.min(h - 1, Math.max(0, Math.round((1 - v) * h - 0.5)))
    const t = data[(py * w + px) * channels] / 255
    at = `  at(${u},${v}) texel=${t.toFixed(4)} E=${(t * scale).toFixed(4)}`
  }
  // 3x2 slot occupancy. "The map is empty AT THIS TEXEL" and "the map is empty" are different
  // claims, and only a per-slot breakdown separates them -- a bake that wrote into a DIFFERENT
  // slot than the app samples looks identical to a bake that produced nothing.
  let grid = ''
  for (let r = 1; r >= 0; r -= 1) {
    const cells = []
    for (let c = 0; c < 3; c += 1) {
      const x0 = Math.floor((c * w) / 3)
      const x1 = Math.floor(((c + 1) * w) / 3)
      const y0 = Math.floor((1 - (r + 1) / 2) * h)
      const y1 = Math.floor((1 - r / 2) * h)
      let cs = 0
      let cn = 0
      let cnz = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const v = data[(y * w + x) * channels] / 255
          cs += v
          cn += 1
          if (v > 0) cnz += 1
        }
      }
      cells.push(
        `[${c},${r}] mean=${((cs / cn) * scale).toFixed(4)} nz=${((100 * cnz) / cn).toFixed(0)}%`,
      )
    }
    grid += `\n        ${cells.join('  ')}`
  }

  console.log(
    `  ${process.env.FILE} ${w}x${h} scale=${scale}${grid}\n` +
      `        mean=${((sum / (w * h)) * scale).toFixed(4)}  max=${(max * scale).toFixed(4)}${at}`,
  )
  process.exit(0)
}

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
