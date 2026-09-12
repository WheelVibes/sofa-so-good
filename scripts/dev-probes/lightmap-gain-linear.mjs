/**
 * LIGHTMAP-GAIN-LINEAR — render the app at one pose across a sweep of `IRRADIANCE_GAIN`
 * values, in LINEAR light, so the gain can be fitted against a Cycles reference.
 *
 * AGX-PARITY (`v0.34.1.0`) established that app counts and Cycles counts are not the same
 * quantity, so a gain fitted in AgX counts is fitted through a curve that compresses the very
 * range the lightmap lives in. `src/scene/linearView.ts` exists for exactly this: the DEV
 * `ssg_linear_view` key swaps BOTH tone-mapping sites for `LinearToneMapping`, so the frame
 * inverts exactly — `linear = srgb_to_linear(byte) / gl.toneMappingExposure`.
 *
 * Two arms per gain are not needed: `replace`-mode injection makes the rendered radiance AFFINE
 * in the gain on a lightmapped pixel and CONSTANT on a fill-only one, so the sweep itself both
 * classifies the pixels and fits the coefficient.
 *
 * Carries `lightmap-ab.mjs`'s load assertion verbatim in spirit: a set that never loaded produces
 * a perfectly plausible frame, and that has already cost this arc three rounds (`v0.31.7.90`).
 *
 *   SSG_URL=http://localhost:5200/ DIR=lightmaps-rebake5a GAINS=0,2.1,4.2,6.3 \
 *     node scripts/dev-probes/lightmap-gain-linear.mjs --out /tmp/gain-lin
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'
import { WALK_POSES } from './view-matrix.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const args = process.argv.slice(2)
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/gain-lin'
const DIR = process.env.DIR || 'lightmaps-rebake5a'
const POSE = process.env.POSE || 'living-window'
const HOUR = Number(process.env.HOUR || 13)
const FOV = Number(process.env.WALKFOV || 50)
const LINEAR = process.env.LINEAR !== '0'
const GAINS = (process.env.GAINS || '0,2.1,4.2,6.3').split(',').map(Number)
const pose = WALK_POSES.find((p) => p.name === POSE)
if (!pose) throw new Error(`unknown pose ${POSE}`)

fs.mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})

let manifest = null
const summary = []

for (const gain of GAINS) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  const failed = []
  page.on('response', (r) => {
    if (r.url().includes('/assets/') && r.url().endsWith('.png') && !r.ok()) failed.push(r.url())
  })
  await page.evaluateOnNewDocument((lin) => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
      if (lin) localStorage.setItem('ssg_linear_view', '1')
      else localStorage.removeItem('ssg_linear_view')
    } catch {}
  }, LINEAR)
  const sep = appUrl().includes('?') ? '&' : '?'
  await page.goto(`${appUrl()}${sep}aoDir=${DIR}&aoGain=${gain}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.evaluate(
    ({ h }) => {
      const s = window.__store.getState()
      s.endTour?.()
      s.setOnboardingOpen?.(false)
      s.dismissLocationPrompt?.()
      s.dismissChecklist?.()
      s.setManualHour?.(h)
      s.setTimeMode?.('manual')
      s.setQualityTier?.('realistic')
      s.hideLoading?.()
      s.setFeatureFlag?.('interactiveDegrade', false)
    },
    { h: HOUR },
  )
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await sleep(7000)

  // THE LOAD ASSERTION (lightmap-ab.mjs). Not decoration.
  const load = await page.evaluate(() => {
    const o = { patched: 0, withImage: 0, withoutImage: 0, sample: null }
    const seen = new Set()
    const visit = (n) => {
      const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : []
      for (const m of mats) {
        if (!m || seen.has(m.uuid)) continue
        seen.add(m.uuid)
        if (!m.__visMapForProbe) continue
        o.patched++
        const img = m.__visMapForProbe.image
        if ((img?.width ?? 0) > 0) {
          o.withImage++
          if (!o.sample)
            o.sample = String(img.src ?? '')
              .split('/')
              .pop()
        } else o.withoutImage++
      }
      for (const c of n.children ?? []) visit(c)
    }
    visit(window.__three.scene)
    return o
  })
  if (load.patched === 0) throw new Error(`${DIR}: no material patched — the set never loaded`)
  if (load.withoutImage > 0 || failed.length > 0)
    throw new Error(
      `${DIR}: ${load.withoutImage} patched materials have no image, ${failed.length} PNGs failed`,
    )

  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20000,
  })
  await sleep(4000)
  await page.evaluate((f) => {
    const s = window.__store.getState()
    s.hideLoading?.()
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(f)
  }, FOV)
  await page.evaluate((q) => {
    const l = window.__walkLook
    l.setPosition(q[0], q[1])
    l.setYaw(q[2])
    l.setPitch(q[3])
  }, pose.p)
  await sleep(2500)
  await assertSceneAlive(page, `${DIR}@${gain}`)

  const cam = await page.evaluate(() => {
    const c = window.__three.camera
    c.updateMatrixWorld()
    const e = c.matrixWorld.elements
    const pos = [e[12], e[13], e[14]]
    const fwd = [-e[8], -e[9], -e[10]]
    return {
      space: 'three',
      position: pos.map((v) => +v.toFixed(4)),
      forward: fwd.map((v) => +v.toFixed(5)),
      target: pos.map((v, i) => +(v + fwd[i]).toFixed(4)),
      fovVerticalDeg: c.fov,
      aspect: c.aspect,
    }
  })
  const state = await page.evaluate(() => {
    const gl = window.__three.gl
    const st = window.__store.getState()
    const sun = []
    window.__three.scene.traverse((o) => {
      if (o.isDirectionalLight) {
        o.updateMatrixWorld()
        sun.push({
          intensity: o.intensity,
          color: [o.color.r, o.color.g, o.color.b],
          travel: [
            o.target.position.x - o.position.x,
            o.target.position.y - o.position.y,
            o.target.position.z - o.position.z,
          ].map((v) => +v.toFixed(5)),
        })
      }
    })
    const point = []
    window.__three.scene.traverse((o) => {
      if (o.isPointLight) point.push(1)
    })
    return {
      tier: st.qualityTier,
      hour: st.manualHour,
      toneMapping: gl.toneMapping,
      toneMappingExposure: gl.toneMappingExposure,
      pointLights: point.length,
      sun,
    }
  })
  const file = path.join(out, `app-g${gain}.png`)
  await page.screenshot({ path: file })
  console.log(
    `gain ${gain}: patched=${load.patched} sample=${load.sample} exposure=${state.toneMappingExposure} tone=${state.toneMapping} pts=${state.pointLights}`,
  )
  if (!manifest)
    manifest = {
      glb: 'scene.glb',
      camera: cam,
      lights: { directional: state.sun, point: [], spot: [] },
      state: { ...state, lightsMode: 'off', aoDir: DIR, linearView: LINEAR },
      scene: { tier: state.tier, hour: state.hour, pose: POSE },
    }
  summary.push({ gain, file, load })
  await page.close()
}
await browser.close()
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1))
fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(summary, null, 1))
console.log('\n->', out)
