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
    const roomAt = (px, pz) =>
      (plan.rooms ?? []).find(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      ) ?? null
    if (!roomAt(cx + nx * 1.2, cz + nz * 1.2)) {
      nx = -nx
      nz = -nz
    }
    // The window's OWN room. Testing "is this point in ANY room" is not enough:
    // the corridor is a room too, so a standoff that walks out of a bedroom and
    // into the corridor passes that test (v0.31.5.202 — the bedroom3 arm stood in
    // the corridor facing a blank wall and reported `%<64` 0.00 / mean 197).
    const ownRoom = roomAt(cx + nx * 1.2, cz + nz * 1.2)
    const inRoom = (px, pz) => ownRoom !== null && roomAt(px, pz)?.id === ownRoom.id
    // CLAMP THE STANDOFF TO THE ROOM (v0.31.5.202). A fixed standoff walks the
    // camera straight out of a small room: at 4.6 m the bedroom3 arm stood in the
    // CORRIDOR with its nose against a blank wall, and reported `%<64` 0.00 with a
    // frame mean of 197 — which reads as "this room is washed out" rather than
    // "this pose is not in the room". Step back only as far as the room allows.
    let standoff = q.standoff
    for (let s2 = q.standoff; s2 >= 0.8; s2 -= 0.1) {
      if (inRoom(cx + nx * s2, cz + nz * s2)) {
        standoff = s2
        break
      }
      standoff = 0.8
    }
    const px = cx + nx * standoff
    const pz = cz + nz * standoff
    return {
      id: op.id,
      px,
      pz,
      standoff,
      yaw: Math.atan2(-(cx - px), -(cz - pz)),
      cx,
      cz,
      nx,
      nz,
      roomId: ownRoom?.id ?? null,
    }
  },
  { win: WINDOW, standoff: STANDOFF },
)
if (!pose) throw new Error(`no window opening matching /${WINDOW}/i`)
/**
 * Teleport, then CHECK, then step closer and retry.
 *
 * `requestWalkTeleport` runs the point through the app's own collision solver
 * (WALK-SPAWN-CLEAR), which pushes the walker out of furniture and walls — so the
 * pose reached is not the pose asked for, and v0.31.5.202 measured two bedrooms
 * and both baths from the CORRIDOR without noticing. Retrying at successively
 * shorter standoffs finds a spot that survives the solver AND lands in the right
 * room; a room that has no such spot fails loudly at the end rather than
 * returning a plausible number from somewhere else.
 */
async function teleportInto(q, standoff) {
  await page.evaluate(
    async (o) => {
      const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
      requestWalkTeleport(o.px, o.pz, o.yaw)
      window.__walkLook?.setPitch(o.pitch)
    },
    {
      px: q.cx + q.nx * standoff,
      pz: q.cz + q.nz * standoff,
      yaw: Math.atan2(-(q.cx - (q.cx + q.nx * standoff)), -(q.cz - (q.cz + q.nz * standoff))),
      pitch: PITCH,
    },
  )
  await new Promise((r) => setTimeout(r, 1800))
  return page.evaluate((roomId) => {
    const { camera } = window.__three
    const plan = window.__store.getState().floorPlan
    const at =
      (plan?.rooms ?? []).find(
        (r) =>
          camera.position.x >= r.origin[0] &&
          camera.position.x <= r.origin[0] + r.width &&
          camera.position.z >= r.origin[1] &&
          camera.position.z <= r.origin[1] + r.depth,
      )?.id ?? null
    return { ok: at === roomId, at }
  }, q.roomId)
}

let usedStandoff = pose.standoff
let arrivedOk = false
for (let s2 = pose.standoff; s2 >= 0.7; s2 -= 0.3) {
  const r = await teleportInto(pose, s2)
  usedStandoff = s2
  if (r.ok) {
    arrivedOk = true
    break
  }
}
await new Promise((r) => setTimeout(r, 2500))

