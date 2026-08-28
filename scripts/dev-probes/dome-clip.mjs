/**
 * DOME-CLIP — is the orbit sky surround clipped by the camera FAR plane?
 *
 * `Sky.tsx` puts its surround sphere at `DOME_RADIUS = 400` under a comment
 * asserting that is "well inside the camera far plane". That is an assumption
 * carried in a comment, never a measurement — and the boot frame shows a large
 * faceted polygon of a DIFFERENT colour sitting in the middle of the background,
 * which is exactly what a far-plane cut through a low-segment sphere looks like.
 *
 * This reports the camera far plane against the ACTUAL per-vertex dome distances
 * from the live orbit pose, plus how many of the dome's own vertices fall outside
 * it, so the claim is checked rather than believed.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'medium'
const HOUR = Number(process.env.HOUR || 13)

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
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
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
await assertSceneAlive(page, 'after setup')

const out = await page.evaluate(() => {
  const { scene, camera } = window.__three
  let dome = null
  scene.traverse((o) => {
    const g = o.geometry
    if (o.isMesh && o.material?.isMeshBasicMaterial && g?.parameters?.radius > 50) dome = o
  })
  if (!dome) return { error: 'no dome found' }
  const pos = dome.geometry.attributes.position
  const v = camera.position.clone()
  let min = Infinity
  let max = 0
  let clipped = 0
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(dome.matrixWorld)
    const d = v.distanceTo(camera.position)
    if (d < min) min = d
    if (d > max) max = d
    if (d > camera.far) clipped++
  }
  return {
    cameraFar: camera.far,
    cameraNear: camera.near,
    domeRadius: dome.geometry.parameters.radius,
    segments: `${dome.geometry.parameters.widthSegments}x${dome.geometry.parameters.heightSegments}`,
    domeDistMin: +min.toFixed(1),
    domeDistMax: +max.toFixed(1),
    vertsBeyondFar: `${clipped}/${pos.count}`,
    camPos: camera.position.toArray().map((n) => +n.toFixed(1)),
  }
})

console.log(`tier=${TIER} hour=${HOUR}`)
for (const [k, val] of Object.entries(out)) console.log(`  ${k.padEnd(16)} ${val}`)
await browser.close()
