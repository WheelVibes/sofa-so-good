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
 * **Reported PER PLAN CONTEXT**, because the gain is not global. `v0.31.7.27` showed the derived
 * value is scope-dependent, and `v0.31.7.44` measured the consequence: a gain fitted on the
 * 4-Room plan applied to the 5-Room plan makes its spatial match *worse* (1.53× → 2.25×). If two
 * plans have different mean visibility, one constant cannot serve both.
 *
 * `--write` annotates the index with each plan's mean, which is what lets ONE fitted measurement
 * calibrate every plan: the runtime scales the fitted gain by `referenceMean / thisPlanMean`.
 * Kept as a separate step rather than folded into the bake because it is a whole-index property —
 * it can only be computed once every map for a plan exists.
 *
 * Usage: node scripts/dev-probes/bake-gain.mjs <bakeDir> [--encode=<e>] [--write]
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
const perCtx = new Map()
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
  const ctx = m.ctx ?? 'no-ctx'
  const acc = perCtx.get(ctx) ?? { weighted: 0, area: 0, count: 0 }
  acc.weighted += mean * (m.area ?? 1)
  acc.area += m.area ?? 1
  acc.count += 1
  perCtx.set(ctx, acc)
}
console.log(dir)
const means = []
for (const [ctx, a] of perCtx) {
  const mean = a.weighted / a.area
  means.push({ ctx, mean })
  console.log(
    `  ctx ${ctx}  ${String(a.count).padStart(3)} maps  ${a.area.toFixed(0).padStart(4)} m2` +
      `  mean visibility ${mean.toFixed(4)}  => 1/mean ${(1 / mean).toFixed(2)}`,
  )
}
if (args.includes('--write')) {
  const contexts = {}
  for (const { ctx, mean } of means) contexts[ctx] = { mean: Number(mean.toFixed(5)) }
  const out = { ...index, contexts }
  fs.writeFileSync(`${dir}/index.json`, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`  wrote per-plan means into ${dir}/index.json`)
}
if (means.length > 1) {
  const lo = Math.min(...means.map((m) => m.mean))
  const hi = Math.max(...means.map((m) => m.mean))
  console.log(
    `  spread across plans: ${(hi / lo).toFixed(2)}x — one global gain cannot serve both if this` +
      ' is far from 1',
  )
}
