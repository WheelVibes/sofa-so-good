/**
 * LIGHT-DISTRIBUTION — where does the frame spend its light?
 *
 * The photographic look was calibrated in v0.31.5.163–.168 on a single scalar:
 * the deep-shadow fraction `%<64`, tuned into the 11.2–12.2 % band measured from
 * reference photographs in `.134`. `.179` showed that is not enough. Matching the
 * AMOUNT of darkness says nothing about WHERE it lands, and the app spends it in
 * the wrong places:
 *
 *   region mean / frame mean      ceiling   wall   floor
 *   photograph 1                    1.28     1.43   1.23
 *   photograph 2                    1.17     0.53   1.30
 *   app, default look               0.92     1.12   0.70
 *   app, photographic look          0.75     1.09   0.66
 *
 * Both photographs put ceiling AND floor above the frame average; the app puts
 * both below, because it has no term for the floor catching the window and
 * bouncing it onto the ceiling. **Walls are not a usable target** — the two
 * photographs disagree 1.43 vs 0.53 depending on what is hanging on them — but
 * ceiling and floor agree closely across both, which is what makes them a signal.
 *
 * So this probe reports the pair alongside the scalar, and any future calibration
 * should move both. It samples fixed screen bands rather than masking geometry,
 * which is crude but honest: the caller picks a pose where the top band really is
 * ceiling and the bottom band really is floor, and the probe prints the bands it
 * used so a bad pose is visible rather than silent.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
const WINDOW = process.env.WINDOW || 'livingDining'
const STANDOFF = Number(process.env.STANDOFF || 4.6)
const PITCH = Number(process.env.PITCH || -0.06)
const WALKFOV = process.env.WALKFOV ? Number(process.env.WALKFOV) : 50
const PHOTO = process.env.PHOTO === '1'
// FLOOR re-finishes the living/dining floor. NOTE (v0.31.5.181): the store
// accepts it — `state.floor` reports the new id — but the render does not change
// (the floor band stays rgb 156,138,118 for oak and marble alike), so something
// downstream of `setFloorFinish` is not picking it up on the CURATED default flat.
// Left in place because the plumbing bug is worth having a repro for, but do not
// trust it as a way to vary the floor until that is chased down.
const FLOOR = process.env.FLOOR || ''
const OUT = process.env.OUT || '/tmp/light-distribution'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
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
await page.evaluate(
  ({ h, t, fov, photo, floor }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setQualityTier(t)
    s.setCameraMode('firstPerson')
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(fov)
    if (photo) s.setPhotographicLook?.(true)
    if (floor) s.setFloorFinish?.('livingDining', floor)
  },
  { h: HOUR, t: TIER, fov: WALKFOV, photo: PHOTO, floor: FLOOR },
)
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const pose = await page.evaluate(
  (q) => {
    const plan = window.__store.getState().floorPlan
    const op = (plan.openings ?? []).find(
      (o) => o.kind === 'window' && new RegExp(q.win, 'i').test(o.id),
    )
    if (!op) return null
    const w = (plan.walls ?? []).find((x) => x.id === op.wallId)
    if (!w) return null
    const [x0, z0] = w.start
    const [x1, z1] = w.end
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ux = (x1 - x0) / len
    const uz = (z1 - z0) / len
    const t = op.offset + op.width / 2
    const cx = x0 + ux * t
    const cz = z0 + uz * t
    let nx = -uz
    let nz = ux
    const inRoom = (px, pz) =>
      (plan.rooms ?? []).some(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      )
    if (!inRoom(cx + nx * 1.2, cz + nz * 1.2)) {
      nx = -nx
      nz = -nz
    }
    const px = cx + nx * q.standoff
    const pz = cz + nz * q.standoff
    return { id: op.id, px, pz, yaw: Math.atan2(-(cx - px), -(cz - pz)) }
  },
  { win: WINDOW, standoff: STANDOFF },
)
if (!pose) throw new Error(`no window opening matching /${WINDOW}/i`)
await page.evaluate(
  async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.px, q.pz, q.yaw)
    window.__walkLook?.setPitch(q.pitch)
  },
  { ...pose, pitch: PITCH },
)
await new Promise((r) => setTimeout(r, 2500))

const state = await page.evaluate(() => {
  const s = window.__store.getState()
  return {
    tier: s.qualityTier,
    hour: s.manualHour,
    photographicLook: s.photographicLook,
    floor: s.finishes?.floor?.livingDining,
  }
})
const shot = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/frame.png`, shot)
console.log(
  `light-distribution  ${JSON.stringify({ ...state, window: pose.id, standoff: STANDOFF, pitch: PITCH })}`,
)
console.log(`frame -> ${OUT}/frame.png`)
// --- analysis -------------------------------------------------------------
// Fixed fractional bands, with the two HUD rectangles cut out so the toolbar and
// the minimap never count as "ceiling" or "floor".
const { data, info } = await sharp(shot).removeAlpha().greyscale().raw().toBuffer({
  resolveWithObject: true,
})
const W = info.width
const H = info.height
const TOOLBAR = { x0: 0.26 * W, x1: 0.74 * W, y0: 0, y1: 0.09 * H }
const MINIMAP = { x0: 0.78 * W, x1: W, y0: 0.78 * H, y1: H }
const hud = (x, y) =>
  (x >= TOOLBAR.x0 && x < TOOLBAR.x1 && y < TOOLBAR.y1) || (x >= MINIMAP.x0 && y >= MINIMAP.y0)
const BANDS = {
  ceiling: { y0: 0.02, y1: 0.14, x0: 0.05, x1: 0.95 },
  wall: { y0: 0.3, y1: 0.6, x0: 0.82, x1: 0.98 },
  floor: { y0: 0.86, y1: 0.98, x0: 0.05, x1: 0.72 },
}
let all = 0
let dark = 0
let n = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (hud(x, y)) continue
    const v = data[y * W + x]
    all += v
    if (v < 64) dark++
    n++
  }
}
const frame = all / n
const rel = {}
for (const [name, b] of Object.entries(BANDS)) {
  let s2 = 0
  let c = 0
  for (let y = Math.round(b.y0 * H); y < Math.round(b.y1 * H); y++) {
    for (let x = Math.round(b.x0 * W); x < Math.round(b.x1 * W); x++) {
      if (hud(x, y)) continue
      s2 += data[y * W + x]
      c++
    }
  }
  rel[name] = c ? s2 / c / frame : Number.NaN
}
console.log('')
console.log(`frame mean = ${frame.toFixed(1)}    %<64 = ${((dark / n) * 100).toFixed(2)} %`)
console.log(
  `ceiling ${rel.ceiling.toFixed(2)}   wall ${rel.wall.toFixed(2)}   floor ${rel.floor.toFixed(2)}   (region mean / frame mean)`,
)
console.log('')
console.log('targets, from the reference photographs:')
console.log('  %<64      11.2–12.2 %')
console.log('  ceiling   1.17–1.28    (app has measured 0.75–0.92)')
console.log('  floor     NOT a target — both reference photographs have polished light')
console.log('            stone where the default flat has oak vinyl, so the gap is')
console.log('            mostly ALBEDO (see the .181 entry in the research doc)')
console.log('  wall      NOT a target — the photographs disagree 1.43 vs 0.53')
await browser.close()
