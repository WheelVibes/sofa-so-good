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
 *   photograph 3 (modern white)     1.08     1.20   1.18
 *   photograph 4 (lived-in flat)    1.14     1.14   0.87
 *   app, default look               1.12     1.14   1.13
 *   app, photographic look          0.87     1.11   1.13
 *
 * **Re-derived in v0.31.5.188 against four photographs, not two, and against the
 * current tree.** Both figures the old header quoted are dead. The app's ceiling
 * is no longer 0.75–0.92 — the fill and environment-intensity work since `.179`
 * moved the default look to 1.12, inside the photographic band. And the floor
 * target dissolved: photograph 4 puts its floor at 0.87, BELOW frame mean, so
 * "photographs put the floor above average" was an artefact of two pale-stone
 * rooms. Floor and wall ratios track albedo, not light transport; neither is a
 * target.
 *
 * What survives is narrower and sharper. The **photographic look** sits at
 * ceiling 0.87 against a four-photograph band of **1.08–1.28** — the one region
 * ratio still outside the references, and only under that look. Turning the fill
 * down is what buys the shadow depth (`%<64` 1.32 % → 11.86 %), and the ceiling
 * is lit almost entirely BY that fill, because there is no bounce term to relight
 * it from the floor. So the two looks trade: the default matches the photographic
 * light distribution and is too shadow-free, the photographic look matches the
 * shadows and loses the ceiling. A real directional GI term is what would let one
 * look hold both, and this pairing is the measurement that would show it working.
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
// FLOOR re-finishes the living/dining floor. The `.181` note that claimed this
// was inert is RETRACTED (v0.31.5.197): it was measured with the screen band
// `.182` threw out as contaminated, and it compared oak against marble, which
// genuinely sit 2 % apart. Against a geometrically-masked floor population the
// render responds plainly — oak 105.3, marble 103.3, white tiles 73.2, parquet
// 74.3, concrete 78.8, carpet 47.0 (`underside-shadow.mjs FLOOR=<id>`).
const FLOOR = process.env.FLOOR || ''
const WALL = process.env.WALL || ''
// Pitch for the FLOOR capture: steep enough that the near floor fills the bottom
// of the frame instead of the furniture standing on it.
const FLOOR_PITCH = Number(process.env.FLOOR_PITCH || -0.55)
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
  ({ h, t, fov, photo, floor, wall }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setQualityTier(t)
    s.setCameraMode('firstPerson')
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(fov)
    if (photo) s.setPhotographicLook?.(true)
    if (floor) s.setFloorFinish?.('livingDining', floor)
    if (wall) s.setWallFinish?.('livingDining', wall)
  },
  { h: HOUR, t: TIER, fov: WALKFOV, photo: PHOTO, floor: FLOOR, wall: WALL },
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
    wall: s.finishes?.wall?.livingDining,
  }
})
/**
 * Capture the CANVAS ELEMENT, not the page. v0.31.5.181 measured a "ceiling" band
 * that contained the toolbar and the white Measure button, and a "floor" band that
 * was almost entirely furniture — three contaminated regions in one thread. Taking
 * the canvas alone removes every DOM overlay at a stroke, so no HUD rectangles
 * have to be guessed at.
 */
const canvas = await page.$('canvas')
if (!canvas) throw new Error('no canvas to capture')
const shotFor = async (pitch) => {
  await page.evaluate((v) => window.__walkLook?.setPitch(v), pitch)
  await new Promise((r) => setTimeout(r, 900))
  return canvas.screenshot({ type: 'png' })
}
// Two poses: the shipped pitch for the ceiling + wall, and a pitched-down one so
// the bottom band is REAL FLOOR rather than the coffee table and the sofa.
const shot = await shotFor(PITCH)
const shotDown = await shotFor(FLOOR_PITCH)
fs.writeFileSync(`${OUT}/frame.png`, shot)
fs.writeFileSync(`${OUT}/frame-down.png`, shotDown)
console.log(
  `light-distribution  ${JSON.stringify({ ...state, window: pose.id, standoff: STANDOFF, pitch: PITCH })}`,
)
console.log(`frame -> ${OUT}/frame.png`)
// --- analysis -------------------------------------------------------------
// Fixed fractional bands, with the two HUD rectangles cut out so the toolbar and
// the minimap never count as "ceiling" or "floor".
const grey = async (buf) =>
  sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
