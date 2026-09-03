/**
 * CEILING-HIT — what does the top of a walk frame actually hit?
 *
 * `light-distribution.mjs` has measured a "ceiling" ratio since `.179` from a
 * fixed screen band (top 2-16 %), and its own header concedes the band is only
 * meaningful if "the caller picks a pose where the top band really is ceiling".
 * A geometric cross-check (`.204`) found **zero** samples of a near-horizontal
 * surface above 2 m in any room — which either means the band is upper WALL, or
 * means the classifier is wrong. This answers it positively: it walks the top
 * rows of the frame and reports what each ray hit.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'performance'
const STANDOFF = Number(process.env.STANDOFF || 4.6)
const PITCH = Number(process.env.PITCH || -0.06)
const WINDOW = process.env.WINDOW || 'livingDining'

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const page = await browser.newPage()
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
await page.evaluate(
  ({ h, t }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setQualityTier(t)
    s.setCameraMode('firstPerson')
    s.setPhotographicLook?.(true)
  },
  { h: HOUR, t: TIER },
)
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))

const pose = await page.evaluate(
  ({ win, standoff }) => {
    const plan = window.__store.getState().floorPlan
    const re = new RegExp(win, 'i')
    const wins = (plan?.openings ?? []).filter((o) => o.kind === 'window')
    const op = wins.find((o) => re.test(o.id ?? '')) ?? wins[0]
    const w = (plan?.walls ?? []).find((x) => x.id === op?.wallId)
    const [x0, z0] = w.start
    const [x1, z1] = w.end
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ux = (x1 - x0) / len
    const uz = (z1 - z0) / len
    const t = op.offset + op.width / 2
    const cx = x0 + ux * t
    const cz = z0 + uz * t
    const roomAt = (px, pz) =>
      (plan?.rooms ?? []).find(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      ) ?? null
    let nx = -uz
    let nz = ux
    if (!roomAt(cx + nx * 1.2, cz + nz * 1.2)) {
      nx = -nx
      nz = -nz
    }
    const px = cx + nx * standoff
    const pz = cz + nz * standoff
    return { px, pz, yaw: Math.atan2(-(cx - px), -(cz - pz)) }
  },
  { win: WINDOW, standoff: STANDOFF },
)
await page.evaluate(
  async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.px, q.pz, q.yaw)
    window.__walkLook?.setPitch(q.pitch)
  },
  { ...pose, pitch: PITCH },
)
await new Promise((r) => setTimeout(r, 2500))

const report = await page.evaluate(() => {
  const { scene, camera } = window.__three
  const rc = new window.__three.raycaster.constructor()
  const n = new camera.position.constructor()
  const solid = (o) => o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
  const rows = []
  for (const y of [0.02, 0.05, 0.09, 0.13, 0.16, 0.25, 0.4]) {
    const hits = { total: 0, byHeight: {}, maxY: -Infinity, horizontalAbove2: 0 }
    for (let i = 0; i < 40; i++) {
      const x = (i + 0.5) / 40
      rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
      const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
      if (!h?.face) continue
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
      hits.total++
      hits.maxY = Math.max(hits.maxY, h.point.y)
      const band = h.point.y > 2.4 ? '>2.4' : h.point.y > 2.0 ? '2.0-2.4' : '<2.0'
      hits.byHeight[band] = (hits.byHeight[band] ?? 0) + 1
      if (Math.abs(n.y) > 0.9 && h.point.y > 2.0) hits.horizontalAbove2++
      hits.ny = hits.ny ?? []
      if (hits.ny.length < 4) hits.ny.push(+n.y.toFixed(2))
      hits.mat = hits.mat ?? h.object.material?.type
    }
    rows.push({
      screenY: y,
      hits: hits.total,
      maxHitY: +hits.maxY.toFixed(2),
      byHeight: hits.byHeight,
      horizontalAbove2m: hits.horizontalAbove2,
      sampleNy: hits.ny ?? [],
      material: hits.mat ?? null,
    })
  }
  return { camY: +camera.position.y.toFixed(2), fov: +camera.fov.toFixed(1), rows }
})

console.log(
  `ceiling-hit  ${JSON.stringify({ window: WINDOW, standoff: STANDOFF, pitch: PITCH, camY: report.camY, vFov: report.fov })}`,
)
console.log('')
console.log('screenY hits maxHitY heights')
for (const r of report.rows)
  console.log(
    `  ${r.screenY.toFixed(2)}  ${String(r.hits).padStart(3)}  ${String(r.maxHitY).padStart(5)}  ${JSON.stringify(r.byHeight).padEnd(24)} horiz>2m=${String(r.horizontalAbove2m).padStart(3)}  n.y=${JSON.stringify(r.sampleNy).padEnd(24)} ${r.material ?? ''}`,
  )
console.log('')
console.log("`light-distribution.mjs`'s ceiling band is screenY 0.02-0.16.")
await browser.close()
