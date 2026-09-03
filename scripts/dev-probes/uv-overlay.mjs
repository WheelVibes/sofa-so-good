/**
 * Where do the runtime's `uv1` lookups land relative to the baked data?
 *
 * Every lightmap diagnostic so far aggregated over pixels or texels: the shader
 * samples ~0 on 44.5 % of the mapped shell, the maps are 55 % zero texels, the
 * slot-level occupancy agrees between bake and runtime (`v0.31.7.99`, `flipped = 0`).
 * None of those can see a fault in the CORRESPONDENCE between a face's UVs and the
 * texels the bake actually wrote — a slot is a 21x32 region and a face may cover
 * only part of it.
 *
 * So this rasterises the app's own `uv1` triangles into a 64x64 coverage mask and
 * compares it, texel by texel, against the non-zero mask of the very PNG that mesh
 * was handed. Two numbers settle it:
 *
 *   - covered texels that are ZERO in the map  -> lookups landing on nothing
 *   - non-zero texels never covered            -> baked data nobody reads
 *
 * A clean pipeline has both near zero. It also writes a side-by-side image,
 * because "look at the artefact" has caught more in this arc than any statistic.
 *
 *   node scripts/dev-probes/uv-overlay.mjs --dir=lm-v99 [--out=/tmp/uv-overlay.png]
 */
import fs from 'node:fs'
import process from 'node:process'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl } from './lib.mjs'
import { readRed } from './read-image.mjs'

const args = process.argv.slice(2)
const dirArg = args.find((a) => a.startsWith('--dir='))
const DIR = dirArg ? dirArg.slice(6) : 'lm-v99'
const outArg = args.find((a) => a.startsWith('--out='))
const OUT = outArg ? outArg.slice(6) : '/tmp/uv-overlay.png'
const RES = Number(args.find((a) => a.startsWith('--res='))?.slice(6) ?? 64)

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate(() => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(13)
  s.setCameraMode('firstPerson')
})
await new Promise((r) => setTimeout(r, 5000))

const meshes = await page.evaluate(() => {
  const out = []
  window.__three.scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
    for (const m of mats) {
      if (!m.userData?.visLightmap) continue
      const src = m.userData.visMapUrl ?? null
      const g = o.geometry
      const uv1 = g?.getAttribute?.('uv1')
      if (!src || !uv1) continue
      out.push({
        src,
        uv: Array.from(uv1.array),
        index: g.index ? Array.from(g.index.array) : null,
        count: uv1.count,
      })
    }
  })
  return out
})
await browser.close()
console.log(`  ${meshes.length} patched mesh(es) with uv1 and a resolved map`)
if (meshes.length === 0) process.exit(1)

/** Rasterise the uv1 triangles into an RES x RES coverage mask. */
const coverage = (m) => {
  const cov = new Uint8Array(RES * RES)
  const idx = m.index ?? Array.from({ length: m.count }, (_, i) => i)
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const p = [0, 1, 2].map((k) => {
      const vi = idx[t + k]
      return [m.uv[vi * 2] * RES, m.uv[vi * 2 + 1] * RES]
    })
    const minX = Math.max(0, Math.floor(Math.min(...p.map((q) => q[0]))))
    const maxX = Math.min(RES - 1, Math.ceil(Math.max(...p.map((q) => q[0]))))
    const minY = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1]))))
    const maxY = Math.min(RES - 1, Math.ceil(Math.max(...p.map((q) => q[1]))))
    const area =
      (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
    if (Math.abs(area) < 1e-12) continue
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / area
        const w1 = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) cov[y * RES + x] = 1
      }
    }
  }
  return cov
}