const { data, info } = await grey(shot)
const down = await grey(shotDown)
const W = info.width
const H = info.height
// HUD cut-outs are REQUIRED. v0.31.5.182 removed them believing an element
// screenshot excludes overlaying DOM; it does not — Puppeteer clips the COMPOSITED
// page to the element's box, so the toolbar, the Measure button and the minimap
// are still in a "canvas" capture (verified by sampling: 235,232,227 in both a
// page shot and an element shot). Hiding the DOM instead blanks the canvas too,
// because the canvas is not a direct child of the app root. So: cut the rectangles.
const TOOLBAR = { x0: 0.24 * W, x1: 0.76 * W, y1: 0.1 * H }
const MEASURE = { x0: 0.9 * W, y1: 0.06 * H }
const MINIMAP = { x0: 0.76 * W, y0: 0.76 * H }
const hud = (x, y) =>
  (x >= TOOLBAR.x0 && x < TOOLBAR.x1 && y < TOOLBAR.y1) ||
  (x >= MEASURE.x0 && y < MEASURE.y1) ||
  (x >= MINIMAP.x0 && y >= MINIMAP.y0)
const BANDS = {
  ceiling: { y0: 0.02, y1: 0.16, x0: 0.05, x1: 0.95 },
  wall: { y0: 0.3, y1: 0.6, x0: 0.82, x1: 0.98 },
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
const band = (buf, b, denom) => {
  let s2 = 0
  let c = 0
  for (let y = Math.round(b.y0 * H); y < Math.round(b.y1 * H); y++) {
    for (let x = Math.round(b.x0 * W); x < Math.round(b.x1 * W); x++) {
      if (hud(x, y)) continue
      s2 += buf[y * W + x]
      c++
    }
  }
  return c ? s2 / c / denom : Number.NaN
}
const rel = {}
for (const [name, bb] of Object.entries(BANDS)) rel[name] = band(data, bb, frame)
// The floor comes from the PITCHED-DOWN frame, normalised by its own mean.
let dAll = 0
let dN = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (hud(x, y)) continue
    dAll += down.data[y * W + x]
    dN++
  }
}
const downMean = dAll / dN
rel.floor = band(down.data, { y0: 0.72, y1: 0.96, x0: 0.2, x1: 0.8 }, downMean)
console.log('')
console.log(`frame mean = ${frame.toFixed(1)}    %<64 = ${((dark / n) * 100).toFixed(2)} %`)
console.log(
  `ceiling ${rel.ceiling.toFixed(2)}   wall ${rel.wall.toFixed(2)}   floor ${rel.floor.toFixed(2)} (pitched-down frame, its own mean ${downMean.toFixed(1)})`,
)
console.log('')
console.log('targets, from the reference photographs:')
console.log('  %<64      1.9–12.2 %  (four photographs; the two looks bracket it)')
console.log('  ceiling   1.08–1.28   (four photographs. The DEFAULT look at 1.12 is')
console.log('            inside the band; the PHOTOGRAPHIC look at 0.87 is not, and')
console.log('            that is the one region ratio still outside the references)')
console.log('  floor     NOT a target — four photographs span 0.87–1.30. The ratio')
console.log('            tracks floor ALBEDO (pale stone vs dark parquet), not light')
console.log('            transport (see the .181 and .188 entries in the research doc)')
console.log('  wall      NOT a target — four photographs span 0.53–1.43')
await browser.close()
