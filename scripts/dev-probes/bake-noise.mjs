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
 * Usage: node scripts/dev-probes/bake-noise.mjs <dir> [<dir> …]
 */
import fs from 'node:fs'
import process from 'node:process'
import sharp from 'sharp'

const dirs = process.argv.slice(2)
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
  console.log(`${dir.padEnd(20)} residual vs mean:  ${out.join('   ')}`)
}
