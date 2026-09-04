/**
 * Does the storey BELOW the walked one actually render? (item `(g)`)
 *
 * A framing-based check is unreliable here: the mezzanine tour's yaw sweep may never point over
 * the rail, and "sky" and "lit room below" can both read bright. This asks the SCENE instead —
 * bin every rendered mesh by the world Y of its bounding-box centre against the walked storey's
 * elevation, in both orbit (isolated) and first-person (should include below).
 *
 * It also counts DOWNWARD-facing horizontal slabs below the walked elevation: those are the
 * lower storey's ceilings, and `withCeiling` should leave none of them, or the sky hole is just
 * replaced by a lid seen from above.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const PLAN = process.env.PLAN || 'tpl-loft'
const LEVEL = process.env.LEVEL || 'lf-up'
const TIER = process.env.TIER || 'realistic'

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
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 2500))

const swapped = await page.evaluate(async (id) => {
  const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
  const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
  if (!tpl) return null
  const st = window.__store.getState()
  st.replaceFloorPlan(structuredClone(tpl), { furniture: 'clear' })
  st.applyLayoutPreset('move-in')
  return tpl.name
}, PLAN)
if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
await new Promise((r) => setTimeout(r, 2500))
console.log(`plan -> ${swapped} (${PLAN})   walked level ${LEVEL}   tier ${TIER}`)

async function census(mode) {
  await page.evaluate(
    ({ mode, lvl }) => {
      const st = window.__store.getState()
      st.setCameraMode(mode)
      st.setViewLevel(lvl)
    },
    { mode, lvl: LEVEL },
  )
  await new Promise((r) => setTimeout(r, 2000))
  return await page.evaluate(async (lvl) => {
    const { planLevels } = await import('/src/floorplan/levels.ts')
    const st = window.__store.getState()
    const plan = st.plan ?? st.floorPlan
    const lv = planLevels(plan).find((l) => l.id === lvl)
    if (!lv)
      throw new Error(
        `level ${lvl} not in plan (have ${planLevels(plan)
          .map((l) => l.id)
          .join(',')})`,
      )
    const elev = lv.elevation
    const scene = window.__three.scene
    let below = 0
    let at = 0
    const lids = []
    // World-space bounds by hand: `three` is a bare specifier the browser cannot resolve, and
    // pulling Box3 off some other object's constructor is more fragile than 8 corner transforms.
    const worldBounds = (o) => {
      const g = o.geometry
      if (!g) return null
      if (!g.boundingBox) g.computeBoundingBox()
      const bb = g.boundingBox
      if (!bb) return null
      o.updateWorldMatrix(true, false)
      const m = o.matrixWorld.elements
      let minY = Infinity
      let maxY = -Infinity
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const cx of [bb.min.x, bb.max.x]) {
        for (const cy of [bb.min.y, bb.max.y]) {
          for (const cz of [bb.min.z, bb.max.z]) {
            const w = m[3] * cx + m[7] * cy + m[11] * cz + m[15] || 1
            const x = (m[0] * cx + m[4] * cy + m[8] * cz + m[12]) / w
            const y = (m[1] * cx + m[5] * cy + m[9] * cz + m[13]) / w
            const z = (m[2] * cx + m[6] * cy + m[10] * cz + m[14]) / w
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
            minZ = Math.min(minZ, z)
            maxZ = Math.max(maxZ, z)
          }
        }
      }
      return { minX, maxX, minY, maxY, minZ, maxZ }
    }
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return
      let p = o.parent
      while (p) {
        if (p.visible === false) return
        p = p.parent
      }
      const b = worldBounds(o)
      if (!b || !Number.isFinite(b.minY)) return
      const cy = (b.minY + b.maxY) / 2
      const thin = b.maxY - b.minY < 0.12
      const wide = b.maxX - b.minX > 0.8 && b.maxZ - b.minZ > 0.8
      if (cy < elev - 0.3) {
        below += 1
        if (thin && wide) lids.push(Math.round(cy * 100) / 100)
      } else at += 1
    })
    return { elev, below, at, lids: lids.sort((a, b) => a - b) }
  }, LEVEL)
}

const orbit = await census('orbit')
const walk = await census('firstPerson')
console.log(`  walked elevation ${orbit.elev} m`)
console.log(
  `  orbit  (isolated): ${orbit.below} meshes below, ${orbit.at} at/above, slabs below at y=[${orbit.lids.join(', ')}]`,
)
console.log(
  `  walk   (item g)  : ${walk.below} meshes below, ${walk.at} at/above, slabs below at y=[${walk.lids.join(', ')}]`,
)
await assertSceneAlive(page)
await browser.close()