// VERIFY THE CAMERA ARRIVED. `requestWalkTeleport` runs the walker through the
// app's own collision solver (WALK-SPAWN-CLEAR), which pushes it out of furniture
// and walls — so a requested point inside a bed lands somewhere else entirely,
// sometimes in another room. v0.31.5.202 measured two bedrooms and both baths
// from the CORRIDOR without noticing, because nothing compared the pose asked for
// with the pose reached.
const arrival = await page.evaluate(
  (q) => {
    const { camera } = window.__three
    const plan = window.__store.getState().floorPlan
    const roomAt = (px, pz) =>
      (plan?.rooms ?? []).find(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      )?.id ?? null
    return {
      asked: [+q.px.toFixed(2), +q.pz.toFixed(2)],
      standoffUsed: +q.so.toFixed(2),
      landedInRoom: q.ok,
      reached: [+camera.position.x.toFixed(2), +camera.position.z.toFixed(2)],
      drift: +Math.hypot(camera.position.x - q.px, camera.position.z - q.pz).toFixed(2),
      roomAsked: roomAt(q.px, q.pz),
      roomReached: roomAt(camera.position.x, camera.position.z),
    }
  },
  {
    px: pose.cx + pose.nx * usedStandoff,
    pz: pose.cz + pose.nz * usedStandoff,
    so: usedStandoff,
    ok: arrivedOk,
  },
)

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
  `light-distribution  ${JSON.stringify({ ...state, arrival, window: pose.id, standoff: +pose.standoff.toFixed(2), standoffAsked: STANDOFF, pitch: PITCH })}`,
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
/**
 * GEOMETRIC cross-check of the three band ratios.
 *
 * The bands above are fixed screen rectangles, and this probe's own header calls
 * that "crude but honest: the caller picks a pose where the top band really is
 * ceiling". In a SMALL room that assumption is the thing under test — v0.31.5.204
 * found bedroom ceilings apparently stuck at 0.95-0.99 while living/dining
 * responded normally to the same lever, which is either a real lighting gap or a
 * band full of wall. So classify by WORLD NORMAL instead (the `wall-cap.mjs` /
 * `underside-shadow.mjs` approach) and print both; where they disagree, the band
 * is the one to distrust.
 */
