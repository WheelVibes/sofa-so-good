/**
 * Cast EXPLICIT rays at the live scene and report what they hit. No camera, no screenshot.
 *
 * Written after a wrong published claim. Item `(x)` asserted a "0.3 m ring of open envelope" on
 * the multi-storey templates, reasoning that a horizontal ray at 2.75 m "hits nothing by
 * construction" because the wall boxes span 0–2.6 and 2.9–5.5. That reasoning ignored `LevelSlab`,
 * which occupies 2.65–2.9 across the whole footprint — so the actually-open band is 0.05 m, not
 * 0.3, and the ray does hit. The error is the one this arc keeps making: a quantity ASSUMED
 * instead of read.
 *
 * Camera-based probes cannot settle it either: `aim-look.mjs` in orbit mode has its requested eye
 * height adjusted by the controls (asked 2.50, got 2.71), which tilts the ray and moves the hit.
 * A geometry question deserves a geometry instrument — origin and direction in, first opaque hit
 * out, nothing in between to reinterpret.
 *
 * RAYS is `label:ox,oy,oz>dx,dy,dz` entries separated by `;`.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
const FURNISH = process.env.FURNISH === '1'
const TIER = process.env.TIER || 'realistic'
const WALK = process.env.WALK === '1'
const RAYS = (process.env.RAYS || 'north:4.2,2.62,-9>0,0,1').split(';').map((s) => {
  const [label, rest] = s.split(':')
  const [o, d] = rest.split('>')
  return { label, origin: o.split(',').map(Number), dir: d.split(',').map(Number) }
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
  defaultViewport: { width: 1024, height: 640, deviceScaleFactor: 1 },
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
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 2500))

if (PLAN) {
  const swapped = await page.evaluate(
    async ({ id, furnish }) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
      if (!tpl) return null
      const st = window.__store.getState()
      st.replaceFloorPlan(structuredClone(tpl), { furniture: furnish ? 'clear' : 'rehome' })
      if (furnish) st.applyLayoutPreset('move-in')
      return tpl.name
    },
    { id: PLAN, furnish: FURNISH },
  )
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await new Promise((r) => setTimeout(r, 2500))
  console.log(`plan -> ${swapped} (${PLAN})`)
}
if (WALK) await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
if (LEVEL) await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
await new Promise((r) => setTimeout(r, 2000))

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return `${st.qualityTier}/${st.lightsMode}/${st.cameraMode}/view=${st.viewLevelId}`
})
console.log(`resolved ${resolved}`)

const hits = await page.evaluate((rays) => {
  const scene = window.__three.scene
  const rc = new window.__three.raycaster.constructor()
  const V3 = window.__three.camera.position.constructor
  const out = []
  for (const r of rays) {
    rc.set(new V3(...r.origin), new V3(...r.dir).normalize())
    // ALL opaque hits along the ray, not just the first: "the envelope is closed" is a claim
    // about the sequence of surfaces a ray crosses, and the first hit alone hides whether the
    // thing that stopped it was the wall or something behind the gap.
    const all = rc
      .intersectObjects(scene.children, true)
      .filter((h) => {
        const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
        if (!h.object.visible || !m || m.transparent === true || m.opacity === 0) return false
        let p = h.object.parent
        while (p) {
          if (p.visible === false) return false
          p = p.parent
        }
        return true
      })
      .slice(0, 4)
      .map((h) => {
        let itemId = null
        let o = h.object
        while (o && !itemId) {
          itemId = o.userData?.itemId ?? null
          o = o.parent
        }
        const it = itemId ? window.__store.getState().items.find((i) => i.id === itemId) : null
        return {
          d: +h.distance.toFixed(2),
          x: +h.point.x.toFixed(2),
          y: +h.point.y.toFixed(2),
          z: +h.point.z.toFixed(2),
          what: it?.defId ?? h.object.name ?? h.object.type,
        }
      })
    out.push({ label: r.label, all })
  }
  return out
}, RAYS)

for (const h of hits) {
  if (h.all.length === 0) {
    console.log(`  ${h.label.padEnd(12)} NOTHING — the ray leaves the scene`)
    continue
  }
  console.log(
    `  ${h.label.padEnd(12)} ${h.all.map((a) => `${a.what}@${a.d}m (${a.x},${a.y},${a.z})`).join('  ->  ')}`,
  )
}
await assertSceneAlive(page)
await browser.close()
