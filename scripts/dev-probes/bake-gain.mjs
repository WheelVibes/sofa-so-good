/**
 * DERIVE the shader gain for a baked visibility set, instead of sweeping for it.
 *
 * The app's `HemisphereLight` + `AmbientLight` are a calibrated stand-in for a room's **average**
 * indirect irradiance, not for sky radiance. So the quantity the shader wants is `V / mean(V)`,
 * and with the operator being `texel × gain` (`v0.31.7.18`) the physically-right gain is exactly
 * `1 / mean(V)` — one number, computable from the maps themselves.
 *
 * `v0.31.7.19` found the spatial match minimises near gain 10 by sweeping. That is a fit. This
 * computes what the gain *should* be, so the two can be compared: agreement would mean the term
 * is behaving as modelled, and disagreement is a real discrepancy rather than a tuning gap.
 *
 * **Area-weighted**, because a 34 m² wall and a 3 m² one contribute very differently to what
 * the room's average irradiance actually is, and the index records each map's area.
 *
 * Texels are weighted by coverage within each map: the 3×2 atlas leaves slots empty for faces a
 * mesh does not have, and averaging those zeros in would drag the mean down and inflate the gain.
 * A texel counts only if any texel in its slot is non-zero.
 *
 * Usage: node scripts/dev-probes/bake-gain.mjs <bakeDir> [--encode=<e>]
 */
import fs from 'node:fs'
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
if (!dir) {
  console.error('usage: bake-gain.mjs <bakeDir> [--encode=<e>]')
  process.exit(1)
}
const encArg = args.find((a) => a.startsWith('--encode='))
const encode = encArg ? Number(encArg.slice(9)) : 1

const index = JSON.parse(fs.readFileSync(`${dir}/index.json`, 'utf8'))
let areaSum = 0
let weighted = 0
let counted = 0
for (const m of index.maps) {
  const { data, info } = await sharp(`${dir}/${m.file}`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  // Which of the six slots carry anything at all.
  const live = new Set()
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 3] > 0) live.add(Math.floor((y * 2) / h) * 3 + Math.floor((x * 3) / w))
    }
  }
  let sum = 0
  let n = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!live.has(Math.floor((y * 2) / h) * 3 + Math.floor((x * 3) / w))) continue
      // Undo the storage encode so the mean is of the physical quantity.
      sum += (data[(y * w + x) * 3] / 255) ** (1 / encode)
      n += 1
    }
  }
  if (!n) continue
  const mean = sum / n
  weighted += mean * m.area
  areaSum += m.area
  counted += 1
}
const mean = weighted / areaSum
console.log(`${dir}  maps ${counted}  area ${areaSum.toFixed(1)} m2`)
console.log(`  area-weighted mean visibility = ${mean.toFixed(4)}`)
console.log(`  => derived gain 1/mean = ${(1 / mean).toFixed(2)}`)