// RESTORE THE MAIN PITCH FIRST. The floor capture above leaves the camera pitched
// down at `FLOOR_PITCH`, and this block used to raycast in that state — which is
// why v0.31.5.204 found ZERO ceiling samples and briefly put the whole ceiling
// metric in doubt. The band was right all along; the cross-check was looking at
// the floor. (`ceiling-hit.mjs` settled it: in the band every ray hits y = 2.6 m
// with n.y = -1 on the ceiling's MeshLambertMaterial.)
await page.evaluate((p) => window.__walkLook?.setPitch(p), PITCH)
await new Promise((r) => setTimeout(r, 900))
const geo = await page.evaluate(
  ({ g, win, hud }) => {
    const { scene, camera } = window.__three
    const rc = new window.__three.raycaster.constructor()
    const n = new camera.position.constructor()
    const solid = (o) => o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
    const out = []
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const x = (i + 0.5) / g
        const y = (j + 0.5) / g
        if (hud.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) continue
        rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
        const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
        if (!h?.face) continue
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        // Ceiling: faces DOWN and is overhead. Floor: faces UP and is underfoot.
        // Wall: near-vertical surface. Everything else (furniture tops, sills)
        // is deliberately unclassified rather than forced into a bucket.
        let kind = null
        // Accept EITHER normal sign at ceiling height: a single-sided ceiling
        // plane authored facing up still reports +Y from a ray hitting its back.
        if (Math.abs(n.y) > 0.9 && h.point.y > 2.0) kind = 'ceiling'
        else if (Math.abs(n.y) > 0.9 && h.point.y < 0.15) kind = 'floor'
        else if (Math.abs(n.y) < 0.3) kind = 'wall'
        // Distance from the WINDOW plane, so wall samples can be split by how far
        // into the room they sit. A real room's far wall is only modestly darker
        // than its near one, because bounce fills it (photo D: 0.85-0.86).
        // Along the window's INWARD NORMAL: how far into the room the sample is.
        const dWin = Math.abs((h.point.x - win.cx) * win.nx + (h.point.z - win.cz) * win.nz)
        if (kind) out.push({ x, y, kind, dWin: +dWin.toFixed(2) })
      }
    }
    return out
  },
  {
    g: 70,
    win: { cx: pose.cx, cz: pose.cz, nx: pose.nx, nz: pose.nz },
    hud: [
      { x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 },
      { x0: 0.9, x1: 1, y0: 0, y1: 0.06 },
      { x0: 0.76, x1: 1, y0: 0.76, y1: 1 },
    ],
  },
)
{
  const buckets = { ceiling: [], wall: [], floor: [] }
  for (const h of geo) {
    const gx = Math.min(W - 1, Math.floor(h.x * W))
    const gy = Math.min(H - 1, Math.floor(h.y * H))
    buckets[h.kind].push(data[gy * W + gx])
  }
  const mean = (a) => (a.length ? a.reduce((s2, v) => s2 + v, 0) / a.length : Number.NaN)
  const all = [...buckets.ceiling, ...buckets.wall, ...buckets.floor]
  const base = mean(all)
  console.log('')
  console.log(
    `geometric mask (world normal), ${buckets.ceiling.length} ceiling / ${buckets.wall.length} wall / ${buckets.floor.length} floor samples:`,
  )
  console.log(
    `  ceiling ${(mean(buckets.ceiling) / base).toFixed(2)}   wall ${(mean(buckets.wall) / base).toFixed(2)}   floor ${(mean(buckets.floor) / base).toFixed(2)}   (normalised by their own combined mean ${base.toFixed(1)})`,
  )
  // CEILING / WALL is the composition-independent one, and it is the number to
  // compare (v0.31.5.206). Every ratio taken against a FRAME mean moves with what
  // happens to be in shot — the same trap `.201` hit on the curtain, where the
  // reference curtains covered 2-8 % of their frames and the probe's filled 35 %.
  // Two surfaces in the SAME frame have no such dependence.
  console.log(
    `  ceiling/wall = ${(mean(buckets.ceiling) / mean(buckets.wall)).toFixed(2)}   (photographs 0.90 and 1.00 — see .206)`,
  )
  // WALL FALLOFF with distance from the window -- same material, same frame, so
  // composition cancels (.226). Photo D reads 0.85-0.86.
  {
    const nearW = []
    const farW = []
    for (const h of geo) {
      if (h.kind !== 'wall') continue
      const gx = Math.min(W - 1, Math.floor(h.x * W))
      const gy = Math.min(H - 1, Math.floor(h.y * H))
      const v = data[gy * W + gx]
      // Bands sized to what this pose can SEE: it stands 4.6 m back looking AT
      // the window, so every visible wall lies between 0 and ~4.6 m of it.
      if (h.dWin <= 1.5) nearW.push(v)
      else if (h.dWin >= 3) farW.push(v)
    }
    const mn = mean(nearW)
    const mf2 = mean(farW)
    console.log(
      `  wall falloff: near-window ${mn.toFixed(1)} (${nearW.length}), far ${mf2.toFixed(1)} (${farW.length}), far/near = ${(mf2 / mn).toFixed(2)}   (photograph 0.85-0.86)`,
    )
  }
  if (buckets.ceiling.length < 20)
    console.log('  WARNING: few ceiling samples — the pose may not see enough ceiling.')
}

console.log('')
console.log('targets, from the reference photographs:')
console.log('  %<64      1.9–12.2 %  (four photographs; the two looks bracket it)')
console.log('            ** POSE-BOUND. Measured in ONE room under ONE lighting state,')
console.log('            this figure runs 18.63 % at PITCH -0.5 to 1.42 % at PITCH 0.35 —')
console.log('            a 13x swing that spans the whole photographic band (.207). Use it')
console.log('            to COMPARE two builds at an identical pose, never as an absolute')
console.log('            target against photographs of a different composition. **')
console.log('  ceiling   1.08–1.28   (four photographs. The DEFAULT look at 1.12 is')
console.log('            inside the band; the PHOTOGRAPHIC look at 0.87 is not, and')
console.log('            that is the one region ratio still outside the references)')
console.log('  floor     NOT a target — four photographs span 0.87–1.30. The ratio')
console.log('            tracks floor ALBEDO (pale stone vs dark parquet), not light')
console.log('            transport (see the .181 and .188 entries in the research doc)')
console.log('  wall      NOT a target — four photographs span 0.53–1.43')
await browser.close()