let totCov = 0
let totCovZero = 0
let totData = 0
let totDataUncov = 0
const rows = []
for (const m of meshes) {
  const file = m.src.split('/').pop()
  const path = `public/assets/${DIR}/${file}`
  if (!fs.existsSync(path)) continue
  const { v, max } = await readRed(path)
  const cov = coverage(m)
  let c = 0
  let cz = 0
  let d = 0
  let du = 0
  // `cov` is indexed in UV space (v = 0 at the BOTTOM); `readRed` returns PNG
  // rows (row 0 at the TOP). Comparing them directly compares MIRRORED masks --
  // which is exactly what the first version of this probe did, and it reported
  // 33 % of lookups landing on nothing for footprints that sit in one half.
  const at = (i) => {
    const x = i % RES
    const y = Math.floor(i / RES)
    return v[(RES - 1 - y) * RES + x]
  }
  for (let i = 0; i < cov.length; i++) {
    const nonZero = at(i) > 0
    if (cov[i]) {
      c++
      if (!nonZero) cz++
    }
    if (nonZero) {
      d++
      if (!cov[i]) du++
    }
  }
  totCov += c
  totCovZero += cz
  totData += d
  totDataUncov += du
  rows.push([file.slice(9, 17), c, (100 * cz) / (c || 1), d, (100 * du) / (d || 1), max])
}
rows.sort((a, b) => b[2] - a[2])
console.log('\n  key       covered  covered-but-ZERO   baked  baked-but-UNREAD')
for (const [k, c, cz, d, du] of rows.slice(0, 8))
  console.log(
    `  ${k}  ${String(c).padStart(7)}  ${cz.toFixed(1).padStart(15)} %  ${String(d).padStart(6)}  ${du.toFixed(1).padStart(14)} %`,
  )
console.log(
  `\n  TOTAL: ${((100 * totCovZero) / (totCov || 1)).toFixed(1)} % of lookups land on ZERO texels; ` +
    `${((100 * totDataUncov) / (totData || 1)).toFixed(1)} % of baked texels are never read`,
)

// Write the WORST mesh as three panels: where the shader reads, where the bake
// wrote, and the overlap. Aggregates have been wrong twice in this thread while
// the picture was right the first time, so the picture ships with the numbers.
if (rows.length > 0) {
  const worstKey = rows[0][0]
  const m = meshes.find((x) => x.src.includes(worstKey))
  if (m) {
    const { v } = await readRed(`public/assets/${DIR}/${m.src.split('/').pop()}`)
    const cov = coverage(m)
    const SCALE = 6
    const GAP = 4
    const W = RES * 3 * SCALE + GAP * 4
    const H = RES * SCALE + GAP * 2
    const px = Buffer.alloc(W * H * 3, 40)
    const put = (panel, x, y, rgb) => {
      const ox = GAP + panel * (RES * SCALE + GAP)
      for (let sy = 0; sy < SCALE; sy++)
        for (let sx = 0; sx < SCALE; sx++) {
          const i = ((GAP + y * SCALE + sy) * W + ox + x * SCALE + sx) * 3
          px[i] = rgb[0]
          px[i + 1] = rgb[1]
          px[i + 2] = rgb[2]
        }
    }
    for (let y = 0; y < RES; y++)
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x
        // Same UV-space indexing as `cov`, so the two panels are comparable.
        const data = v[(RES - 1 - y) * RES + x] > 0
        put(0, x, RES - 1 - y, cov[i] ? [80, 180, 255] : [0, 0, 0]) // UV coverage
        put(1, x, RES - 1 - y, data ? [255, 200, 80] : [0, 0, 0]) // baked data
        put(
          2,
          x,
          RES - 1 - y,
          cov[i] && data
            ? [120, 255, 120]
            : cov[i]
              ? [255, 60, 60]
              : data
                ? [90, 70, 20]
                : [0, 0, 0],
        )
      }
    await sharp(px, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(OUT)
    console.log(
      `  wrote ${OUT} for ${worstKey}: blue = UV coverage, amber = baked data,\n` +
        '    green = both, RED = read-but-empty, dim amber = written-but-unread',
    )
  }
}
