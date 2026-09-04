/**
 * Point the walk camera at ONE named thing and shoot it.
 *
 * `walk-tour.mjs` stands at each room centre and sweeps four cardinal yaws with a fixed −0.05
 * pitch. That is the right instrument for a survey and the wrong one for a specific claim: item
 * `(g)`'s symptom is what you see LEANING OVER the mezzanine rail, and no cardinal yaw at eye
 * level with a level pitch ever frames it — three tours of `tpl-loft` came back with windows and
 * walls instead. This takes explicit poses so a defect can be aimed at rather than stumbled upon.
 *
 * POSES is `label:x,z,yawRad,pitchRad` entries separated by `;`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/aim-look'
const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
const FURNISH = process.env.FURNISH === '1'
const TIER = process.env.TIER || 'realistic'
const HOUR = Number(process.env.HOUR || 13)
const POSES = (process.env.POSES || 'rail:5.55,4.7,0,-0.6').split(';').map((s) => {
  const [label, rest] = s.split(':')
  const [x, z, yaw, pitch] = rest.split(',').map(Number)
  return { label, x, z, yaw, pitch }
})

mkdirSync(OUT, { recursive: true })
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
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
// BEFORE load, or the welcome modal blurs the whole scene and every frame is a survey of
// the onboarding card (it did exactly that on the first run).
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
// `LocationPrompt` surfaces once onboarding is gone and blurs the scene just as thoroughly.
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
if (LEVEL) {
  await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
  await new Promise((r) => setTimeout(r, 1200))
}
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return `${st.qualityTier}/${st.lightsMode}/${st.timeMode}${st.manualHour}`
})
console.log(`resolved ${resolved}   level ${LEVEL || '(ground)'}`)

for (const p of POSES) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.x, q.z, q.yaw)
  }, p)
  await new Promise((r) => setTimeout(r, 1500))
  // Pitch AFTER the teleport settles, and READ IT BACK. Setting it in the same tick gave two
  // frames that were pixel-identical at -0.7 and -0.25 — the teleport resets the look, so the
  // requested pitch never reached the camera and the probe reported a pose it did not shoot.
  const pitch = await page.evaluate((q) => {
    window.__walkLook?.setPitch(q.pitch)
    return window.__walkLook?.getPitch?.() ?? null
  }, p)
  await new Promise((r) => setTimeout(r, 1200))
  await assertSceneAlive(page, p.label)
  const where = await page.evaluate(() => {
    const c = window.__three.camera
    return [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(2))
  })
  // What is the middle of the frame ACTUALLY looking at, and which STOREY does it belong to?
  // "Sky" and "a wall lit to sky luma" are indistinguishable in a screenshot, and item `(g)`
  // turns on exactly which one it is. Raycaster classes come off objects three itself made —
  // the page cannot resolve a bare `three` specifier (the established idiom in this arc).
  const hit = await page.evaluate(() => {
    const { scene, camera } = window.__three
    const rc = new window.__three.raycaster.constructor()
    const V3 = camera.position.constructor
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const dir = new V3(-e[8], -e[9], -e[10]).normalize()
    rc.set(new V3(e[12], e[13], e[14]), dir)
    const all = rc.intersectObjects(scene.children, true).filter((h) => {
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
      return h.object.visible && m && m.transparent !== true && m.opacity !== 0
    })
    const h = all[0]
    if (!h) return null
    // Walk UP for a furniture tag, and report the hit height — which storey it sits on is
    // the whole question here.
    let itemId = null
    let o = h.object
    while (o && !itemId) {
      itemId = o.userData?.itemId ?? null
      o = o.parent
    }
    const it = itemId ? window.__store.getState().items.find((i) => i.id === itemId) : null
    return {
      dist: +h.distance.toFixed(2),
      y: +h.point.y.toFixed(2),
      z: +h.point.z.toFixed(2),
      name: h.object.name || h.object.type,
      defId: it?.defId ?? null,
      itemLevel: it?.levelId ?? (it ? 'ground' : null),
    }
  })
  console.log(
    hit
      ? `    centre ray -> ${hit.defId ? `${hit.defId} (level ${hit.itemLevel})` : hit.name} at ${hit.dist} m, y=${hit.y}, z=${hit.z}`
      : '    centre ray -> NOTHING (sky)',
  )
  const file = `${OUT}/${p.label}.png`
  writeFileSync(file, await page.screenshot({ type: 'png' }))
  console.log(
    `  ${p.label.padEnd(14)} eye [${where.join(', ')}]  pitch req ${p.pitch} got ${pitch ?? '?'}  -> ${file}`,
  )
}
await browser.close()
