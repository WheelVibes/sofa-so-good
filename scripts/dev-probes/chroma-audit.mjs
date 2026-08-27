/**
 * What actually reads as "animation style"? — rank surfaces by SCREEN COVERAGE
 * and CHROMA, not by eye.
 *
 * MATERIAL-AUDIT answered "are the maps bound" and wall-detail.mjs answered
 * "which channel can the walls even respond in" (the normal, not the albedo —
 * the reverse of the fill-lit prediction). Neither answers the question the user
 * actually asked, which is why the whole image reads as a cartoon. Reviewing the
 * walk-mode frames, the strongest cartoon cue is not the walls at all: it is a
 * handful of surfaces carrying **very saturated albedo** (orange-brown timber,
 * near-black gloss) sitting next to a scene that is otherwise desaturated cream.
 * Real interior photographs are overwhelmingly LOW chroma — a photographed teak
 * table lands around 0.25–0.35 HSV saturation, not 0.6+.
 *
 * "Which material is the worst" has to be weighted by how much of the frame it
 * occupies, or a lurid 2 cm trinket outranks the floor. So coverage is measured
 * by RAYCASTING a grid of screen points through the live camera — cheap, exact,
 * and independent of the renderer — and each hit is attributed to the material
 * it landed on. The report is then per-material: coverage %, HSV saturation of
 * its albedo, roughness/metalness, and whether an albedo MAP is bound (a map
 * breaks up a flat colour, so an unmapped high-chroma surface is the worst case).
 *
 * It also reports the rendered frame's own chroma histogram, so a fix can be
 * judged against the picture rather than against the material list.
 *
 * Cheap enough to run per-view; pass MODE/VIEW to move the camera.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-chroma'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
const TOP = Number(process.env.TOP || 18)
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

const VIEWS =
  MODE === 'walk'
    ? [
        { name: 'living', pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] },
        { name: 'dining', pos: [11.0, 1.6, 5.6], look: [11.0, 1.4, 3.0] },
        { name: 'bedroom', pos: [4.5, 1.6, 3.6], look: [3.2, 1.4, 2.0] },
      ]
    : [{ name: 'orbit', pos: [12, 8, 12], look: [0, 0, 0] }]

for (const view of VIEWS) {
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, view)
  await new Promise((r) => setTimeout(r, 2000))
  await assertSceneAlive(page, view.name)

  const report = await page.evaluate(() => {
    const { scene, camera } = window.__three
    // Build a raycaster from a class three itself created — the probe imports no
    // three of its own, and the app's copy is the only one guaranteed to share
    // the same internals as the live scene graph.
    const V2 = camera.position.constructor.prototype.constructor
    void V2
    const rc = new window.__three.raycaster.constructor()
    const GX = 96
    const GY = 60
    const byMat = new Map()
    let hits = 0
    const ndc = { x: 0, y: 0 }
    for (let iy = 0; iy < GY; iy++) {
      for (let ix = 0; ix < GX; ix++) {
        ndc.x = ((ix + 0.5) / GX) * 2 - 1
        ndc.y = -(((iy + 0.5) / GY) * 2 - 1)
        rc.setFromCamera(ndc, camera)
        const hit = rc.intersectObjects(scene.children, true)
        // Skip invisible helpers (the ceiling occluder writes no colour) and
        // fully-faded reveal surfaces — neither contributes a rendered pixel.
        const h = hit.find((k) => {
          const m = k.object.material
          const mm = Array.isArray(m) ? m[0] : m
          return (
            k.object.visible &&
            mm &&
            mm.colorWrite !== false &&
            !(mm.transparent && mm.opacity < 0.05)
          )
        })
        if (!h) continue
        hits++
        const m0 = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
        const key = `${m0.type}|${m0.name || '-'}|#${m0.color?.getHexString?.() ?? '------'}`
        let e = byMat.get(key)
        if (!e) {
          e = {
            key,
            n: 0,
            hex: m0.color ? `#${m0.color.getHexString()}` : null,
            rough: m0.roughness ?? null,
            metal: m0.metalness ?? null,
            hasMap: !!m0.map,
            hasNormal: !!m0.normalMap,
          }
          byMat.set(key, e)
        }
        e.n++
      }
    }
    const total = GX * GY
    return {
      total,
      hits,
      mats: [...byMat.values()].sort((a, b) => b.n - a.n),
    }
  })

  const hsvSat = (hex) => {
    if (!hex) return null
    const r = Number.parseInt(hex.slice(1, 3), 16) / 255
    const g = Number.parseInt(hex.slice(3, 5), 16) / 255
    const b = Number.parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return max === 0 ? 0 : (max - min) / max
  }

  console.log(
    `\n=== ${MODE}/${view.name}  tier=${TIER} hour=${HOUR} — ${report.hits}/${report.total} rays hit geometry`,
  )
  console.log('  cover%  sat  rough metal map nrm  colour   material')
  // The "chroma budget": coverage x saturation. A surface only pushes the frame
  // toward cartoon in proportion to BOTH how lurid and how large it is.
  const rows = report.mats.slice(0, TOP).map((m) => ({ ...m, sat: hsvSat(m.hex) }))
  for (const m of rows) {
    const cov = (100 * m.n) / report.hits
    console.log(
      `  ${cov.toFixed(1).padStart(5)}%  ${(m.sat ?? 0).toFixed(2)}  ${(m.rough ?? 0).toFixed(2)}  ${(m.metal ?? 0).toFixed(2)}  ${m.hasMap ? ' y' : ' .'}  ${m.hasNormal ? ' y' : ' .'}  ${(m.hex ?? '-').padEnd(8)} ${m.key.split('|').slice(0, 2).join(' ')}`,
    )
  }
  const budget = rows
    .map((m) => ({ ...m, score: ((100 * m.n) / report.hits) * (m.sat ?? 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
  console.log('  worst chroma budget (coverage x saturation):')
  for (const m of budget) {
    console.log(
      `    ${m.score.toFixed(1).padStart(5)}  ${m.hex}  sat=${m.sat.toFixed(2)}  cover=${((100 * m.n) / report.hits).toFixed(1)}%  map=${m.hasMap ? 'yes' : 'NO'}`,
    )
  }

  const buf = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUT}/${MODE}-${view.name}-${TIER}-h${HOUR}.png`, buf)
  // Rendered-frame chroma: the picture's own verdict, independent of the
  // material list. Centre slab only, clear of the DOM overlays.
  const W = 1280 * DSF
  const H = 800 * DSF
  const { data } = await sharp(buf)
    .extract({
      left: Math.round(W * 0.25),
      top: Math.round(H * 0.28),
      width: Math.round(W * 0.5),
      height: Math.round(H * 0.44),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let over = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    const s = max === 0 ? 0 : (max - min) / max
    sum += s
    if (s > 0.35) over++
  }
  console.log(
    `  rendered frame: mean chroma ${(sum / n).toFixed(3)}, ${((100 * over) / n).toFixed(1)}% of pixels above 0.35 saturation`,
  )
}
await browser.close()
