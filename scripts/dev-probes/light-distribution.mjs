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
// PT=1 renders a 1920x1080 still, so the walk camera must be 16:9 too or the two
// pictures are differently framed and no shared band can be compared (`.247`).
// VH overrides it independently so the aspect can be varied WITHOUT running the
// tracer -- `.247` needed that to prove the falloff shift was the aspect and not
// the PT branch.
// VW varies the WIDTH at a fixed VH. `walkFov` is a VERTICAL fov, so height
// controls how much world is seen vertically and width controls it horizontally.
// Reaching one aspect two different ways (1280x853 vs 1200x800, both 1.50) is
// therefore NOT the same picture, and separating the two axes is what says
// whether the falloff metric responds to aspect or to horizontal field (`.249`).
await page.setViewport({
  width: Number(process.env.VW || 1280),
  height: Number(process.env.VH || (process.env.PT === '1' ? 720 : 800)),
  deviceScaleFactor: 2,
})
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
// LIGHTS=off switches every placed light OFF, so a DAYLIGHT-ONLY frame can be
// measured. The canonical pose stands under a lit ceiling fixture -- the walk HUD
// prints "Turn off ceiling light" in every frame this arc has captured -- and a
// daylit reference photograph has no such source. Reported, not assumed: the
// probe prints how many fixtures it flipped (`.250`).
if (process.env.LIGHTS === 'off') {
  const flipped = await page.evaluate(() => {
    const s = window.__store.getState()
    const before = window.__store.getState().items
    const on = before.filter((it) => it.props?.lightOn !== 'no').map((it) => it.id)
    let k = 0
    for (const id of on) {
      s.toggleLightPower(id)
      const after = window.__store.getState().items.find((it) => it.id === id)
      if (after?.props?.lightOn === 'no') k++
    }
    return { candidates: on.length, flipped: k }
  })
  console.log(`LIGHTS=off  flipped ${flipped.flipped} of ${flipped.candidates} candidate items`)
}
// CEIL_STD=1 swaps the LIVE ceiling's MeshLambertMaterial for an equivalent
// MeshStandardMaterial (roughness 0.9, metalness 0) -- the same stand-in
// v0.31.5.253 gives the tracer, but applied to the RASTER instead.
//
// This is the control the ceiling comparison needs. `.253` fixed the tracer's
// mirror ceiling by substituting inside the tracer snapshot only, which leaves
// the comparison CROSS-MATERIAL: raster Lambert against traced Standard. Lambert
// is pure diffuse; Standard at 0.9 still carries a weak specular lobe and an
// environment response. So before any residual ceiling gap can be called light
// transport, the Lambert-to-Standard delta has to be measured on the raster side
// where nothing else changes.
if (process.env.CEIL_STD === '1') {
  const swapped = await page.evaluate(() => {
    const { scene } = window.__three
    // No `three` import available in page scope -- lift the constructor off an
    // existing Standard material in the scene.
    let Std = null
    scene.traverse((o) => {
      if (Std || !o.isMesh) return
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      if (m?.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) Std = m.constructor
    })
    if (!Std) return { error: 'no MeshStandardMaterial in scene to borrow' }
    const cache = new Map()
    let n = 0
    scene.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const next = mats.map((m) => {
        if (!m?.isMeshLambertMaterial) return m
        if (cache.has(m)) return cache.get(m)
        const sub = new Std({
          color: m.color?.clone?.(),
          map: m.map ?? null,
          side: m.side,
          transparent: !!m.transparent,
          opacity: m.opacity ?? 1,
          roughness: 0.9,
          metalness: 0,
        })
        cache.set(m, sub)
        return sub
      })
      if (next.some((m, i) => m !== mats[i])) {
        o.material = Array.isArray(o.material) ? next : next[0]
        n++
      }
    })
    return { meshes: n, materials: cache.size }
  })
  console.log(`CEIL_STD=1  live Lambert->Standard: ${JSON.stringify(swapped)}`)
}
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
/**
 * The live camera's exact state, so the ANCHORS block can prove it is projecting
 * with the same camera the raster frame was captured with.
 *
 * PT=1 opens a modal and runs a tracer between the raster capture and the anchor
 * projection. If anything in that sequence nudged the camera, the anchor screen
 * positions would be computed for one pose and applied to a frame taken at
 * another -- silently, and looking at the overlay would not catch it because the
 * patches would still land on plaster. So it is checked numerically (`.251`).
 */
const camState = () =>
  page.evaluate(() => {
    const c = window.__three.camera
    return {
      p: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(4)),
      q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w].map((v) => +v.toFixed(5)),
      fov: +c.fov.toFixed(4),
      aspect: +c.aspect.toFixed(5),
    }
  })

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
// Snapshot the camera HERE, while it still holds the pose `frame.png` was taken
// at. Taken any later it records FLOOR_PITCH from the pitched-down capture below,
// and the guard then reports drift on every run -- which is what the first `.251`
// run did (q.x -0.272 vs -0.030, i.e. -0.55 rad against -0.06).
const camAtRaster = await camState()
const shotDown = await shotFor(FLOOR_PITCH)
fs.writeFileSync(`${OUT}/frame.png`, shot)
fs.writeFileSync(`${OUT}/frame-down.png`, shotDown)
console.log(
  `light-distribution  ${JSON.stringify({ ...state, arrival, window: pose.id, standoff: +pose.standoff.toFixed(2), standoffAsked: STANDOFF, pitch: PITCH })}`,
)
console.log(`frame -> ${OUT}/frame.png`)

