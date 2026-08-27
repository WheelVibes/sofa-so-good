/**
 * Measure ONE surface class, wherever it happens to be on screen.
 *
 * A generalisation of `wood-detail.mjs`'s masking half: pick a surface by casting
 * a ray through a named NDC point, group every material in the scene that shares
 * that material's identity, mask the screen cells those materials occupy, and
 * report statistics over THOSE PIXELS ONLY:
 *
 *   chroma / >0.35 sat   how colourful the surface renders
 *   mean                 its luminance
 *   sigma                its own contrast (the low-frequency design)
 *   microcontrast        mean |neighbour difference| at full resolution — the
 *                        HIGH-frequency channel, which a cell-mean average is
 *                        blind to. This is the metric that shows an aliased
 *                        normal map (see WOOD-PORE-NYQUIST / FABRIC-FINE-NYQUIST);
 *                        without it a de-aliasing fix reads as "no change".
 *
 * Why a mask and not a rectangle: the standard centre slab misses whatever you
 * are actually looking at (`wood-detail.mjs`'s first run reported every case at
 * the noise floor because the chair backs sit at ~90% of the frame height), and
 * in WALK mode the camera cannot be aimed at all — `FirstPersonCamera` discards
 * a programmatic `lookAt`. A mask sidesteps both: whatever the controller points
 * at, the right pixels are still found.
 *
 * Env: `POINT=x,y` (NDC of a pixel ON the surface, measured off a screenshot),
 * `MODE`, `TIER`, `HOUR`, `LABEL`.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-surface'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
const LABEL = process.env.LABEL || 'surface'
const POINT = (process.env.POINT || '0.42,-0.12').split(',').map(Number)
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
const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }
await page.evaluate((v) => {
  const { camera, controls } = window.__three
  camera.position.set(...v.pos)
  if (controls?.target) {
    controls.target.set(...v.look)
    controls.update()
  } else camera.lookAt(...v.look)
  camera.updateMatrixWorld()
  const st = window.__store.getState()
  st.setManualHour(st.manualHour)
}, VIEW)
await new Promise((r) => setTimeout(r, 2500))
await assertSceneAlive(page, 'after setup')

const GX = 96
const GY = 60
const found = await page.evaluate(
  (pt, gx, gy) => {
    const { scene, camera, raycaster } = window.__three
    const rc = new raycaster.constructor()
    const visible = (k) => {
      const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
      return k.object.visible && m && m.colorWrite !== false && !(m.transparent && m.opacity < 0.05)
    }
    rc.setFromCamera({ x: pt[0], y: pt[1] }, camera)
    const seed = rc.intersectObjects(scene.children, true).find(visible)
    if (!seed) return { n: 0, why: 'no hit at POINT' }
    const ref = Array.isArray(seed.object.material) ? seed.object.material[0] : seed.object.material
    // Group by shared MAP SOURCE when there is a map (clones share it), else by
    // the material object itself.
    const src = ref.normalMap?.source ?? ref.map?.source ?? null
    const mats = []
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const ms = m.normalMap?.source ?? m.map?.source ?? null
        if ((src && ms === src) || m === ref) if (!mats.includes(m)) mats.push(m)
      }
    })
    const mask = []
    let n = 0
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        rc.setFromCamera({ x: ((ix + 0.5) / gx) * 2 - 1, y: -(((iy + 0.5) / gy) * 2 - 1) }, camera)
        const hit = rc.intersectObjects(scene.children, true).find(visible)
        let ok = 0
        if (hit) {
          const m = Array.isArray(hit.object.material)
            ? hit.object.material[0]
            : hit.object.material
          if (mats.includes(m)) ok = 1
        }
        mask.push(ok)
        n += ok
      }
    }
    return {
      n,
      mask,
      mats: mats.length,
      hex: ref.color ? `#${ref.color.getHexString()}` : null,
      rough: ref.roughness ?? null,
      metal: ref.metalness ?? null,
      type: ref.type,
      maps: {
        map: !!ref.map,
        normalMap: !!ref.normalMap,
        roughnessMap: !!ref.roughnessMap,
      },
    }
  },
  POINT,
  GX,
  GY,
)

if (!found.n) {
  console.log(`no surface found (${found.why ?? 'mask empty'})`)
  await browser.close()
  process.exit(1)
}

const W = 1280 * DSF
const H = 800 * DSF
const CW = W / GX
const CH = H / GY
const BW = Math.max(1, Math.floor(CW * 0.5))
const BH = Math.max(1, Math.floor(CH * 0.5))
const buf = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/${LABEL}-${MODE}-${TIER}-h${HOUR}.png`, buf)
const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]

let cSum = 0
let over = 0
let lSum = 0
let lSq = 0
let cells = 0
let step = 0
let steps = 0
for (let iy = 0; iy < GY; iy++) {
  for (let ix = 0; ix < GX; ix++) {
    if (!found.mask[iy * GX + ix]) continue
    const x0 = Math.round(ix * CW + (CW - BW) / 2)
    const y0 = Math.round(iy * CH + (CH - BH) / 2)
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y0 + BH; y++) {
      for (let x = x0; x < x0 + BW; x++) {
        const i = (y * info.width + x) * 3
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n++
        if (x < x0 + BW - 1) {
          step += Math.abs(lum(i + 3) - lum(i))
          steps++
        }
      }
    }
    r /= n
    g /= n
    b /= n
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    cSum += sat
    if (sat > 0.35) over++
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lSum += l
    lSq += l * l
    cells++
  }
}
const mean = lSum / cells
const sd = Math.sqrt(Math.max(0, lSq / cells - mean * mean))
console.log(`${LABEL}  mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log(
  `  seed material: ${found.type} ${found.hex} rough=${found.rough} metal=${found.metal} ` +
    `map=${found.maps.map ? 'y' : '.'} nrm=${found.maps.normalMap ? 'y' : '.'} rgh=${found.maps.roughnessMap ? 'y' : '.'}  (${found.mats} materials share it)`,
)
console.log(
  `  masked ${found.n}/${GX * GY} screen cells (${((100 * found.n) / (GX * GY)).toFixed(1)}%)`,
)
console.log(
  `  chroma=${(cSum / cells).toFixed(3)}  >0.35=${((100 * over) / cells).toFixed(1)}%  mean=${mean.toFixed(1)}  sigma=${sd.toFixed(2)}  microcontrast=${(step / steps).toFixed(3)}`,
)
await browser.close()
