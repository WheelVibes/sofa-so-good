/**
 * BOOT-VIEW — what a NEW user actually sees in the first second.
 *
 * The whole photoreal arc has been measured from inside the walk camera, but the
 * app boots in `orbit` (`cameraSlice.ts: cameraMode: 'orbit'`) at a hardcoded
 * `[12, 8, 12]`, `fov: 45` (`Scene.tsx`). That dollhouse view is the first
 * impression and has barely been measured since v0.31.5.78.
 *
 * Professional dollhouse renders are a bird's-eye cutaway with the roof removed,
 * walls extrapolated so the interiors read, and every room fully furnished AND
 * decorated. This captures the untouched boot frame plus, for comparison, the
 * same pose at each tier, and reports the resolved camera + tier so the frame is
 * never judged against an assumed state.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/boot-view'
const HOURS = (process.env.HOURS || '13').split(',').map(Number)
const TIERS = (process.env.TIERS || '').split(',').filter(Boolean)
const SETTLE = Number(process.env.SETTLE || 6000)
// FLAGS / FAKENOW seed the localStorage override map and freeze the page clock
// BEFORE load — both are read once at boot, so neither can be set afterwards.
const FLAGS = process.env.FLAGS || ''
const FAKENOW = process.env.FAKENOW || ''
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
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
await page.evaluateOnNewDocument(
  (flags, fakeNow) => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
      if (flags) localStorage.setItem('hdb_feature_flags', flags)
    } catch {}
    if (fakeNow) {
      const fixed = new Date(fakeNow).getTime()
      const RealDate = Date
      // biome-ignore lint/suspicious/noGlobalAssign: probe-only clock freeze
      Date = class extends RealDate {
        constructor(...a) {
          super(...(a.length ? a : [fixed]))
        }
        static now() {
          return fixed
        }
      }
    }
  },
  FLAGS,
  FAKENOW,
)
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
// Deliberately touch NOTHING else: this is the untouched first impression.
await new Promise((r) => setTimeout(r, SETTLE))
await assertSceneAlive(page, 'after boot')

const state = await page.evaluate(() => {
  const st = window.__store.getState()
  const cam = window.__three.camera
  return {
    cameraMode: st.cameraMode,
    lightsMode: st.lightsMode,
    tier: st.qualityTier,
    timeMode: st.timeMode,
    hour: st.manualHour,
    backdrop: st.backdrop,
    uiMode: st.uiMode,
    items: (st.items ?? []).length,
    fov: cam.fov,
    pos: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)),
  }
})
console.log(`boot-view  ${JSON.stringify(state)}\n`)

// Is the sky dome actually in the scene? `Sky.tsx` bakes its equirect
// asynchronously and returns null until it resolves, so a black backdrop can mean
// either "not mounted" or "mounted but never baked" — and those are different bugs.
const sky = await page.evaluate(() => {
  const { scene } = window.__three
  const domes = []
  scene.traverse((o) => {
    const g = o.geometry
    const m = o.material
    if (!g || !m || Array.isArray(m)) return
    if (g.type !== 'SphereGeometry') return
    domes.push({
      type: m.type,
      side: m.side,
      hasMap: !!m.map,
      mapSize: m.map ? `${m.map.image?.width}x${m.map.image?.height}` : null,
      visible: o.visible,
      radius: g.parameters?.radius,
      pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(1)),
    })
  })
  return {
    background: scene.background ? scene.background.constructor.name : null,
    environment: scene.environment ? 'set' : null,
    spheres: domes,
  }
})
console.log(`  sky: ${JSON.stringify(sky)}\n`)

// Read the dome's OWN texture and the pixel the renderer actually put on screen
// where that dome should be. Bright texture + black pixel = the dome is present
// but not being drawn; dark texture = the bake is the problem. Different bugs.
const domePixels = await page.evaluate(() => {
  const { scene, camera, gl } = window.__three
  let dome = null
  scene.traverse((o) => {
    if (o.geometry?.type === 'SphereGeometry' && o.geometry.parameters?.radius > 50) dome = o
  })
  if (!dome) return { error: 'no dome' }
  const img = dome.material.map?.image
  let texel = null
  try {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    // Horizon band, straight ahead: mid-height, mid-width of the equirect.
    const d = ctx.getImageData((img.width / 2) | 0, (img.height / 2) | 0, 1, 1).data
    const up = ctx.getImageData((img.width / 2) | 0, (img.height * 0.25) | 0, 1, 1).data
    texel = { horizon: [d[0], d[1], d[2]], upper: [up[0], up[1], up[2]] }
  } catch (e) {
    texel = { error: String(e?.message ?? e) }
  }
  // Top-left of the drawing buffer, which is empty sky in the boot framing.
  const px = new Uint8Array(4)
  try {
    gl.getContext().readPixels(4, gl.getContext().drawingBufferHeight - 4, 1, 1, 6408, 5121, px)
  } catch {}
  return {
    texel,
    screenTopLeft: [px[0], px[1], px[2], px[3]],
    domeVisibleInFrustum: dome.visible && dome.material.visible,
    materialOpacity: dome.material.opacity,
    toneMapped: dome.material.toneMapped,
    layers: dome.layers.mask,
    cameraLayers: camera.layers.mask,
  }
})
console.log(`  dome: ${JSON.stringify(domePixels)}\n`)

fs.writeFileSync(`${OUT}/boot.png`, await page.screenshot({ type: 'png' }))
console.log('  boot.png  (untouched first impression)')

for (const h of HOURS) {
  if (h === state.hour && HOURS.length === 1 && !TIERS.length) break
  await page.evaluate((v) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(v)
  }, h)
  await new Promise((r) => setTimeout(r, 3000))
  fs.writeFileSync(`${OUT}/hour-${h}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  hour-${h}.png`)
}
for (const t of TIERS) {
  await page.evaluate((v) => window.__store.getState().setQualityTier(v), t)
  await new Promise((r) => setTimeout(r, 3500))
  fs.writeFileSync(`${OUT}/tier-${t}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  tier-${t}.png`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