// PT=1 — additionally capture a PATH-TRACED still of THIS pose (`.246`).
//
// The point is to test, rather than infer, the diagnosis this arc has carried
// since `.226`: that the wall-falloff gap is absent inter-reflection. The HQ
// still uses real light transport, so if its falloff lands near the photographic
// 0.85-0.86 while the raster pose reads 0.74, GI is confirmed as the cause.
//
// It lives HERE rather than in a standalone probe because the pose above --
// window match, standoff clamp, arrival-checked teleport, pitch -- is ~180 lines
// that must be identical in both images. `.245`'s feasibility probe skipped it
// and rendered the orbit dollhouse, which is `.218`'s trap all over again.
if (process.env.PT === '1') {
  const want = Number(process.env.PTSAMPLES || 48)
  await page.evaluate((v) => window.__walkLook?.setPitch(v), PITCH)
  await new Promise((r) => setTimeout(r, 600))
  await page.evaluate(() => window.__store.getState().setHqRenderOpen?.(true))
  await new Promise((r) => setTimeout(r, 2500))
  const started = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.textContent || '').trim() === 'Start render',
    )
    if (!b) return false
    b.click()
    return true
  })
  if (!started) throw new Error('PT: no Start render button')
  const t0 = Date.now()
  let got = 0
  while (Date.now() - t0 < 600_000) {
    const m = await page.evaluate(() => {
      const t = document.body.innerText || ''
      const r = t.match(/(\d+)\s*\/\s*(\d+)\s*samples?/i)
      return r ? Number(r[1]) : null
    })
    if (m != null) got = m
    if (got >= want) break
    await new Promise((r) => setTimeout(r, 4000))
  }
  // Read the tracer canvas's OWN PIXELS via toDataURL rather than screenshotting
  // the element. `.246` screenshotted it and the modal footer bled into the
  // bottom of the capture, because an element screenshot grabs the page region
  // at that element's box and the canvas box runs under the chrome. toDataURL
  // cannot include DOM at all, and it returns full render resolution instead of
  // the CSS-scaled preview.
  const png = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')]
    // The tracer's canvas is the largest one that is not the live scene canvas
    // (which is first in document order and sized to the viewport).
    const scene = list[0]
    const cands = list.filter((c) => c !== scene && c.width > 16 && c.height > 16)
    const c = cands.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!c) return null
    try {
      return { url: c.toDataURL('image/png'), w: c.width, h: c.height }
    } catch {
      return null
    }
  })
  if (!png) throw new Error('PT: could not read a tracer canvas')
  fs.writeFileSync(`${OUT}/pathtraced.png`, Buffer.from(png.url.split(',')[1], 'base64'))
  console.log(`pathtraced (${got} samples, ${png.w}x${png.h}) -> ${OUT}/pathtraced.png`)
}
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
// v0.31.5.229: the walk-mode PILL ("Turn off ceiling light") and the HINT BAR
// sit in the lower middle of the frame and were never excluded -- they land
// squarely inside the FLOOR band, so the floor ratio was being measured partly
// over DOM chrome.
const PILL = { x0: 0.4 * W, x1: 0.61 * W, y0: 0.81 * H, y1: 0.89 * H }
const HINTS = { x0: 0.28 * W, x1: 0.72 * W, y0: 0.9 * H, y1: 0.98 * H }
const hud = (x, y) =>
  (x >= TOOLBAR.x0 && x < TOOLBAR.x1 && y < TOOLBAR.y1) ||
  (x >= MEASURE.x0 && y < MEASURE.y1) ||
  (x >= MINIMAP.x0 && y >= MINIMAP.y0) ||
  (x >= PILL.x0 && x <= PILL.x1 && y >= PILL.y0 && y <= PILL.y1) ||
  (x >= HINTS.x0 && x <= HINTS.x1 && y >= HINTS.y0 && y <= HINTS.y1)
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
const FLOOR_BAND = { y0: 0.72, y1: 0.96, x0: 0.2, x1: 0.8 }
rel.floor = band(down.data, FLOOR_BAND, downMean)
/**
 * FLOOR micro-contrast over the same validated band -- high-pass (pixel minus a
 * 4 px blur), so it measures grain and reflection and NOT the lighting gradient.
 * `.197` measured raw sd here and got 0.288, which was mostly the gradient.
 * Reference floors (`.229`): glossy parquet 0.058 / 0.076, matte pale wood 0.032,
 * kitchen tile 0.076 -- so a real floor sits in **0.032-0.076** whatever its
 * finish, and a floor far below that is rendering as a flat print.
 */
{
  const bx0 = Math.floor(FLOOR_BAND.x0 * W)
  const bx1 = Math.floor(FLOOR_BAND.x1 * W)
  const by0 = Math.floor(FLOOR_BAND.y0 * H)
  const by1 = Math.floor(FLOOR_BAND.y1 * H)
  const bw = bx1 - bx0
  const bh = by1 - by0
  // NOTE: the band still contains DECOR (a candle tray sits in it at the shipped
  // pose), so this number is an upper bound on the floor's own micro-contrast.
  // The geometric floor below is the trustworthy one. HUD pixels are skipped.
  const buf = Buffer.alloc(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const gx = bx0 + x
      const gy = by0 + y
      buf[y * bw + x] = hud(gx, gy) ? down.data[by0 * W + bx0] : down.data[gy * W + gx]
    }
  const blurred = await sharp(buf, { raw: { width: bw, height: bh, channels: 1 } })
    .blur(4)
    .raw()
    .toBuffer()
  let m = 0
  for (let i = 0; i < buf.length; i++) m += buf[i]
  m /= buf.length
  let hp = 0
  for (let i = 0; i < buf.length; i++) hp += (buf[i] - blurred[i]) ** 2
  const sd = Math.sqrt(hp / buf.length)
  console.log('')
  console.log(
    `floor micro-contrast: mean ${m.toFixed(0)}, micro-sd ${sd.toFixed(2)}, micro/mean ${(sd / m).toFixed(4)}   (real floors 0.032-0.076)`,
  )
}
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
        // Carry the hit object's identity. `kind` is a NORMAL test only, so a
        // sample can be plaster, a sideboard front, a TV or a window pane and
        // the printed mean cannot tell them apart -- which is how the falloff
        // metric measured furniture for 23 rounds (`.249`).
        // Objects in this scene are overwhelmingly unnamed, so identify the hit
        // by GEOMETRY TYPE + BASE COLOUR instead: plaster shell reads as a
        // near-white plane/box, furniture as a tinted one.
        const mat = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
        const hex = mat?.color?.getHexString?.() ?? '------'
        const name = `${h.object.geometry?.type ?? '?'}#${hex}`
        if (kind) out.push({ x, y, kind, dWin: +dWin.toFixed(2), name: name || '(unnamed)' })
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
  // CEILING / WALL was adopted in `.206` as the composition-independent metric:
  // every ratio taken against a FRAME mean moves with whatever happens to be in
  // shot -- the trap `.201` hit on the curtain, where the reference curtains
  // covered 2-8 % of their frames and the probe's filled 35 %. Two surfaces in the
  // SAME frame do escape THAT. They do not escape the two below, so this number is
  // printed as a diagnostic and is NOT a target:
  //
  //   `.232` POSE. It moves 0.68 -> 0.96 in one room, one hour, one lighting
  //   state, from camera pitch alone. Pitched down the ceiling is a grazing sliver
  //   dominated by the wall junction; pitched up it is broad and evenly lit.
  //
  //   `.233` METHOD. This geometric mask takes EVERY ceiling pixel including that
  //   junction; the reference photographs were hand-cropped clear of it. Cropped
  //   the same way, the same frame at the same pose reads 0.93, not 0.88 -- most
  //   of the apparent deficit was the two methods disagreeing, not the render.
  //
  // And the reference side is thin. Of 19 photographs screened across `.233` and
  // `.234`, TWO met "ceiling and wall the same plaster paint, daylit, ceiling and
  // wall both croppable clear of junctions, no obvious flash/HDR, not AI stock":
  // they read 1.03 and 0.91. One of `.206`'s own surviving sources has a TIMBER
  // ceiling (0.84), i.e. it measures albedo, not light.
  //
  // `.234`: hand-cropped, this scene reads 0.93 -- INSIDE that 0.91-1.03 spread.
  // The ceiling deficit of `.188` does not survive method- and pose-matched
  // re-measurement, and is retired as a claim.
  console.log(
    [
      `  ceiling/wall = ${(mean(buckets.ceiling) / mean(buckets.wall)).toFixed(2)}   DIAGNOSTIC, not a target -- pose- and method-bound, see .232/.233`,
      '    hand-cropped clear of the junction this scene reads 0.93, INSIDE the',
      '    0.91-1.03 spread of the two qualifying photographs (.234).',
    ].join('\n'),
  )
  // WALL FALLOFF -- **RETIRED in `.249`. This is not a wall measurement.**
  //
  // `.226` adopted it as "same material, same frame, so composition cancels".
  // `.247` falsified the "composition cancels" half (0.19 of swing on viewport
  // aspect alone). `.249` falsified the "same material" half, which is worse:
  // `kind = 'wall'` is only `|n.y| < 0.3`, i.e. ANY near-vertical surface, so the
  // buckets were never plaster. Tallied by geometry type + base colour at the
  // canonical pose, `medium`, photographic look, 13:00, aspect 1.50:
  //
  //     near (dWin<=1.5)  plaster 34%, WINDOW GLAZING 31%, curtain 9%, ...
  //     far  (dWin>=3)    dark timber armchairs 64%, LAMPSHADE 21%,
  //                       lamp pole 13%, plaster **0%**
  //
  // At every aspect a real camera shoots (1.33-1.52; see `.249` for the screened
  // set's own aspects) the far bucket contains NO WALL AT ALL. Plaster only
  // enters it past ~1.8, which is why the number climbs 0.60 -> 0.98 across
  // 1.20 -> 2.00, non-monotonically in between: aspect decides how much dark
  // furniture and bright right wall the frame admits.
  //
  // The reference, photo D at 0.85-0.86, was TWO HAND CROPS of actual plaster.
  // So the two sides were never the same measurement -- `.233`'s method-mismatch
  // lesson, on the axis the arc had left standing.
  //
  // Kept printing ONLY as a regression tripwire between two builds at a byte-
  // identical pose and viewport. It is not comparable to any photograph.
  // Use OVERLAY=1 to see the buckets before believing anything here.
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
    // WHAT IS ACTUALLY IN EACH BUCKET. Printed unconditionally, because the
    // number above is worthless without it (`.249`).
    {
      const tally = (pred, kind = 'wall') => {
        const c = new Map()
        for (const h of geo) {
          if (h.kind !== kind || !pred(h.dWin)) continue
          c.set(h.name, (c.get(h.name) || 0) + 1)
        }
        const tot = [...c.values()].reduce((a, b) => a + b, 0) || 1
        return [...c.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k} ${((100 * v) / tot).toFixed(0)}%`)
          .join(', ')
      }
      console.log(`    near bucket population: ${tally((d) => d <= 1.5)}`)
      console.log(`    far  bucket population: ${tally((d) => d >= 3)}`)
      console.log(`    ALL 'wall' samples:      ${tally(() => true)}`)
      console.log(`    ALL 'ceiling' samples:   ${tally(() => true, 'ceiling')}`)
    }
    // OVERLAY=1 paints every sample the falloff actually used onto the frame --
    // green = near bucket, red = far bucket -- because `kind = 'wall'` is only
    // `|n.y| < 0.3`, i.e. ANY near-vertical surface, and a printed mean cannot
    // show whether that population is plaster or the sideboard front (`.249`).
    if (process.env.OVERLAY === '1') {
      const rgb = await sharp(shot).removeAlpha().raw().toBuffer()
      const dot = (gx, gy, r, g2, b) => {
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const px = gx + dx
            const py = gy + dy
            if (px < 0 || py < 0 || px >= W || py >= H) continue
            const o = (py * W + px) * 3
            rgb[o] = r
            rgb[o + 1] = g2
            rgb[o + 2] = b
          }
      }
      for (const h of geo) {
        if (h.kind !== 'wall') continue
        const gx = Math.min(W - 1, Math.floor(h.x * W))
        const gy = Math.min(H - 1, Math.floor(h.y * H))
        if (h.dWin <= 1.5) dot(gx, gy, 0, 255, 0)
        else if (h.dWin >= 3) dot(gx, gy, 255, 0, 0)
      }
      await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
        .png()
        .toFile(`${OUT}/falloff-samples.png`)
      console.log(`  falloff sample overlay -> ${OUT}/falloff-samples.png`)
    }
    console.log(
      [
        `  wall falloff: near-window ${mn.toFixed(1)} (${nearW.length}), far ${mf2.toFixed(1)} (${farW.length}), far/near = ${(mf2 / mn).toFixed(2)}`,
        `    ** RETIRED as a photographic comparison (.249). NOT a wall measurement: at`,
        `    camera aspects the far bucket is 98% furniture and 0% plaster, the near bucket`,
        `    is 31% window glazing, and the number runs 0.60-0.98 on viewport aspect alone.`,
        `    Compare only against another build at an IDENTICAL pose AND viewport. **`,
      ].join('\n'),
    )
  }
  if (buckets.ceiling.length < 20)
    console.log('  WARNING: few ceiling samples — the pose may not see enough ceiling.')
}

/**
 * ANCHORED WALL FALLOFF — the framing-invariant replacement for the metric
 * `.249` retired.
 *
 * `.226`-`.247` measured falloff as a ratio of two SCREEN-SELECTED populations.
 * `.249` showed why that could never work: `kind = 'wall'` is a normal test, so
 * the far bucket was 64 % armchair backs and 0 % plaster, and viewport aspect
 * decided the furniture-to-wall mix (0.60-0.98 on aspect alone).
 *
 * This defines the population IN THE WORLD instead. Walk out along the window's
 * inward normal; at each distance `d`, shoot sideways to find the side wall;
 * accept the anchor only if that surface is VERTICAL, its normal is PARALLEL to
 * the window normal (a wall of constant orientation — `.227`'s own criterion for
 * a usable reference photograph, applied to the app for the first time), and a
 * fixed 0.24 x 0.24 m patch of it is unoccluded, on-screen, clear of the HUD and
 * all one material. Every rejection is printed.
 *
 * That is the same measurement photo D got by hand — a patch of plaster near the
 * window against a patch of the same plaster further along — so for the first
 * time the two sides are comparable. And because the patch is defined in metres
 * on the wall rather than in pixels on the screen, the number cannot move with
 * framing. `ASPECT_INVARIANCE=1` re-runs the whole probe across aspects to check
 * that claim rather than asserting it.
 */
if (process.env.ANCHORS === '1') {
  const ANCHOR_Y = Number(process.env.ANCHOR_Y || 1.5)
  const DS = (process.env.ANCHOR_DS || '0.6,1.2,1.8,2.4,3.0,3.6').split(',').map(Number)
  const HALF = Number(process.env.ANCHOR_HALF || 0.12)
  const GRID = Number(process.env.ANCHOR_GRID || 7)
  const SIDES = (process.env.ANCHOR_SIDES || 'A,B,C,F').split(',')
  const anchors = await page.evaluate(
    ({ win, ds, y, half, grid, hud, sides }) => {
      const { scene, camera } = window.__three
      const V = camera.position.constructor
      const rc = new window.__three.raycaster.constructor()
      const solid = (o) =>
        o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
      const sig = (o) => {
        const m = Array.isArray(o.material) ? o.material[0] : o.material
        return `${o.geometry?.type ?? '?'}#${m?.color?.getHexString?.() ?? '------'}`
      }
      const firstHit = (from, dir) => {
        rc.set(from, dir)
        return rc.intersectObjects(scene.children, true).find((k) => solid(k.object) && k.face)
      }
      const n = new V(win.nx, 0, win.nz)
      const perp = new V(-win.nz, 0, win.nx)
      const inHud = (sx, sy) =>
        hud.some((r) => sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1)
      const out = []
      // `.252`: the same machinery, aimed at the CEILING and FLOOR as well as the
      // side walls. Sides A/B shoot sideways, C shoots up, F shoots down. All
      // four are world-anchored, so all four can be sampled identically on the
      // raster frame and on the traced still.
      const probes = [
        { side: 'A', dir: () => perp.clone(), axis: 'perp' },
        { side: 'B', dir: () => perp.clone().multiplyScalar(-1), axis: 'perp' },
        { side: 'C', dir: () => new V(0, 1, 0), axis: 'up' },
        { side: 'F', dir: () => new V(0, -1, 0), axis: 'up' },
      ].filter((q) => sides.includes(q.side))
      for (const d of ds) {
        const origin = new V(win.cx + win.nx * d, y, win.cz + win.nz * d)
        for (const pr of probes) {
          const rec = { d, side: pr.side }
          const dir = pr.dir()
          const h = firstHit(origin, dir)
          if (!h) {
            rec.reject = 'no sideways hit'
            out.push(rec)
            continue
          }
          rec.sig = sig(h.object)
          rec.span = +h.distance.toFixed(2)
          const wn = new V().copy(h.face.normal).transformDirection(h.object.matrixWorld)
          // A SIDE wall runs away from the window, so its normal is parallel to
          // the window wall's direction (`perp`) and PERPENDICULAR to the window
          // normal. Testing against `n` instead is what the first `.250` attempt
          // did, and it rejected all 12 anchors with |n.nWin| = 0 -- the value a
          // correct side wall must have.
          rec.dotPerp = +Math.abs(wn.dot(pr.axis === 'up' ? new V(0, 1, 0) : perp)).toFixed(3)
          rec.dotWin = +Math.abs(wn.dot(n)).toFixed(3)
          if (pr.axis === 'up' ? Math.abs(wn.y) < 0.9 : Math.abs(wn.y) > 0.3) {
            rec.reject = pr.axis === 'up' ? 'surface not horizontal' : 'surface not vertical'
            out.push(rec)
            continue
          }
          // A wall of CONSTANT ORIENTATION relative to the window (`.227`): its
          // normal must be parallel to the window normal, or "further along" is
          // not "further from the light" and the number mixes distance with
          // incidence angle.
          if (rec.dotPerp < 0.9) {
            rec.reject = 'surface turns along its run (not constant orientation)'
            out.push(rec)
            continue
          }
          // No offset off the surface. `.252`'s first attempt pulled the patch 2 cm
          // off along the probe direction and then tested visibility by comparing
          // the camera ray's hit DISTANCE against the distance to the anchor. That
          // works for a wall faced nearly head-on and fails completely for the
          // ceiling and floor, which are seen almost edge-on from eye height: 2 cm
          // of PERPENDICULAR offset becomes 0.08-0.12 m ALONG a grazing ray, over
          // the 6 cm tolerance, so all 12 ceiling anchors read "occluded 225/225".
          // The camera ray never starts on the surface, so no offset is needed;
          // visibility is now object identity plus 3-D proximity.
          const base = h.point.clone()
          // In-plane basis derived from the HIT NORMAL, so one code path serves a
          // vertical wall, the ceiling and the floor. U is the window's inward
          // normal projected into the surface (so `a` always means "further into
          // the room"); V completes the frame.
          const bu = n.clone().sub(wn.clone().multiplyScalar(n.dot(wn)))
          if (bu.length() < 1e-6) bu.copy(perp)
          bu.normalize()
          const bv = new V().crossVectors(wn, bu).normalize()
          const pts = []
          let occluded = 0
          let offscreen = 0
          let inhud = 0
          let mixed = 0
          for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
              const a = half * (2 * (i / (grid - 1)) - 1)
              const b = half * (2 * (j / (grid - 1)) - 1)
              const p = base
                .clone()
                .add(bu.clone().multiplyScalar(a))
                .add(bv.clone().multiplyScalar(b))
              const toCam = p.clone().sub(camera.position)
              const hh = firstHit(camera.position, toCam.clone().normalize())
              if (!hh || hh.object !== h.object || hh.point.distanceTo(p) > 0.05) {
                occluded++
                continue
              }
              if (sig(hh.object) !== rec.sig) {
                mixed++
                continue
              }
              const sp = p.clone().project(camera)
              const sx = (sp.x + 1) / 2
              const sy = (1 - sp.y) / 2
              if (sx < 0 || sx > 1 || sy < 0 || sy > 1) {
                offscreen++
                continue
              }
              if (inHud(sx, sy)) {
                inhud++
                continue
              }
              pts.push([sx, sy])
            }
          }
          rec.occluded = occluded
          rec.offscreen = offscreen
          rec.inhud = inhud
          rec.mixed = mixed
          rec.pts = pts
          if (pts.length < grid * grid) rec.reject = 'patch not wholly clean'
          out.push(rec)
        }
      }
      return out
    },
    {
      win: { cx: pose.cx, cz: pose.cz, nx: pose.nx, nz: pose.nz },
      ds: DS,
      y: ANCHOR_Y,
      half: HALF,
      grid: GRID,
      sides: SIDES,
      hud: [
        { x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 },
        { x0: 0.9, x1: 1, y0: 0, y1: 0.06 },
        { x0: 0.76, x1: 1, y0: 0.76, y1: 1 },
      ],
    },
  )
  console.log(
    `\nANCHORED wall falloff  (y=${ANCHOR_Y} m, patch ${(2 * HALF).toFixed(2)}x${(2 * HALF).toFixed(2)} m, ${GRID}x${GRID} world samples)`,
  )
  // THE APERTURE, printed with the falloff. `.251`: how much a wall falls off away
  // from its window is a property of the WINDOW-TO-WALL GEOMETRY, not only of the
  // renderer. A window that fills most of the end wall lights the first few metres
  // almost uniformly, whatever the light transport. So the geometry has to travel
  // with the number, or two rooms get compared as if they were two renderers.
  const aperture = await page.evaluate((winId) => {
    const plan = window.__store.getState().floorPlan
    const op = (plan.openings ?? []).find((o) => o.id === winId)
    const w = (plan.walls ?? []).find((x) => x.id === op?.wallId)
    if (!op || !w) return null
    const wallLen = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    const room = (plan.rooms ?? []).find((r) => r.id === 'livingDining')
    return {
      width: +op.width.toFixed(2),
      height: op.height != null ? +op.height.toFixed(2) : null,
      sill: op.sill != null ? +op.sill.toFixed(2) : null,
      wallLen: +wallLen.toFixed(2),
      room: room ? { w: +room.width.toFixed(2), d: +room.depth.toFixed(2) } : null,
    }
  }, pose.id)
  if (aperture)
    console.log(
      `  aperture: window ${aperture.width} m wide` +
        (aperture.height ? ` x ${aperture.height} m tall (sill ${aperture.sill})` : '') +
        ` in a ${aperture.wallLen} m wall = ${((100 * aperture.width) / aperture.wallLen).toFixed(0)} % of it` +
        (aperture.room ? `; room ${aperture.room.w} x ${aperture.room.d} m` : ''),
    )
  // SAME PAINT ALONG THE RUN. `.233` screens reference photographs for "same
  // plaster on both surfaces"; the same rule has to hold along one wall, and it
  // does not come free. The first `.250` run accepted side A at d=1.8 with
  // L=157.5 and signature `PlaneGeometry#ffffff` -- **the TV screen**, mounted on
  // that wall, vertical, correctly oriented and uniform across the whole patch,
  // so every per-patch test passed. Only looking at the overlay caught it.
  // So a side is measured only over anchors sharing ONE signature, and the
  // signature is printed for inspection.
  {
    const bySide = { A: [], B: [], C: [], F: [] }
    for (const a of anchors) if (!a.reject && a.sig) bySide[a.side].push(a)
    for (const side of SIDES) {
      const counts = new Map()
      for (const a of bySide[side]) counts.set(a.sig, (counts.get(a.sig) || 0) + 1)
      const [dominant] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0] ?? []
      for (const a of bySide[side])
        if (a.sig !== dominant)
          a.reject = `different material along the run (${a.sig} vs ${dominant})`
      if (bySide[side].length && counts.size > 1)
        console.log(
          `  side ${side}: ${counts.size} materials along the run -- ${[...counts.entries()].map(([k, v]) => `${k} x${v}`).join(', ')} -- measuring only ${dominant}`,
        )
    }
  }
  // THE TRACED PICTURE, SAMPLED AT THE SAME WORLD POINTS (`.251`).
  //
  // `.246` could not measure the tracer canvas because the probe's population was
  // defined by a world-normal mask plus a screen split, and the tracer canvas
  // offers no depth or normal readback. Anchors remove that problem entirely: the
  // patch is a set of WORLD points chosen before either picture exists, so its
  // projection is computed once from the shared camera and applied to both
  // images. The only requirement is that the two pictures share an ASPECT, since
  // `camera.project` uses it -- which is why PT=1 pins the walk viewport to 16:9
  // (`.247`).
  let traced = null
  if (fs.existsSync(`${OUT}/pathtraced.png`)) {
    const g = await sharp(`${OUT}/pathtraced.png`)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    traced = { data: g.data, W: g.info.width, H: g.info.height }
    const camNow = await camState()
    const same = JSON.stringify(camNow) === JSON.stringify(camAtRaster)
    console.log(
      `  traced still ${traced.W}x${traced.H} (aspect ${(traced.W / traced.H).toFixed(3)}), raster ${W}x${H} (aspect ${(W / H).toFixed(3)})`,
    )
    console.log(
      `  camera identical between raster capture and anchor projection: ${same ? 'YES' : `NO -- ${JSON.stringify(camAtRaster)} vs ${JSON.stringify(camNow)}`}`,
    )
    if (Math.abs(traced.W / traced.H - W / H) > 0.005)
      console.log(
        '  ** ASPECT MISMATCH: the two pictures are differently framed, so a shared\n' +
          '  ** projection is invalid. Re-run with VH set so the walk viewport matches\n' +
          '  ** the tracer output aspect. Traced figures below are NOT comparable. **',
      )
  }
  const readings = { A: [], B: [], C: [], F: [] }
  const tracedReadings = { A: [], B: [], C: [], F: [] }
  const accepted = []
  for (const a of anchors) {
    if (a.reject) {
      console.log(
        `  d=${a.d.toFixed(1)} side ${a.side}  REJECTED: ${a.reject}   [${a.sig ?? '-'} span ${a.span ?? '-'} |n.perp| ${a.dotPerp ?? '-'}` +
          (a.pts
            ? `  clean ${a.pts.length}/${GRID * GRID}, occluded ${a.occluded}, offscreen ${a.offscreen}, hud ${a.inhud}, mixed ${a.mixed}`
            : '') +
          ']',
      )
      continue
    }
    accepted.push(a)
    let sum = 0
    for (const [sx, sy] of a.pts) {
      const gx = Math.min(W - 1, Math.floor(sx * W))
      const gy = Math.min(H - 1, Math.floor(sy * H))
      sum += data[gy * W + gx]
    }
    const m = sum / a.pts.length
    readings[a.side].push({ d: a.d, m })
    let tm = null
    if (traced) {
      let ts = 0
      for (const [sx, sy] of a.pts) {
        const gx = Math.min(traced.W - 1, Math.floor(sx * traced.W))
        const gy = Math.min(traced.H - 1, Math.floor(sy * traced.H))
        ts += traced.data[gy * traced.W + gx]
      }
      tm = ts / a.pts.length
      tracedReadings[a.side].push({ d: a.d, m: tm })
    }
    console.log(
      `  d=${a.d.toFixed(1)} side ${a.side}  L=${m.toFixed(1)}${tm == null ? '' : `  traced L=${tm.toFixed(1)}`}   ${a.sig}  span ${a.span} m  |n.perp| ${a.dotPerp}`,
    )
  }
  for (const side of SIDES) {
    const r = readings[side]
    if (r.length < 2) {
      console.log(`  side ${side}: ${r.length} usable anchor(s) — no profile`)
      continue
    }
    const near = r[0]
    const far = r[r.length - 1]
    console.log(
      `  side ${side}: L(${near.d}) = ${near.m.toFixed(1)}  ->  L(${far.d}) = ${far.m.toFixed(1)}   far/near = ${(far.m / near.m).toFixed(3)}   over ${(far.d - near.d).toFixed(1)} m, ${r.length} anchors`,
    )
    console.log(`    profile: ${r.map((x) => `${x.d}m ${x.m.toFixed(1)}`).join('  ')}`)
    const t = tracedReadings[side]
    if (t.length === r.length && t.length >= 2) {
      const tn = t[0]
      const tf = t[t.length - 1]
      console.log(
        `    TRACED side ${side}: L(${tn.d}) = ${tn.m.toFixed(1)}  ->  L(${tf.d}) = ${tf.m.toFixed(1)}   far/near = ${(tf.m / tn.m).toFixed(3)}`,
      )
      console.log(`    TRACED profile: ${t.map((x) => `${x.d}m ${x.m.toFixed(1)}`).join('  ')}`)
    }
  }
  // CROSS-SURFACE RATIOS, RASTER vs TRACED (`.252`).
  //
  // `.251` established that the traced ABSOLUTE level is not reproducible across
  // sample counts (141 / 132 / 143 at 48 / 101 / 251) while a ratio between two
  // anchors is (spread 0.026), because whatever moves the level moves both. So
  // the usable comparison is a ratio BETWEEN SURFACES, measured inside each
  // picture and then compared across the two.
  //
  // This is the first instrument in the arc with no reference photograph in it.
  // Both pictures are the same scene, same pose, same camera, same world anchors;
  // one is rasterised and one is path-traced. A ratio that differs is a
  // rasteriser error, with no pose, method, tier, framing (`.247`/`.249`) or scene
  // (`.251`) confound available to explain it away. A ratio that agrees says the
  // raster is already doing what real transport does, whatever a photograph of
  // some other room says.
  {
    const label = { A: 'wall A', B: 'wall B', C: 'ceiling', F: 'floor' }
    const mm = (rs) => (rs.length ? rs.reduce((a, b) => a + b.m, 0) / rs.length : null)
    const rows = SIDES.map((k) => ({
      k,
      n: readings[k].length,
      r: mm(readings[k]),
      t: mm(tracedReadings[k]),
    })).filter((x) => x.n > 0)
    if (rows.length) {
      console.log('\n  surface means over accepted anchors (raster | traced):')
      for (const x of rows)
        console.log(
          `    ${label[x.k].padEnd(8)} n=${x.n}  raster ${x.r.toFixed(1)}` +
            (x.t == null ? '' : `  traced ${x.t.toFixed(1)}`),
        )
    }
    const haveTraced = rows.every((x) => x.t != null) && rows.length >= 2
    if (haveTraced) {
      console.log('  cross-surface ratios — RASTER vs TRACED at identical world anchors:')
      for (let i = 0; i < rows.length; i++)
        for (let j = 0; j < rows.length; j++) {
          if (i === j) continue
          const a = rows[i]
          const b = rows[j]
          if (a.k >= b.k) continue
          const rr = a.r / b.r
          const tr = a.t / b.t
          console.log(
            `    ${label[a.k]} / ${label[b.k]}:  raster ${rr.toFixed(3)}   traced ${tr.toFixed(3)}   ` +
              `raster/traced = ${(rr / tr).toFixed(3)}  (${((100 * (rr / tr - 1)) | 0) >= 0 ? '+' : ''}${(100 * (rr / tr - 1)).toFixed(1)} %)`,
          )
        }
      console.log(
        '    A ratio that agrees means the rasteriser already matches real transport\n' +
          '    on that pair. One that differs is a rasteriser error with no reference\n' +
          '    photograph, and so no scene or framing confound, in it (.252).',
      )
    }
  }
  if (process.env.OVERLAY === '1') {
    const rgb = await sharp(shot).removeAlpha().raw().toBuffer()
    const paint = (sx, sy, r, g2, b) => {
      const gx = Math.min(W - 1, Math.floor(sx * W))
      const gy = Math.min(H - 1, Math.floor(sy * H))
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const px = gx + dx
          const py = gy + dy
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          const o = (py * W + px) * 3
          rgb[o] = r
          rgb[o + 1] = g2
          rgb[o + 2] = b
        }
    }
    // Accepted anchors in cyan; every REJECTED anchor's surviving points in
    // magenta, so a patch that was thrown out is visible rather than absent.
    for (const a of anchors) {
      if (!a.pts) continue
      const acc = accepted.includes(a)
      for (const [sx, sy] of a.pts) paint(sx, sy, acc ? 0 : 255, acc ? 255 : 0, 255)
    }
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(`${OUT}/anchor-patches.png`)
    console.log(`  anchor overlay (cyan accepted / magenta rejected) -> ${OUT}/anchor-patches.png`)
    if (traced) {
      const trgb = await sharp(`${OUT}/pathtraced.png`).removeAlpha().raw().toBuffer()
      const tpaint = (sx, sy, r, g2, b) => {
        const gx = Math.min(traced.W - 1, Math.floor(sx * traced.W))
        const gy = Math.min(traced.H - 1, Math.floor(sy * traced.H))
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const px = gx + dx
            const py = gy + dy
            if (px < 0 || py < 0 || px >= traced.W || py >= traced.H) continue
            const o = (py * traced.W + px) * 3
            trgb[o] = r
            trgb[o + 1] = g2
            trgb[o + 2] = b
          }
      }
      for (const a of anchors) {
        if (!a.pts) continue
        const acc = accepted.includes(a)
        for (const [sx, sy] of a.pts) tpaint(sx, sy, acc ? 0 : 255, acc ? 255 : 0, 255)
      }
      await sharp(trgb, { raw: { width: traced.W, height: traced.H, channels: 3 } })
        .png()
        .toFile(`${OUT}/traced-patches.png`)
      console.log(`  traced anchor overlay -> ${OUT}/traced-patches.png`)
    }
  }
  console.log(
    '  This number is defined in WORLD metres, so it does not move with viewport aspect\n' +
      '  (verified by sweep in .250). It is the same measurement photo D got by hand:\n' +
      '  one patch of plaster near the window against the same plaster further along.',
  )
}

