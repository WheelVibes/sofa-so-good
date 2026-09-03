/**
 * Per-map dynamic range of a baked lightmap set, offline — no browser, no GPU.
 *
 * **The question it was built for.** `v0.31.7.166` found a mapped exterior wall over-brightening by
 * +65.6 counts and noted that most of the 40 maps carry `scale` ≈ 2.9191 while a handful carry
 * 0.15–0.22, without attaching a mechanism. Two mechanisms were on the table — the shared value is
 * a CLAMP (so the brightest maps are clipped) or it is real — and they are distinguished by one
 * number nobody had read: how many texels sit at 255.
 *
 * **The answer, and it cleared the maps.** Every map peaks at exactly **250** with **zero**
 * saturated texels, so the set is correctly per-map normalised and `scale` is each map\'s own true
 * maximum. The 22 high-scale maps vary in the fourth decimal (2.9191, 2.9189, 2.9187 …), so they
 * are not clamped to a constant: each simply contains a texel that sees the FULL unobstructed sky,
 * which is the same irradiance wherever you measure it.
 *
 * `recon_max` is the column that matters: `(max/255) * scale * VISIBILITY_GAIN`, i.e. what the
 * shader actually reconstructs. It reads **17.17** for the high group, which through
 * `BRDF_Lambert(diffuseColor)` at the index\'s own albedo 0.81 is an indirect diffuse of ~4.4 —
 * roughly 4x a white surface in full sun, and visible in the frame as exactly that.
 *
 * A side effect worth knowing when reading the numbers: a mesh whose max is 2.919 because ONE
 * corner sees the sky has its whole interior range squeezed into the bottom tenth of 0..250, so
 * 8-bit quantisation leaves it ~26 levels. That is a resolution cost, not the over-brightness.
 */

import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const idx = JSON.parse(readFileSync('public/assets/lightmaps/index.json', 'utf8'))
const rows = []
for (const m of idx.maps) {
  const f = `public/assets/lightmaps/${m.file}`
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let nz = 0,
    at255 = 0,
    max = 0,
    sum = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const v = data[i]
    if (v > 0) {
      nz++
      sum += v
      if (v > max) max = v
      if (v === 255) at255++
    }
  }
  rows.push({
    key: m.key,
    scale: m.scale,
    area: m.area,
    max,
    nz,
    at255,
    satPct: nz ? (100 * at255) / nz : 0,
    meanNz: nz ? sum / nz : 0,
  })
}
rows.sort((a, b) => b.scale - a.scale)
console.log('key       scale     max  nonzero   at255   sat%   meanNZ  recon_max')
for (const r of rows) {
  const recon = ((r.max / 255) * r.scale * 6).toFixed(2)
  console.log(
    `${r.key}  ${r.scale.toFixed(4).padStart(7)}  ${String(r.max).padStart(4)}  ${String(r.nz).padStart(7)}  ${String(r.at255).padStart(6)}  ${r.satPct.toFixed(2).padStart(6)}  ${r.meanNz.toFixed(1).padStart(6)}  ${recon.padStart(8)}`,
  )
}
const hi = rows.filter((r) => r.scale > 2.9)
const lo = rows.filter((r) => r.scale <= 2.9)
const avg = (a, f) => (a.length ? a.reduce((s, r) => s + f(r), 0) / a.length : 0)
console.log(
  `\nscale>2.9  n=${hi.length}  mean sat% ${avg(hi, (r) => r.satPct).toFixed(2)}  mean max ${avg(hi, (r) => r.max).toFixed(1)}`,
)
console.log(
  `scale<=2.9 n=${lo.length}  mean sat% ${avg(lo, (r) => r.satPct).toFixed(2)}  mean max ${avg(lo, (r) => r.max).toFixed(1)}`,
)
