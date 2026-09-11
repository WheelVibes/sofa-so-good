/**
 * LIGHTMAP-CHANNEL — what is actually in the shipped lightmaps, and what `.r` costs.
 *
 * Re-derives `LIGHTMAP_RED_TO_LUMA` (`src/scene/visibilityLightmap.ts`). **Run this after any
 * re-bake**: the constant is a property of the baked SET — a different albedo, sun angle or hour
 * moves it — and the chroma arm's whole claim to be one-variable rests on the gain being divided
 * by a measured number rather than re-fitted by eye.
 *
 * The arithmetic is done on raw 8-bit values on purpose. `bake_material.py` writes the maps as
 * `Non-Color` and `prepareVisibilityTexture` leaves three's `NoColorSpace` default in place, so
 * the stored bytes ARE the linear values the shader samples. If either side ever tags these sRGB,
 * every number here becomes wrong — and silently, which is why it is written down.
 *
 *   node scripts/dev-probes/lightmap-channel.mjs [--dir public/assets/lightmaps]
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/** Texels below this luminance are unlit or unfilled atlas slots; a ratio on them is quantisation
 *  noise, not data. The bake's own docs make the same point about alpha not being a coverage mask. */
export const LIT_THRESHOLD = 20

export function rec709(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Mean, sd and percentiles of a numeric array. Sorts in place. */
export function summarise(values) {
  values.sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
  const q = (f) => values[Math.floor(values.length * f)]
  return { n: values.length, mean, sd, p05: q(0.05), p50: q(0.5), p95: q(0.95) }
}

export async function scan(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
  const ratios = []
  const rFrac = []
  const bFrac = []
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let n = 0
  const withinSd = []
  for (const f of files) {
    const { data, info } = await sharp(path.join(dir, f))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (info.channels < 3)
      throw new Error(`${f} is not RGB — the chroma claim does not hold for it`)
    const local = []
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = rec709(r, g, b)
      if (lum < LIT_THRESHOLD) continue
      ratios.push(r / lum)
      local.push(r / lum)
      const sum = r + g + b
      rFrac.push(r / sum)
      bFrac.push(b / sum)
      rSum += r
      gSum += g
      bSum += b
      n++
    }
    if (local.length > 50) {
      const m = local.reduce((s, v) => s + v, 0) / local.length
      withinSd.push(Math.sqrt(local.reduce((s, v) => s + (v - m) ** 2, 0) / local.length))
    }
  }
  return {
    files: files.length,
    litTexels: n,
    channelMeans: { r: rSum / n, g: gSum / n, b: bSum / n },
    redToLuma: summarise(ratios),
    rFraction: summarise(rFrac),
    bFraction: summarise(bFrac),
    withinMapSd: summarise(withinSd),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'public/assets/lightmaps'
  const s = await scan(dir)
  const f = (v) => v.toFixed(4)
  console.log(
    `${s.files} maps, ${s.litTexels.toLocaleString()} lit texels (luminance >= ${LIT_THRESHOLD})\n`,
  )
  console.log(
    `channel means   R ${s.channelMeans.r.toFixed(1)}  G ${s.channelMeans.g.toFixed(1)}  B ${s.channelMeans.b.toFixed(1)}` +
      `   ${s.channelMeans.b > s.channelMeans.r ? '(blue-dominant: sky-tinted indirect)' : '(warm-dominant)'}`,
  )
  console.log(
    `R / luminance   mean ${f(s.redToLuma.mean)}  sd ${f(s.redToLuma.sd)}  p05 ${f(s.redToLuma.p05)}  p95 ${f(s.redToLuma.p95)}`,
  )
  console.log(`  -> LIGHTMAP_RED_TO_LUMA = ${s.redToLuma.mean.toFixed(4)}`)
  console.log(
    `  -> sampling .r under-reads irradiance by ${(1 / s.redToLuma.mean).toFixed(3)}x, and that factor ` +
      `varies +-${((100 * s.redToLuma.sd) / s.redToLuma.mean).toFixed(1)} % across texels`,
  )
  console.log(
    `\nhue spread      r-fraction p05 ${f(s.rFraction.p05)} p95 ${f(s.rFraction.p95)}  |  ` +
      `b-fraction p05 ${f(s.bFraction.p05)} p95 ${f(s.bFraction.p95)}`,
  )
  console.log(
    `within-map sd of R/luminance: median ${f(s.withinMapSd.p50)}  p95 ${f(s.withinMapSd.p95)}`,
  )
  console.log(
    '\nThe within-map spread is the point: it is the part no constant gain can absorb, and it is\n' +
      'why the shader samples RGB rather than a better-chosen single channel.',
  )
}
