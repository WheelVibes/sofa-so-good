/**
 * Verifies BOTH directions of the MIRROR-RELEVANCE gate.
 *
 * The failure mode this guards against is subtle: a gate that never upgrades has
 * silently deleted the real-mirror feature while looking like a pure perf win.
 * So this walks the camera in toward a mirror pane and back out, reporting the
 * live material type at each distance.
 */

import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const OUT = '/tmp/ssg-mirror'
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
}, 13)
await page.evaluate(
  (t) => window.__store.getState().setQualityTier(t),
  process.env.TIER || 'realistic',
)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 5000))

// Locate a reflective pane: the relevance hook measures the mesh a mirror
// material is attached to, so find meshes whose material name/type looks like a
// mirror candidate by walking for MeshReflectorMaterial OR the fallback metal.
const found = await page.evaluate(() => {
  // drei's MeshReflectorMaterial EXTENDS MeshStandardMaterial, so `.type` is
  // inherited and cannot discriminate the two. Its `textureMatrix` uniform can.
  window.__isReflector = (m) =>
    !!m?.uniforms?.textureMatrix || /Reflector/i.test(m?.constructor?.name || '')
  window.__isMirrorPane = (m) =>
    window.__isReflector(m) || (m?.emissive && m.emissive.getHexString?.() === 'b9c6d0')
  const isMirrorPane = window.__isMirrorPane
  const out = []
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    if (isMirrorPane(o.material)) {
      const V = window.__three.camera.position.constructor
      const p = new V()
      o.getWorldPosition(p)
      // A pane's reflective face is its local +Z; take it to world space so the
      // probe approaches from the side that can actually see a reflection
      // (approaching from behind just puts the camera outside the building).
      const n = new V(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new o.quaternion.constructor()))
      out.push({
        pos: [p.x, p.y, p.z].map((x) => +x.toFixed(2)),
        normal: [n.x, n.y, n.z].map((x) => +x.toFixed(3)),
      })
    }
  })
  return out
})
console.log('mirror panes found:', JSON.stringify(found))
if (!found.length) {
  console.log('NO MIRROR PANE FOUND — cannot verify the gate')
  await browser.close()
  process.exit(1)
}

const target = found[0].pos
const normal = found[0].normal
console.log('approach normal:', JSON.stringify(normal))
for (const dist of [10, 6, 3, 1.6, 3, 10]) {
  const state = await page.evaluate(
    async ({ target, normal, dist }) => {
      const { camera, controls } = window.__three
      // Stand off along the pane's own outward normal at eye height.
      camera.position.set(
        target[0] + normal[0] * dist,
        target[1] + 0.1,
        target[2] + normal[2] * dist,
      )
      if (controls) {
        controls.target.set(...target)
        controls.update()
      }
      camera.lookAt(...target)
      camera.updateMatrixWorld()
      // The main Canvas is frameloop="demand": a programmatic camera move renders
      // NOTHING, so the relevance hook's useFrame would never run and the gate
      // would look broken. Churn the store to make RenderPump keep invalidating
      // for the duration of the settle window.
      const st = window.__store.getState()
      const pump = setInterval(() => st.setManualHour(13 + Math.sin(Date.now() / 500) * 1e-4), 50)
      await new Promise((r) => setTimeout(r, 1600))
      clearInterval(pump)
      await new Promise((r) => setTimeout(r, 300))
      const types = []
      window.__three.scene.traverse((o) => {
        if (!o.isMesh || !o.material) return
        if (window.__isMirrorPane(o.material))
          types.push(window.__isReflector(o.material) ? 'REFLECTOR' : 'cheap-pane')
      })
      return { types }
    },
    { target, normal, dist },
  )
  const real = state.types.includes('REFLECTOR')
  console.log(
    `camera ~${String(dist).padStart(4)}m -> ${real ? 'REAL planar reflection' : 'cheap pane'}   panes=[${state.types.join(', ')}]`,
  )
  fs.writeFileSync(
    `${OUT}/mirror-${String(dist).replace('.', '_')}m-${real ? 'real' : 'cheap'}.png`,
    await page.screenshot({ type: 'png' }),
  )
}
await browser.close()
