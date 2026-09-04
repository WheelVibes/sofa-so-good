/**
 * Does the directional light's SHADOW CAMERA actually cover the surface under test?
 *
 * `(z3)` LOW-SUN-DIRECT-LEAK measured the east wall of `livingDining` gaining 0.222 linear from
 * 13:00 to 17:00 where a Cycles reference loses 0.029, with the brightening uniform and no sun
 * patch in frame — the signature of an unshadowed Lambert term. Before testing a fix, this asks the
 * cheapest possible question: is the geometry that should CAST that shadow, and the surface that
 * should RECEIVE it, inside the shadow camera's frustum at all?
 *
 * A directional light's shadow camera is orthographic, and `shadowFrustumForPlan` sizes it from the
 * plan extent. Anything outside it is simply not in the depth map, so it neither casts nor receives
 * — and the result is exactly this defect's shape: full Lambert with no occlusion.
 *
 * Read-only. It reports the frustum, the light's own transform, `castShadow`/`receiveShadow` on the
 * meshes at the probe points, and whether each point falls inside — no rendering state is touched,
 * because `(z2)` showed that flipping a shadow setting and measuring the wrong pose reports nothing.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 17)
const TIER = process.env.TIER || 'realistic'
const POINTS = (process.env.POINTS || 'east-wall:12.42,1.6,4.1;ceiling:10.8,2.6,3.65')
  .split(';')
  .map((s) => {
    const [label, xyz] = s.split(':')
    const [x, y, z] = xyz.split(',').map(Number)
    return { label, x, y, z }
  })

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  defaultViewport: { width: 900, height: 600, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate((h) => {
  const st = window.__store.getState()
  st.setTimeMode('manual')
  st.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 5000))
await assertSceneAlive(page, 'before read')

const out = await page.evaluate((points) => {
  const { scene } = window.__three
  const lights = []
  scene.traverse((o) => {
    if (!o.isDirectionalLight) return
    o.updateMatrixWorld()
    const cam = o.shadow?.camera
    lights.push({
      intensity: o.intensity,
      castShadow: o.castShadow,
      position: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2)),
      target: [o.target.position.x, o.target.position.y, o.target.position.z].map(
        (v) => +v.toFixed(2),
      ),
      mapSize: o.shadow ? [o.shadow.mapSize.x, o.shadow.mapSize.y] : null,
      bias: o.shadow?.bias,
      normalBias: o.shadow?.normalBias,
      frustum: cam
        ? {
            left: +cam.left.toFixed(2),
            right: +cam.right.toFixed(2),
            top: +cam.top.toFixed(2),
            bottom: +cam.bottom.toFixed(2),
            near: +cam.near.toFixed(2),
            far: +cam.far.toFixed(2),
          }
        : null,
      // Where each probe point lands in the shadow camera's own space — the only frame in which
      // "inside the frustum" means anything.
      points: cam
        ? points.map((p) => {
            const V3 = window.__three.camera.position.constructor
            const v = new V3(p.x, p.y, p.z)
            cam.updateMatrixWorld()
            v.applyMatrix4(cam.matrixWorldInverse)
            return {
              label: p.label,
              inLight: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)],
              insideXY: v.x >= cam.left && v.x <= cam.right && v.y >= cam.bottom && v.y <= cam.top,
              insideZ: -v.z >= cam.near && -v.z <= cam.far,
            }
          })
        : [],
    })
  })
  return { lights, shadowsEnabled: window.__three.gl.shadowMap.enabled }
}, POINTS)

console.log(`hour ${HOUR}  tier ${TIER}  renderer shadowMap.enabled ${out.shadowsEnabled}`)
for (const l of out.lights) {
  console.log(
    `  dirLight intensity ${l.intensity} castShadow ${l.castShadow} map ${l.mapSize?.join('x')} bias ${l.bias} normalBias ${l.normalBias}`,
  )
  console.log(`    pos ${l.position.join(',')} -> target ${l.target.join(',')}`)
  console.log(`    frustum ${JSON.stringify(l.frustum)}`)
  for (const p of l.points) {
    console.log(
      `    ${p.label.padEnd(12)} light-space ${p.inLight.join(',')}  insideXY ${p.insideXY}  insideZ ${p.insideZ}`,
    )
  }
}
await browser.close()
