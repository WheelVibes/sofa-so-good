/**
 * EDITOR-LOCKSTEP — does the room editor canvas actually mount what orbit mounts?
 *
 * `src/scene/CLAUDE.md` requires `RoomEditorScene.tsx` to stay in LOCK-STEP with
 * `Scene.tsx`'s render systems, so a finish looks the same in the editor as it does
 * in orbit at the user's tier. Nothing in this loop has ever verified that at
 * runtime, and every fix shipped here landed in the main scene.
 *
 * A source-level diff of mounted components is necessary but not sufficient — a
 * component can be present and still render nothing (the Sky returns null under a
 * photo backdrop; Effects is tier-gated; FurnitureLights returns null with the lamps
 * off). So this censuses the LIVE scene graph by each system's runtime SIGNATURE:
 *
 *   ibl            scene.environment is set                  (SceneEnvironment)
 *   domeRadius     a big MeshBasicMaterial sphere            (Sky)
 *   sunShadowMap   a shadow-casting DirectionalLight         (Lighting + SHADOW-TEXEL)
 *   shadowType     gl.shadowMap.type                         (RendererTierController: VSM on Medium+)
 *   occluders      colorWrite:false + opacity:0 meshes       (CeilingOccluder)
 *   pointLights    live fixture lights                       (FurnitureLights)
 *   renderCalls    render() calls per animation frame        (the post stack issues ~18 siblings)
 *   dpr / cameraFar / maxAnisotropy                          (QualityController / SCENE_CAMERA_FAR / AnisotropyController)
 *
 * Both canvases are censused in ONE run (meta-rule i). They are mutually exclusive
 * in `App.tsx` (`roomEditor ? <RoomEditorScene/> : <Scene/>`), so the probe enters
 * and exits the editor rather than reading both at once — same session, same tier,
 * same clock.
 */

import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'performance'
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

const LIGHTS = process.env.LIGHTS || 'on'
const OUT = process.env.OUT || '/tmp/ssg-editor'
fs.mkdirSync(OUT, { recursive: true })

await page.evaluate((m) => window.__store.getState().setLightsMode(m), LIGHTS)
await new Promise((r) => setTimeout(r, 1500))

/** Count render() calls inside one animation frame — the post stack issues ~18
 *  siblings per frame, a flat tier exactly 1, so this distinguishes them without
 *  reaching for the composer (which is not exposed).
 *
 *  The canvas MUST be driven while sampling. Both canvases are `frameloop="demand"`,
 *  so an idle one renders nothing and the count comes back 0 — which reads as "no
 *  post stack" when it only means "nothing asked for a frame". A camera drag is the
 *  same thing every other probe here uses to force continuous rendering. */
async function renderCallsPerFrame() {
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const cx = Math.round(box.x + box.w / 2)
  const cy = Math.round(box.y + box.h / 2)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const counting = page.evaluate(
    () =>
      new Promise((resolve) => {
        const gl = window.__three.gl
        const orig = gl.render.bind(gl)
        let n = 0
        gl.render = (...a) => {
          n++
          orig(...a)
        }
        let best = 0
        let frames = 0
        const tick = () => {
          if (n > best) best = n
          n = 0
          if (++frames < 40) requestAnimationFrame(tick)
          else {
            gl.render = orig
            resolve(best)
          }
        }
        requestAnimationFrame(tick)
      }),
  )
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(cx + i * 3, cy + (i % 2 === 0 ? 2 : -2))
    await new Promise((r) => setTimeout(r, 40))
  }
  const best = await counting
  await page.mouse.up()
  return best
}

async function census() {
  const c = await page.evaluate(() => {
    const { scene, gl, camera } = window.__three
    let domeRadius = null
    let occluders = 0
    let pointLights = 0
    let litPointLights = 0
    let sunShadowMap = 0
    let shadowCasters = 0
    let meshes = 0
    let maxAniso = 0
    const mats = new Set()
    scene.traverse((o) => {
      if (o.isMesh) {
        meshes++
        const m = o.material
        if (m) {
          mats.add(m.uuid)
          if (m.isMeshBasicMaterial && o.geometry?.parameters?.radius > 50) {
            domeRadius = o.geometry.parameters.radius
          }
          if (m.colorWrite === false && m.opacity === 0) occluders++
          for (const k of ['map', 'normalMap', 'roughnessMap']) {
            const t = m[k]
            if (t?.anisotropy > maxAniso) maxAniso = t.anisotropy
          }
        }
        if (o.castShadow) shadowCasters++
      }
      if (o.isPointLight) {
        pointLights++
        if (o.intensity > 0) litPointLights++
      }
      if (o.isDirectionalLight && o.castShadow) sunShadowMap = o.shadow.mapSize.x
    })
    return {
      ibl: !!scene.environment,
      background: scene.background ? 'set' : 'null',
      domeRadius,
      sunShadowMap,
      shadowCasters,
      shadowType: gl.shadowMap.type,
      shadowEnabled: gl.shadowMap.enabled,
      occluders,
      pointLights,
      litPointLights,
      meshes,
      materials: mats.size,
      dpr: +gl.getPixelRatio().toFixed(2),
      cameraFar: camera.far,
      maxAnisotropy: maxAniso,
    }
  })
  c.renderCalls = await renderCallsPerFrame()
  return c
}

const roomId = await page.evaluate(() => {
  const plan = window.__store.getState().floorPlan
  return plan?.rooms?.[0]?.id ?? null
})

console.log(`tier=${TIER} hour=${HOUR} lights=${LIGHTS} room=${roomId}\n`)

const main = await census()
fs.writeFileSync(`${OUT}/main-${HOUR}.png`, await page.screenshot({ type: 'png' }))

await page.evaluate((id) => window.__store.getState().enterRoomEditor(id), roomId)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 6000))
await assertSceneAlive(page, 'room editor')
const editor = await census()
fs.writeFileSync(`${OUT}/editor-${HOUR}.png`, await page.screenshot({ type: 'png' }))

const keys = Object.keys(main)
console.log('system              main            editor          lock-step')
for (const k of keys) {
  // Counts legitimately differ (the editor shows ONE room), so only the
  // CAPABILITY keys must match; the rest are printed for context.
  const capability = [
    'ibl',
    'domeRadius',
    'shadowType',
    'shadowEnabled',
    'sunShadowMap',
    'dpr',
    'cameraFar',
    'maxAnisotropy',
    'renderCalls',
  ].includes(k)
  const same = String(main[k]) === String(editor[k])
  const flag = capability ? (same ? 'ok' : '<-- DIFFERS') : ''
  console.log(
    `${k.padEnd(19)} ${String(main[k]).padEnd(15)} ${String(editor[k]).padEnd(15)} ${flag}`,
  )
}
await browser.close()