/**
 * FLOOR MICRO-CONTRAST over a region the geometry certifies as pure floor.
 *
 * `.229` measured this over the fixed floor BAND and got 0.224 against real
 * floors at 0.032-0.076 -- because that band contains a candle tray (and, until
 * `.229`, a HUD pill). A high-pass needs a CONTIGUOUS region, so point samples
 * cannot be used directly; instead, raycast the pitched-down pose, then search
 * for the largest candidate rectangle whose samples are ALL floor and measure
 * inside that.
 */
await page.evaluate((v) => window.__walkLook?.setPitch(v), FLOOR_PITCH)
await new Promise((r) => setTimeout(r, 900))
const floorRect = await page.evaluate(() => {
  const { scene, camera } = window.__three
  const rc = new window.__three.raycaster.constructor()
  const n = new camera.position.constructor()
  const solid = (o) => o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
  const G = 48
  const grid = []
  for (let j = 0; j < G; j++) {
    grid[j] = []
    for (let i = 0; i < G; i++) {
      const x = (i + 0.5) / G
      const y = (j + 0.5) / G
      rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
      const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
      let ok = false
      if (h?.face) {
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        ok = Math.abs(n.y) > 0.9 && h.point.y < 0.15
      }
      grid[j][i] = ok
    }
  }
  // Largest all-floor square, by simple expansion from each cell.
  let best = null
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      if (!grid[j][i]) continue
      let k = 0
      outer: while (j + k < G && i + k < G) {
        for (let a = 0; a <= k; a++) if (!grid[j + k][i + a] || !grid[j + a][i + k]) break outer
        k++
      }
      if (k > 0 && (!best || k > best.k)) best = { i, j, k }
    }
  if (!best) return null
  // World extent of the chosen square, so its pixels-per-metre can be compared
  // with the reference crops -- micro-contrast is resolution dependent, and a
  // near-camera floor patch is magnified far beyond a photograph's.
  const corner = (i, j) => {
    const x = (i + 0.5) / G
    const y = (j + 0.5) / G
    rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
    const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
    return h ? [h.point.x, h.point.z] : null
  }
  const a = corner(best.i, best.j)
  const b = corner(best.i + best.k - 1, best.j)
  const c = corner(best.i, best.j + best.k - 1)
  const wideM = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : null
  const deepM = a && c ? Math.hypot(c[0] - a[0], c[1] - a[1]) : null
  return {
    x0: best.i / G,
    y0: best.j / G,
    x1: (best.i + best.k) / G,
    y1: (best.j + best.k) / G,
    wideM,
    deepM,
  }
})
if (floorRect) {
  const shotFloor = await canvas.screenshot({ type: 'png' })
  const fg = await grey(shotFloor)
  const fx0 = Math.floor(floorRect.x0 * fg.info.width)
  const fy0 = Math.floor(floorRect.y0 * fg.info.height)
  const fw = Math.max(8, Math.floor((floorRect.x1 - floorRect.x0) * fg.info.width))
  const fh = Math.max(8, Math.floor((floorRect.y1 - floorRect.y0) * fg.info.height))
  const sub = Buffer.alloc(fw * fh)
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) sub[y * fw + x] = fg.data[(fy0 + y) * fg.info.width + (fx0 + x)]
  const bl = await sharp(sub, { raw: { width: fw, height: fh, channels: 1 } })
    .blur(4)
    .raw()
    .toBuffer()
  let m2 = 0
  for (let i = 0; i < sub.length; i++) m2 += sub[i]
  m2 /= sub.length
  let hp2 = 0
  for (let i = 0; i < sub.length; i++) hp2 += (sub[i] - bl[i]) ** 2
  const sd2 = Math.sqrt(hp2 / sub.length)
  const pxPerM = fw / (floorRect.wideM || 1)
  // ...and again at the REFERENCE crops' density (~300 px/m). micro-contrast is
  // resolution dependent -- a fixed 4 px high-pass reaches ~7 mm of floor at 589
  // px/m and ~13 mm at 300 -- so an unmatched comparison measures the sampling.
  const REF_PX_PER_M = 300
  const scale = Math.min(1, REF_PX_PER_M / pxPerM)
  const sw = Math.max(8, Math.round(fw * scale))
  const sh = Math.max(8, Math.round(fh * scale))
  const small = await sharp(sub, { raw: { width: fw, height: fh, channels: 1 } })
    .resize(sw, sh)
    .raw()
    .toBuffer()
  const smallBlur = await sharp(small, { raw: { width: sw, height: sh, channels: 1 } })
    .blur(4)
    .raw()
    .toBuffer()
  let m3 = 0
  for (let i = 0; i < small.length; i++) m3 += small[i]
  m3 /= small.length
  let hp3 = 0
  for (let i = 0; i < small.length; i++) hp3 += (small[i] - smallBlur[i]) ** 2
  const sd3 = Math.sqrt(hp3 / small.length)
  console.log(
    `floor micro-contrast (CERTIFIED pure floor ${fw}x${fh}px = ${floorRect.wideM?.toFixed(2)}x${floorRect.deepM?.toFixed(2)} m, ${pxPerM.toFixed(0)} px/m)`,
  )
  console.log(`  at native density   micro/mean ${(sd2 / m2).toFixed(4)}`)
  console.log(
    `  at ~${REF_PX_PER_M} px/m (reference scale)  micro/mean ${(sd3 / m3).toFixed(4)}   <- compare THIS to real floors 0.032-0.076`,
  )
} else {
  console.log('floor micro-contrast: no all-floor rectangle found at this pose')
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
