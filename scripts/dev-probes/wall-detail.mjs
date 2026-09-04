/**
 * Why do interior walls read as flat near-white, and which CHANNEL can fix it?
 *
 * The material audit (MATERIAL-AUDIT) established that walls are not broken:
 * 114 wall meshes carry 59 normal maps and 51 roughness maps, and the default
 * white/warm paints are `pattern: 'plaster'` — a shared 256² orange-peel normal
 * plus a roller-nap roughness drift. So the detail is AUTHORED and present, yet
 * the surfaces still look like flat cartoon planes.
 *
 * The hypothesis this probe tests is a lighting one, and it is falsifiable:
 *
 *   A normal map only shapes light that ARRIVES FROM A DIRECTION. INTERIOR-SHADOW
 *   measured that indoors the sun reaches almost nothing (real ceiling in walk,
 *   virtual occluder in orbit, walls everywhere), so interiors are lit almost
 *   entirely by fill: AmbientLight (perfectly direction-independent — a normal
 *   perturbation changes its contribution by exactly zero), HemisphereLight
 *   (interpolates on the world Y axis only, so a VERTICAL wall's small normal
 *   wobble barely moves between sky and ground colour), and the IBL probe (the
 *   only fill that can respond, and it is smooth and low-frequency by
 *   construction). If that is right, the plaster normal is invisible BY PHYSICS
 *   rather than by authoring, and no amount of strengthening it will help.
 *
 * The test is a channel sweep applied live to the wall materials, so it needs no
 * app change to answer the question:
 *
 *   A  baseline                        as shipped
 *   B  normalScale x6                  can the NORMAL channel be seen at all?
 *   C  normalMap removed               what is the normal worth today?
 *   D  subtle ALBEDO mottle added      what an albedo texture would buy
 *   E  baseline repeated               the noise floor
 *
 * Read it like this: if B and C both sit at the noise floor while D is well
 * clear of it, the wall's missing realism lives in the ALBEDO channel, and
 * authoring a stronger normal would be wasted work. If B is large, the opposite.
 *
 * Walls are identified GEOMETRICALLY (r3f meshes carry no `name` — a name-based
 * classifier reports every surface as "other"), reusing material-audit.mjs's
 * classifier: tall, thin, wide, axis-aligned boxes in real metres.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-walldetail'
const TIER = process.env.TIER || 'performance'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
if (MODE === 'walk') {
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await new Promise((r) => setTimeout(r, 3500))
}
await assertSceneAlive(page, 'after setup')

// Install the wall-material collector + the channel mutators once. Everything
// is stashed on `window.__wd` so each case is a pure state transition and the
// ORIGINAL values are always restorable (a case that leaked state would make
// every later case a comparison against the wrong baseline).
const found = await page.evaluate(() => {
  const classify = (o) => {
    if (!o.geometry) return 'other'
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox
    if (!bb) return 'other'
    if (!o.userData.__s) o.userData.__s = new o.position.constructor()
    const s = o.getWorldScale(o.userData.__s)
    const w = (bb.max.x - bb.min.x) * Math.abs(s.x)
    const h = (bb.max.y - bb.min.y) * Math.abs(s.y)
    const d = (bb.max.z - bb.min.z) * Math.abs(s.z)
    if (h > 1.6 && Math.min(w, d) < 0.45 && Math.max(w, d) > 0.8) return 'wall'
    return 'other'
  }
  const mats = new Set()
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    if (classify(o) !== 'wall') return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m)
  })
  const list = [...mats]
  // A subtle painted-plaster albedo mottle: near-white so it MULTIPLIES the
  // material colour (three's `map` is multiplicative) and only ever darkens by a
  // few percent — the amplitude a real skim-coat-and-roller wall shows, not a
  // decorative pattern. Value noise at two octaves, no hard edges.
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  const img = ctx.createImageData(S, S)
  const rnd = (() => {
    let s = 1337
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
  })()
  const grid = (n) => {
    const g = new Float32Array(n * n)
    for (let i = 0; i < g.length; i++) g[i] = rnd()
    return g
  }
  const lerp = (a, b, t) => a + (b - a) * t
  const smooth = (t) => t * t * (3 - 2 * t)
  const sample = (g, n, x, y) => {
    const fx = x * n
    const fy = y * n
    const x0 = Math.floor(fx) % n
    const y0 = Math.floor(fy) % n
    const x1 = (x0 + 1) % n
    const y1 = (y0 + 1) % n
    const tx = smooth(fx - Math.floor(fx))
    const ty = smooth(fy - Math.floor(fy))
    return lerp(
      lerp(g[y0 * n + x0], g[y0 * n + x1], tx),
      lerp(g[y1 * n + x0], g[y1 * n + x1], tx),
      ty,
    )
  }
  const g1 = grid(8)
  const g2 = grid(32)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const n = 0.65 * sample(g1, 8, u, v) + 0.35 * sample(g2, 32, u, v)
      // 0.955 .. 1.0 of the base colour — a whisper, deliberately.
      const c = Math.round(255 * (0.955 + 0.045 * n))
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  window.__wd = {
    mats: list,
    orig: list.map((m) => ({
      m,
      normalScale: m.normalScale ? m.normalScale.clone() : null,
      normalMap: m.normalMap || null,
      map: m.map || null,
    })),
    canvas: cv,
    mottle: null,
  }
  return { walls: list.length, withNormal: list.filter((m) => m.normalMap).length }
})
console.log(`mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log(`wall materials: ${found.walls} (with normalMap: ${found.withNormal})\n`)

const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }

async function applyCase(key) {
  await page.evaluate((k) => {
    const wd = window.__wd
    // Always restore first, so a case never inherits the previous one's state.
    for (const o of wd.orig) {
      if (o.normalScale) o.m.normalScale.copy(o.normalScale)
      o.m.normalMap = o.normalMap
      o.m.map = o.map
      o.m.needsUpdate = true
    }
    if (k === 'B') for (const m of wd.mats) m.normalScale?.multiplyScalar(6)
    if (k === 'C') for (const m of wd.mats) m.normalMap = null
    if (k === 'D') {
      if (!wd.mottle) {
        // Build the CanvasTexture from a live material's existing map/normalMap
        // constructor family — the probe has no import of three, so the class is
        // taken from an object three itself created.
        const src = wd.mats.find((m) => m.normalMap)?.normalMap
        if (!src) return
        const T = src.constructor
        const t = new T(wd.canvas)
        t.wrapS = src.wrapS
        t.wrapT = src.wrapT
        t.colorSpace = 'srgb'
        // Wall faces carry METRE UVs and the paints tile at 2.5 m, exactly like
        // the shared plaster normal (generators.ts:buildPlasterMaps).
        t.repeat.set(1 / 2.5, 1 / 2.5)
        t.anisotropy = src.anisotropy
        t.needsUpdate = true
        wd.mottle = t
      }
      for (const m of wd.mats) m.map = wd.mottle
    }
    for (const m of wd.mats) m.needsUpdate = true
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, key)
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, VIEW)
  await new Promise((r) => setTimeout(r, 1800))
  await assertSceneAlive(page, `case ${key}`)
  return page.screenshot({ type: 'png' })
}

const W = 1280 * DSF
const H = 800 * DSF
const BOX = {
  left: Math.round(W * 0.25),
  top: Math.round(H * 0.28),
  width: Math.round(W * 0.5),
  height: Math.round(H * 0.44),
}
const raw = (buf) => sharp(buf).extract(BOX).removeAlpha().raw().toBuffer()

function diff(a, b) {
  let changed = 0
  let abs = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    abs += d
    if (d > 8) changed++
  }
  return { pct: (100 * changed) / a.length, mean: abs / a.length }
}

const CASES = [
  { key: 'warm', label: 'warm-up (discarded)' },
  { key: 'A', label: 'baseline (as shipped)' },
  { key: 'B', label: 'normalScale x6' },
  { key: 'C', label: 'normalMap removed' },
  { key: 'D', label: 'subtle albedo mottle added' },
  { key: 'E', label: 'baseline repeated (noise floor)' },
]
const px = {}
const stats = {}
for (const c of CASES) {
  const buf = await applyCase(c.key === 'warm' || c.key === 'E' ? 'A' : c.key)
  if (c.key === 'warm') continue
  fs.writeFileSync(`${OUT}/${MODE}-${TIER}-h${HOUR}-${c.key}.png`, buf)
  px[c.key] = await raw(buf)
  stats[c.key] = await frameStats(buf, {
    x: BOX.left,
    y: BOX.top,
    w: BOX.width,
    h: BOX.height,
  })
  console.log(
    `${c.key} ${c.label.padEnd(34)} mean=${String(stats[c.key].mean).padStart(6)}  sd=${String(stats[c.key].sd).padStart(5)}  clipped=${stats[c.key].clipped}`,
  )
}
console.log('')
const show = (l, d) =>
  console.log(`  ${l.padEnd(40)} pixels>8=${d.pct.toFixed(2)}%  meanAbsDiff=${d.mean.toFixed(2)}`)
show('A vs E  (NOISE FLOOR)', diff(px.A, px.E))
show('A vs B  (normal x6 — is normal visible?)', diff(px.A, px.B))
show('A vs C  (what the normal is worth today)', diff(px.A, px.C))
show('A vs D  (what an albedo mottle would buy)', diff(px.A, px.D))
console.log(
  '\nB and C at the noise floor while D is clear of it => the missing detail is ALBEDO,\n' +
    'and strengthening the plaster normal is wasted work.',
)
await browser.close()
