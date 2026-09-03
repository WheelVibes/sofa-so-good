/**
 * "What IS that?" — resolve screen points to furniture item + material.
 *
 * A visual review names an offender by where it sits in the frame ("the two
 * saturated orange blocks in the foreground"), which is useless for fixing it.
 * This casts a ray through each requested NDC point, then walks UP the parent
 * chain to `Furniture.tsx`'s `userData.itemId` tag and looks the item's `defId`
 * up in the store — so a point on screen becomes a catalog definition plus the
 * exact material values (albedo, HSV saturation, roughness, metalness, bound
 * maps) that make it look the way it does.
 *
 * POINTS is a semicolon-separated list of `label:ndcX,ndcY`, measured off a
 * screenshot as `2*(px/width)-1` and `-(2*(py/height)-1)`.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'performance'
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
const POINTS = (
  process.env.POINTS ||
  'block-centre:0.09,-0.79;block-right:0.50,-0.81;coffee-table:0.02,-0.50;floor:-0.30,-0.85'
)
  .split(';')
  .map((s) => {
    const [label, xy] = s.split(':')
    const [x, y] = xy.split(',').map(Number)
    return { label, x, y }
  })

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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
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
  const { camera } = window.__three
  camera.position.set(...v.pos)
  camera.lookAt(...v.look)
  camera.updateMatrixWorld()
  const st = window.__store.getState()
  st.setManualHour(st.manualHour)
}, VIEW)
await new Promise((r) => setTimeout(r, 2000))
await assertSceneAlive(page)

const out = await page.evaluate((pts) => {
  const { scene, camera, raycaster } = window.__three
  const rc = new raycaster.constructor()
  const items = window.__store.getState().items
  const hsvSat = (c) => {
    const max = Math.max(c.r, c.g, c.b)
    const min = Math.min(c.r, c.g, c.b)
    return max === 0 ? 0 : (max - min) / max
  }
  return pts.map((p) => {
    rc.setFromCamera({ x: p.x, y: p.y }, camera)
    const hit = rc.intersectObjects(scene.children, true).find((k) => {
      const m = Array.isArray(k.object.material) ? k.object.material[0] : k.object.material
      return k.object.visible && m && m.colorWrite !== false && !(m.transparent && m.opacity < 0.05)
    })
    if (!hit) return { ...p, miss: true }
    const o = hit.object
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    let node = o
    let itemId = null
    while (node && !itemId) {
      if (node.userData?.itemId) itemId = node.userData.itemId
      node = node.parent
    }
    const item = items.find((i) => i.id === itemId)
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox
    return {
      ...p,
      def: item?.defId ?? null,
      dist: +hit.distance.toFixed(2),
      geo: o.geometry.type,
      size: bb
        ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(2))
        : null,
      matType: m.type,
      hex: m.color ? `#${m.color.getHexString()}` : null,
      sat: m.color ? +hsvSat(m.color).toFixed(2) : null,
      rough: m.roughness ?? null,
      metal: m.metalness ?? null,
      map: !!m.map,
      normal: !!m.normalMap,
      roughMap: !!m.roughnessMap,
      sheen: m.sheen ?? null,
      clearcoat: m.clearcoat ?? null,
    }
  })
}, POINTS)

console.log(`mode=${MODE} tier=${TIER} hour=${HOUR}\n`)
for (const r of out) {
  if (r.miss) {
    console.log(`${r.label.padEnd(16)} (no hit)`)
    continue
  }
  console.log(
    `${r.label.padEnd(16)} def=${String(r.def).padEnd(16)} ${r.hex} sat=${r.sat} rough=${r.rough} metal=${r.metal} ` +
      `map=${r.map ? 'y' : '.'} nrm=${r.normal ? 'y' : '.'} rghMap=${r.roughMap ? 'y' : '.'} ` +
      `${r.matType} size=${JSON.stringify(r.size)} d=${r.dist}m`,
  )
}
await browser.close()
