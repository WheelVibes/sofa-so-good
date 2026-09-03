/**
 * How NOISY is a baked lightmap, independent of what it is a map of?
 *
 * `v0.31.7.20` improved the bake by eye — salt-and-pepper gone, soft mottling left — and the
 * spatial metric could not see either artefact, because it averages over image columns. Judging
 * every attempt by rendering the app and looking is slow and subjective, so this measures the
 * map itself.
 *
 * Aperture visibility is smooth at room scale by construction (`v0.31.7.9`: full-GI visibility,
 * varying over metres), so **any** high-frequency content in the map is noise. This reports the
 * energy left after a 3x3 low-pass — i.e. what the blur has not removed — normalised by the
 * map's own mean so maps at different brightness are comparable.
 *
 * Per atlas slot, because the 3x2 packing puts hard discontinuities at slot borders and counting
 * those as noise would swamp the measurement.
 *
 * TWO SCALES, because they have different causes and different cures. A 3x3 residual sees
 * salt-and-pepper sampling noise, which a blur removes. A 9x9 residual sees the soft MOTTLING
 * that survives a blur — low-frequency Monte Carlo error, which only more samples can fix,
 * since a low-pass just spreads it. Reporting one scale hid that distinction in `v0.31.7.20`.
 *
 * `--ref=<dir>` switches to a different and stronger question: not "how rough is this map" but
 * **"how wrong is it"**. It compares each map against the same key in a heavily-supersampled
 * bake, per texel, at every scale at once. The two-scale residual above cannot see error coarser
 * than its kernel — `v0.31.7.20`'s visible wall mottling sits beyond 9×9 — and a low-pass
 * residual also cannot distinguish *noise* from real, wanted structure. A ground-truth diff
 * answers both: any difference from a converged bake is error by definition.
 *
 * Usage: node scripts/dev-probes/bake-noise.mjs <dir> [<dir> …] [--ref=<groundTruthDir>]
 */
import fs from 'node:fs'
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const refArg = args.find((a) => a.startsWith('--ref='))
const refDir = refArg ? refArg.slice(6) : null
const dirs = args.filter((a) => !a.startsWith('--'))
if (!dirs.length) {
  console.error('usage: bake-noise.mjs <bakeDir> [<bakeDir> …]')
  process.exit(1)
}

async function noiseOf(file, radius) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const at = (x, y) => data[(y * w + x) * 3]
  let hp = 0
  let sum = 0
  let n = 0
  for (let sy = 0; sy < 2; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const x0 = Math.floor((sx * w) / 3) + radius
      const x1 = Math.floor(((sx + 1) * w) / 3) - radius
      const y0 = Math.floor((sy * h) / 2) + radius
      const y1 = Math.floor(((sy + 1) * h) / 2) - radius
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          let mean = 0
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) mean += at(x + dx, y + dy)
          mean /= 9
          hp += (at(x, y) - mean) ** 2
          sum += at(x, y)
          n += 1
        }
      }
    }
  }
  return n ? { rms: Math.sqrt(hp / n), mean: sum / n } : null
}

/** Per-texel RMS difference against the same key in the reference bake, in counts and %. */
async function diffAgainstRef(dir, maps) {
  const refIndex = JSON.parse(fs.readFileSync(`${refDir}/index.json`, 'utf8'))
  const refByKey = new Map(refIndex.maps.map((m) => [m.key, m.file]))
  let acc = 0
  let accRel = 0
  let k = 0
  let worst = 0
  let accDark = 0
  let kDark = 0
  for (const m of maps) {
    const refFile = refByKey.get(m.key)
    if (!refFile) continue
    const [a, b] = await Promise.all(
      [`${dir}/${m.file}`, `${refDir}/${refFile}`].map((f) =>
        sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      ),
    )
    if (a.data.length !== b.data.length) continue
    let se = 0
    let sum = 0
    let n = 0
    // DARK texels only, in a second accumulator. A whole-map relative error is normalised by
    // a mean the exterior faces dominate -- they see open sky and bake to 1.0 -- so a large
    // error on the DARK interior faces, which are the ones a camera inside the room actually
    // sees, is diluted into invisibility. `v0.31.7.22` reported 1.5 % on that basis and
    // concluded the bake was accurate; `v0.31.7.25` found slot (0,0) of a visible wall is pure
    // noise. Both are true of different texels, which is the whole problem with the first
    // figure.
    let seDark = 0
    let sumDark = 0
    let nDark = 0
    const DARK = 0.1 * 255
    for (let i = 0; i < a.data.length; i += 3) {
      se += (a.data[i] - b.data[i]) ** 2
      sum += b.data[i]
      n += 1
      if (b.data[i] > 0 && b.data[i] < DARK) {
        seDark += (a.data[i] - b.data[i]) ** 2
        sumDark += b.data[i]
        nDark += 1
      }
    }
    const rms = Math.sqrt(se / n)
    const mean = sum / n
    if (mean < 1) continue
    acc += rms
    accRel += rms / mean
    worst = Math.max(worst, rms / mean)
    if (nDark > 32 && sumDark / nDark > 0.5) {
      accDark += Math.sqrt(seDark / nDark) / (sumDark / nDark)
      kDark += 1
    }
    k += 1
  }
  return k
    ? {
        rms: acc / k,
        rel: (100 * accRel) / k,
        worst: 100 * worst,
        dark: kDark ? (100 * accDark) / kDark : null,
        k,
      }
    : null
}

for (const dir of dirs) {
  const index = JSON.parse(fs.readFileSync(`${dir}/index.json`, 'utf8'))
  const sample = index.maps.sort((a, b) => b.area - a.area).slice(0, 8)
  const out = []
  for (const radius of [1, 4]) {
    let rel = 0
    let k = 0
    for (const m of sample) {
      const r = await noiseOf(`${dir}/${m.file}`, radius)
      if (!r || r.mean < 1) continue
      rel += r.rms / r.mean
      k += 1
    }
    out.push(`${radius === 1 ? '3x3' : '9x9'} ${((100 * rel) / k).toFixed(1)} %`)
  }
  let extra = ''
  if (refDir && refDir !== dir) {
    const d = await diffAgainstRef(dir, sample)
    extra = d
      ? `   |  vs truth: ${d.rel.toFixed(1)} % of mean (worst ${d.worst.toFixed(1)} %)` +
        `   DARK texels only: ${d.dark === null ? 'n/a' : `${d.dark.toFixed(1)} %`}`
      : '   |  vs ground truth: no comparable maps'
  }
  console.log(`${dir.padEnd(20)} residual vs mean:  ${out.join('   ')}${extra}`)
}
