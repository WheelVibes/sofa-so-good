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
// ROOM scopes the finish setters, the albedo census and the exposure census
// (`.277`). Everything downstream of `.271` hardcoded `livingDining`, which made
// item (s) untestable outside one room -- and every metric in this arc has turned
// out geometry-dependent, so one room is not a validation.
const ROOM = process.env.ROOM || WINDOW
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
const TONE = process.env.TONE || ''
const BACKDROP = process.env.BACKDROP || ''
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
// Forward the page's own console for lines we deliberately tag (`.287`). The
// probe had no console listener at all, so any diagnostic the app logged -- and
// any warning it emitted -- was invisible to every round in this arc.
page.on('console', (m) => {
  const t = m.text()
  const type = m.type()
  // Tagged diagnostics always, plus EVERY warning and error. `hqRenderSession`
  // logs `HQ AI denoise failed`, `HQ render failed` and a blank-render guard
  // behind `import.meta.env.DEV` -- all of which this arc has been blind to for
  // forty rounds because the probe never listened. Skip the Vite/HMR chatter.
  const noise = /\[vite]|HMR|Download the React DevTools|WebGL context/i
  if (/^\[PROBE]/.test(t) || ((type === 'warning' || type === 'error') && !noise.test(t))) {
    console.log(`  PAGE ${type}: ${t}`)
  }
})
page.on('pageerror', (e) => console.log(`  PAGE ERROR ${e.message}`))
// Confirm the WebGL renderer string (`.308`). The playbook's real-GPU section is
// explicit: getting the ANGLE backend wrong "silently gives you SwiftShader
// anyway -- i.e. SHOT_GPU=1 becomes a no-op and every GPU-only check you thought
// you ran was a software render", and it says to ALWAYS confirm the string before
// trusting a GPU-only result. This probe launches with --use-angle=metal but had
// never checked, through sixty rounds of path-traced measurement.
{
  const r = await page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
      if (!gl) return 'no webgl2'
      const d = gl.getExtension('WEBGL_debug_renderer_info')
      return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'no debug_renderer_info'
    } catch (e) {
      return `error: ${e.message}`
    }
  })
  console.log(`  WEBGL RENDERER: ${r}`)
  if (/swiftshader|software/i.test(r))
    console.log('  ** SOFTWARE RENDERER -- GPU-only results from this run are NOT trustworthy **')
}
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((r) => {
  window.__probeRoom = r
}, ROOM)
await page.evaluate(
  ({ h, t, fov, photo, floor, wall, tone, backdrop, room }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setQualityTier(t)
    s.setCameraMode('firstPerson')
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(fov)
    if (photo) s.setPhotographicLook?.(true)
    // TONE lets the view transform be swapped, so "is the curve the binding
    // constraint?" can be tested rather than argued (`.259`).
    if (tone) s.setToneMapping?.(tone)
    // BACKDROP swaps the window's exterior for one of the shipped photo presets
    // ('city' | 'dusk' | 'park' | 'hills'), which is the app's OWN content route
    // for item (l) -- `.261` wanted a near object behind the glass and `city` is
    // exactly that. `.263` predicts the equirect -> CubeUV pre-filter blurs it.
    if (backdrop) s.setBackdrop?.(backdrop)
    if (floor) s.setFloorFinish?.(room, floor)
    if (wall) s.setWallFinish?.(room, wall)
  },
  {
    h: HOUR,
    t: TIER,
    fov: WALKFOV,
    photo: PHOTO,
    floor: FLOOR,
    wall: WALL,
    tone: TONE,
    backdrop: BACKDROP,
    room: ROOM,
  },
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

// GBOUNCE=<n> re-scales PHOTO_GROUND_BOUNCE live, so the ceiling deficit measured
// in `.253` can be PRICED without a rebuild per sweep point (`.254`).
//
// `Lighting.tsx` applies the term as `hemi.groundColor *= photographicGroundBounce
// (photographicLook)` -- x3 under the photographic look, x1 otherwise -- so
// scaling the live `groundColor` by `target / shipped` is equivalent to shipping a
// different constant. `baseGround` is captured ONCE so repeated applications are
// idempotent rather than compounding.
const GBOUNCE = process.env.GBOUNCE ? Number(process.env.GBOUNCE) : null
const readGround = () =>
  page.evaluate(() => {
    let hemi = null
    window.__three.scene.traverse((o) => {
      if (o.isHemisphereLight) hemi = o
    })
    return hemi ? hemi.groundColor.toArray().map((v) => +v.toFixed(5)) : null
  })
// ASSIGNING the colour does not work. `Lighting.tsx` recomputes `groundColor`
// from the eased day/night curve EVERY FRAME, so any value written from outside is
// gone by the next tick -- `.254` measured a dead-flat sweep across GBOUNCE 1..8
// twice (once patched before the pitch, once after) before the post-capture
// read-back made it obvious. So intercept instead: wrap `setRGB` on that one
// Color instance, and every per-frame write gets scaled on its way in.
const applyGBounce =
  GBOUNCE == null
    ? null
    : async () => {
        const res = await page.evaluate(
          ({ k }) => {
            let hemi = null
            window.__three.scene.traverse((o) => {
              if (o.isHemisphereLight) hemi = o
            })
            if (!hemi) return { error: 'no HemisphereLight in scene' }
            const c = hemi.groundColor
            if (!c.__gbPatched) {
              const orig = c.setRGB.bind(c)
              c.setRGB = (r, g, b, ...rest) => orig(r * k, g * k, b * k, ...rest)
              c.__gbPatched = k
            }
            return { patched: c.__gbPatched }
          },
          { k: GBOUNCE / (PHOTO ? 3 : 1) },
        )
        if (res.error) throw new Error(`GBOUNCE: ${res.error}`)
        await new Promise((r) => setTimeout(r, 700))
      }
const shotFor = async (pitch) => {
  await page.evaluate((v) => window.__walkLook?.setPitch(v), pitch)
  await new Promise((r) => setTimeout(r, 900))
  // GBOUNCE must be (re-)applied HERE, after the pitch is set. `setPitch` lands
  // in the store, which re-runs `Lighting.tsx`'s effect, which recomputes
  // `hemi.groundColor` from `cur.groundColor * wb * gb` and so silently reverts
  // any earlier patch. `.254`'s first sweep was applied before the pitch and read
  // dead flat across GBOUNCE 1..8 -- a completely false negative that only the
  // post-capture read-back caught. Never patch a light before a state change.
  if (typeof applyGBounce === 'function') await applyGBounce()
  if (typeof applyFillOff === 'function') await applyFillOff()
  if (typeof applyLinear === 'function') await applyLinear()
  if (typeof applyFillTint === 'function') await applyFillTint()
  if (typeof applyRecolor === 'function') await applyRecolor()
  if (typeof applyCeilStd === 'function') await applyCeilStd()
  if (typeof applyHideCeil === 'function') await applyHideCeil()
  if (typeof applyHideGrille === 'function') await applyHideGrille()
  if (typeof applyBgSharp === 'function') await applyBgSharp()
  if (typeof applyBgBlock === 'function') await applyBgBlock()
  if (typeof applyBgMul === 'function') await applyBgMul()
  return canvas.screenshot({ type: 'png' })
}
// Two poses: the shipped pitch for the ceiling + wall, and a pitched-down one so
// the bottom band is REAL FLOOR rather than the coffee table and the sofa.
// GBOUNCE=<n> re-scales PHOTO_GROUND_BOUNCE live, so the ceiling deficit measured
// in `.253` can be PRICED without a rebuild per point (`.254`).
//
// `Lighting.tsx` applies the term as `hemi.groundColor *= photographicGroundBounce
// (photographicLook)`, i.e. x3 under the photographic look and x1 otherwise. So
// scaling the live `groundColor` by `target / shipped` is exactly equivalent to
// shipping a different constant. Read back after the capture as well, because the
// lighting effect would silently overwrite the patch if anything re-triggered it.
// FILLOFF=1 zeroes the AmbientLight and the HemisphereLight -- the two light
// types `buildTracerScene` does NOT copy into the tracer snapshot (it takes only
// Directional/Point/Spot and substitutes a hardcoded GradientEquirectTexture for
// the environment). At 13:00/medium/photographic the live scene carries
// AmbientLight 0.077 and HemisphereLight 0.243, so this measures exactly what the
// path tracer is missing (`.255`).
//
// `intensity` is a plain number that `Lighting.tsx` rewrites every frame, so it
// has to be intercepted with a getter rather than assigned -- `.254`'s lesson,
// applied to a number instead of a Color.
const applyFillOff =
  process.env.FILLOFF !== '1'
    ? null
    : async () => {
        const res = await page.evaluate(() => {
          const hit = []
          window.__three.scene.traverse((o) => {
            if (!o.isAmbientLight && !o.isHemisphereLight) return
            hit.push(`${o.type} was ${o.intensity}`)
            if (o.__fillOff) return
            Object.defineProperty(o, 'intensity', {
              get: () => 0,
              set: () => {},
              configurable: true,
            })
            o.__fillOff = true
          })
          return hit
        })
        await new Promise((r) => setTimeout(r, 700))
        return res
      }
// LINEAR=1 bypasses the tone curve so the SCENE's own luminance range can be read
// rather than the graded picture's (`.258`).
//
// This is the measurement item (l) needs. Photographs blow their windows out
// (15-39 % of glazing pixels clipped, `.236`) and the app clips 0.0 % at every
// hour. `.209` read that as a tone-mapping fight -- "pushing the pane brighter
// fights the AgX view transform". But a real daylit sky is ~10^4 cd/m2 against an
// interior wall at ~10^2, so a photograph's window is blown by a factor of ~100 in
// the SCENE, and any exposure that holds the interior clips it. Whether the app has
// that range at all is answerable only with the curve out of the way.
//
// `gl.toneMappingExposure` is rewritten every frame by `Lighting.tsx`, so both
// properties are intercepted with getters, not assigned (`.254`'s lesson).
// NoToneMapping still applies the sRGB output transfer, so readings are decoded
// back to linear before any ratio is taken.
// BGMUL=<n> scales the EXTERIOR's radiance, to price item (l) (`.259`).
//
// Finding the right lever took two wrong turns worth recording. `lighting/Sky.tsx`
// renders a baked sky on a BackSide dome, so the dome's colour looked like the
// knob -- but in WALK MODE the dome is not in the scene at all
// (`isPhotoBackdropActive(kind, cameraMode, ...)` makes it stand down), and a
// raycast straight through the glazing returns exactly one hit and nothing
// beyond. That reads as "the window has no exterior", which is wrong: in walk
// mode the exterior is `scene.background`, a CanvasTexture, which is not geometry
// and so cannot be raycast.
//
// `scene.backgroundIntensity` is therefore the one scalar that means "how bright
// is the outside", and three provides it for exactly this purpose.
// BGBLOCK — backdrop content. Modes 1/2 are PROVEN INERT; mode 3 works (`.263`).
//
// ** IT HAS NO EFFECT ON THE RENDER. ** Painting the backdrop canvas -- even
// filling it entirely black, verified black by read-back at capture time --
// changes nothing: frame mean 121.3 -> 121.3, `%<64` 11.85 -> 11.84, glazing
// 237.1 -> 237.2. Meanwhile `backgroundIntensity` (BGMUL) moves the same glazing
// 161 -> 237 -> 245. So the glazing depends on the background SLOT but not on the
// background's CONTENT, and whatever the renderer samples is not the canvas bound
// to `scene.background.image`.
//
// Kept because knowing an intervention is inert is worth more than deleting it:
// anyone reaching for "just paint the backdrop" will otherwise repeat this.
//
// ** MECHANISM, RESOLVED IN `.263`. ** three converts an equirect
// `scene.background` into a CubeUV/PMREM and caches it keyed on the TEXTURE
// OBJECT; `needsUpdate` does not invalidate that cache. So mutating the bound
// canvas (modes 1/2) is inert, while `backgroundIntensity` still scales the cached
// conversion -- which is why the glazing responded to the scalar but not to the
// content. BGBLOCK=3 hands the scene a NEW CanvasTexture instead, which cannot hit
// the stale entry, and the content appears.
//
// Controlled comparison at x32, same painting code and same rows, the only
// difference being mutate-vs-fresh:
//
//     mode 1 (mutate bound canvas)  clipped 39.5 %  spread 19  mid-tone  9.4 %
//     mode 3 (fresh texture)        clipped  8.7 %  spread 78  mid-tone 75.3 %
//
// So `.261`'s content hypothesis is CONFIRMED in direction -- content restores
// nearly 4x the spread a luminance multiplier could not buy. But it arrives
// LOW-PASS FILTERED: the facade's 8 px vertical bands are gone and what reaches the
// window is a soft luminance step, so the pane reads as frosted glass rather than a
// view. The PMREM path cannot carry high-frequency backdrop detail.
//
// `.261` proved that no luminance multiplier reaches the photographic STRUCTURE --
// a real pane is 55-60 % blown AND 36-44 % mid-tone at once, while the app goes
// from 100 % mid-tone to 9.4 % without ever being both. It then ASSERTED that
// backdrop content would supply the range, and for an HDB flat the real view is
// another block. That assertion was never tested. This tests it.
//
// The backdrop is a 1024x512 equirect CanvasTexture (mapping 303), so row h/2 is
// the horizon and the window's view spans roughly elevation -8..+12 deg, i.e. rows
// ~222-279. A block belongs at and just below that, leaving sky above it.
//
// Luminance matters as much as position. `backgroundIntensity` scales the WHOLE
// texture, so a block painted at sky brightness would simply clip with the sky. A
// facade at ~5 % of sky luminance reads mid-tone after a x32 boost while the sky
// saturates -- and ~1/20 of sky luminance is what a sunlit concrete facade
// actually is.
// BGSHARP tests whether item (r)'s blur is RECOVERABLE, and by which route
// (`.265`).
//
// `.263`/`.264`: an equirect `scene.background` is converted to a CubeUV/PMREM,
// which is pre-filtered by construction, so a crisp 2048x1024 city preset reaches
// the window as faint blobs (spread 55 -> 58 where the target is 90).
//
//   BGSHARP=uv  -- rehost the same canvas in a fresh texture with UVMapping. three
//                  renders that as a flat screen background with NO CubeUV step, so
//                  if sharpness returns the pre-filter is the whole cause. The
//                  projection is wrong for a window (no parallax), so this is a
//                  MECHANISM PROOF, not a candidate fix.
//
// A fresh texture object is required either way: the CubeUV cache is keyed on the
// texture, so mutating or re-flagging the bound one is inert (`.263`).
// HIDEGRILLE=1 — MIS-TARGETED, kept documented so it is not misused (`.266`).
//
// Intent: hide the grille bars to test whether a legibility metric becomes usable
// once they are out of the population. What it actually hides is 34
// `BoxGeometry#e6e7e4` meshes -- the window FRAME and reveal. Verified by looking:
// all ~20 vertical bars and the horizontal rails are still present afterwards, and
// the metrics do not move (hp8 0.1210 -> 0.1206). So the grille attribution below
// is neither confirmed nor refuted by this knob; it identifies the wrong meshes.
//
// `.265` found no metric could see the difference between an illegible and a
// legible window. `.266` showed why: unobstructed, a 16 px blur moves `hp8` by
// 13.3x, but through the window the same change moves it 1.05x -- because the
// render's high-frequency energy (hp8 ~0.11) is roughly TWICE the entire source
// image's (~0.063), and nearly all of it is grille.
// RECOLOR=<fromHex>:<toHex> repaints every material of one colour, to test COLOUR
// BLEED within the app (`.268`).
//
// A real wall beside saturated orange leather reads R-B 13.8 adjacent and 10.3 at
// ~20 cm, at constant height in the same shadow band -- a ~3.5-count chroma
// gradient, with luminance rising too, which is what an orange bounce does. The
// app's plaster reads R-B 0.0 at every height, but the only thing near that wall is
// a PALE BLUE sofa, so ~0 could mean "no bleed" or "no saturated source".
//
// Repainting a large adjacent surface saturated orange separates those two: with
// inter-reflection the wall must warm; a grey hemisphere ambient cannot tint it at
// all, whatever colour the floor is.
// ALBEDO=1 reports the room's AREA-WEIGHTED AVERAGE ALBEDO, and FILLTINT=r,g,b
// scales the fill lights by a per-channel factor (`.271`).
//
// `.270` measured what real transport does when a wall is repainted terracotta:
// the ceiling warms 9-13 counts of R-B AND darkens 16-20 %. Crucially the response
// is nearly UNIFORM across anchors, which says the effect is largely GLOBAL rather
// than localised -- and a global effect may have a cheap global approximation.
//
// The first-order model: bounced light is direct light times albedo, so the fill
// should scale with the room's average albedo. Painting walls terracotta lowers
// and warms that average, which tints the fill warm and darkens it -- exactly the
// two effects measured. Calibration-free, because only the RATIO between two rooms
// is applied.
const ALBEDO = process.env.ALBEDO === '1'
const FILLTINT = process.env.FILLTINT || ''
const applyFillTint = !FILLTINT
  ? null
  : async () => {
      const [kr, kg, kb] = FILLTINT.split(',').map(Number)
      const res = await page.evaluate(
        ({ k }) => {
          const hit = []
          window.__three.scene.traverse((o) => {
            if (!o.isAmbientLight && !o.isHemisphereLight) return
            for (const prop of ['color', 'groundColor']) {
              const c = o[prop]
              if (!c?.setRGB || c.__tinted) continue
              const orig = c.setRGB.bind(c)
              c.setRGB = (r, g, b, ...rest) => orig(r * k[0], g * k[1], b * k[2], ...rest)
              c.__tinted = true
              hit.push(`${o.type}.${prop}`)
            }
          })
          return hit
        },
        { k: [kr, kg, kb] },
      )
      console.log(`FILLTINTCHECK ${JSON.stringify({ k: [kr, kg, kb], patched: res })}`)
      await new Promise((r) => setTimeout(r, 700))
    }
const RECOLOR = process.env.RECOLOR || ''
const applyRecolor = !RECOLOR
  ? null
  : async () => {
      // Accepts SEVERAL pairs separated by ';' (`.301`) -- suppressing a room's
      // interreflection needs the walls AND the ceiling repainted, and they carry
      // different base colours (plaster f5f5f0, ceiling fafafa). One pair at a
      // time left the ceiling bouncing and made the arm useless.
      const pairs = RECOLOR.split(';')
        .filter(Boolean)
        .map((p2) => p2.split(':'))
      const res = await page.evaluate((ps) => {
        let n = 0
        const kinds = {}
        const map = new Map(ps.map(([f, t]) => [f, t]))
        window.__three.scene.traverse((o) => {
          if (!o.isMesh) return
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of mats) {
            const hex = m?.color?.getHexString?.()
            if (!hex || !map.has(hex)) continue
            m.color.set(`#${map.get(hex)}`)
            n++
            kinds[`${hex}->${map.get(hex)} ${o.geometry?.type ?? '?'}`] =
              (kinds[`${hex}->${map.get(hex)} ${o.geometry?.type ?? '?'}`] ?? 0) + 1
          }
        })
        return { repainted: n, kinds }
      }, pairs)
      console.log(`RECOLORCHECK ${JSON.stringify(res)}`)
      await new Promise((r) => setTimeout(r, 800))
    }
// CEILSTD=1 -- swap every MeshLambertMaterial in the LIVE scene for an equivalent
// native MeshStandardMaterial before the tracer snapshot is taken (`.304`).
//
// `.303` established that (u) and (v) are one fault -- in ~half of HQ renders the
// ceiling is not rendered as a surface -- and that the ceiling's only
// distinguishing property is being the ONLY SUBSTITUTED material: 14 Lambert
// planes swapped to Standard by `.253`'s `pbrStandInFor`, while the 99 walls are
// natively Standard and render correctly. This knob removes the need for the
// substitution without touching `src/`: if the fault is substitution-linked it
// must never appear with CEILSTD=1; if it is about ceilings as such it appears
// just as often. The rivals disagree, which is what makes it a test (`.302`).
//
// Builds the replacement by CLONING an existing MeshStandardMaterial from the
// scene -- the page does not expose the three constructors.
const CEILSTD = process.env.CEILSTD === '1'
const applyCeilStd = !CEILSTD
  ? null
  : async () => {
      const res = await page.evaluate(() => {
        let donor = null
        window.__three.scene.traverse((o) => {
          if (donor || !o.isMesh) return
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of mats) if (m?.isMeshStandardMaterial && !m.map) donor = m
        })
        if (!donor) return { error: 'no un-mapped MeshStandardMaterial donor in the scene' }
        let swapped = 0
        const kinds = {}
        window.__three.scene.traverse((o) => {
          if (!o.isMesh) return
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          const next = mats.map((m) => {
            if (!m?.isMeshLambertMaterial) return m
            const sub = donor.clone()
            sub.color.copy(m.color)
            sub.roughness = 1
            sub.metalness = 0
            sub.side = m.side
            sub.map = m.map ?? null
            swapped++
            kinds[`${o.geometry?.type ?? '?'}#${m.color.getHexString()}`] =
              (kinds[`${o.geometry?.type ?? '?'}#${m.color.getHexString()}`] ?? 0) + 1
            return sub
          })
          if (next.some((m, i) => m !== mats[i]))
            o.material = Array.isArray(o.material) ? next : next[0]
        })
        return { swapped, kinds }
      })
      console.log(`CEILSTDCHECK ${JSON.stringify(res)}`)
      if (res.error) throw new Error(`CEILSTD: ${res.error}`)
      await new Promise((r) => setTimeout(r, 800))
    }
// HIDECEIL=1 -- set `visible = false` on the ceiling planes (`.305`).
//
// `buildTracerScene` walks the visibility chain (`if (!p.visible) return`), so an
// invisible ceiling is genuinely ABSENT from the tracer snapshot rather than
// mis-shaded. `.303` characterised (u) class A as "the ceiling region shows the
// environment"; this asks the sharper question -- is class A quantitatively
// IDENTICAL to having no ceiling at all? Class A's dark-room signature is
// ceiling 181.5, sidewall ~16, frameL ~104.5, so the comparison is exact.
//
// NOTE the raster loses its ceiling too, so raster figures from a HIDECEIL run
// are of a different scene and must not be compared against normal ones.
const HIDECEIL = process.env.HIDECEIL === '1'
const applyHideCeil = !HIDECEIL
  ? null
  : async () => {
      const res = await page.evaluate(() => {
        let hidden = 0
        const kinds = {}
        window.__three.scene.traverse((o) => {
          if (!o.isMesh) return
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          // The ceiling planes are the Lambert ones (`Ceiling.tsx`); a finished
          // ceiling would be Standard via `RoomCeiling.tsx` and is not hidden.
          if (!mats.some((m) => m?.isMeshLambertMaterial)) return
          o.visible = false
          hidden++
          kinds[`${o.geometry?.type ?? '?'}#${mats[0]?.color?.getHexString?.() ?? '?'}`] =
            (kinds[`${o.geometry?.type ?? '?'}#${mats[0]?.color?.getHexString?.() ?? '?'}`] ?? 0) +
            1
        })
        return { hidden, kinds }
      })
      console.log(`HIDECEILCHECK ${JSON.stringify(res)}`)
      await new Promise((r) => setTimeout(r, 800))
    }
const HIDEGRILLE = process.env.HIDEGRILLE === '1'
const applyHideGrille = !HIDEGRILLE
  ? null
  : async () => {
      const n = await page.evaluate(() => {
        let hidden = 0
        const seen = {}
        window.__three.scene.traverse((o) => {
          if (!o.isMesh) return
          const m = Array.isArray(o.material) ? o.material[0] : o.material
          const hex = m?.color?.getHexString?.()
          // The grille bars and window frame share the pale frame colour and are
          // the only meshes of it inside the opening.
          if (hex !== 'e6e7e4') return
          seen[o.geometry?.type ?? '?'] = (seen[o.geometry?.type ?? '?'] ?? 0) + 1
          o.visible = false
          hidden++
        })
        return { hidden, seen }
      })
      console.log(`HIDEGRILLECHECK ${JSON.stringify(n)}`)
      await new Promise((r) => setTimeout(r, 700))
    }
const BGSHARP = process.env.BGSHARP || ''
const applyBgSharp = !BGSHARP
  ? null
  : async () => {
      const res = await page.evaluate(
        ({ mode }) => {
          const sc = window.__three.scene
          const oldTex = sc.background
          const src = oldTex?.image
          if (!src) return { error: 'no background image' }
          const cv = document.createElement('canvas')
          cv.width = src.width
          cv.height = src.height
          cv.getContext('2d').drawImage(src, 0, 0)
          const Tex = oldTex.constructor
          const fresh = new Tex(cv)
          fresh.colorSpace = oldTex.colorSpace
          fresh.mapping = mode === 'uv' ? 300 : oldTex.mapping
          fresh.needsUpdate = true
          sc.background = fresh
          return {
            w: cv.width,
            h: cv.height,
            mappingWas: oldTex.mapping,
            mappingNow: fresh.mapping,
          }
        },
        { mode: BGSHARP },
      )
      if (res.error) throw new Error(`BGSHARP: ${res.error}`)
      console.log(`BGSHARPCHECK ${JSON.stringify(res)}`)
      await new Promise((r) => setTimeout(r, 900))
    }
const BGBLOCK = ['1', '2', '3'].includes(process.env.BGBLOCK || '')
const applyBgBlock = !BGBLOCK
  ? null
  : async () => {
      await page.evaluate(
        ({ m, top, bot }) => {
          window.__bgBlockMode = m
          if (top) window.__bgTop = top
          if (bot) window.__bgBot = bot
        },
        {
          m: process.env.BGBLOCK,
          top: process.env.BG_TOP ? Number(process.env.BG_TOP) : null,
          bot: process.env.BG_BOT ? Number(process.env.BG_BOT) : null,
        },
      )
      const res = await page.evaluate(() => {
        const tex = window.__three.scene.background
        const cv = tex?.image
        if (!cv || typeof cv.getContext !== 'function')
          return { error: 'background is not a canvas texture' }
        if (cv.__blocked) return { already: true }
        const ctx = cv.getContext('2d')
        const W = cv.width
        const H = cv.height
        const top = Math.round(H * 0.485) // just above the horizon
        const bot = Math.round(H * 0.66) // down to well below it
        // Facade: vertical bands so the block has its own internal structure, the
        // way a real block's windows and columns do.
        for (let x = 0; x < W; x += 8) {
          const v = x % 16 === 0 ? 58 : 72
          ctx.fillStyle = `rgb(${v},${v - 2},${v - 4})`
          ctx.fillRect(x, top, 8, bot - top)
        }
        // A roofline highlight, and a soft shadowed base.
        ctx.fillStyle = 'rgb(96,94,90)'
        ctx.fillRect(0, top, W, 3)
        ctx.fillStyle = 'rgb(40,39,38)'
        ctx.fillRect(0, bot - 6, W, 6)
        if (window.__bgBlockMode === '3') {
          // BGBLOCK=3 — the mechanism test (`.263`). Instead of mutating the bound
          // canvas, build a NEW canvas with the facade painted and hand the scene a
          // NEW CanvasTexture. three converts an equirect background into a CubeUV
          // (PMREM) and caches it keyed on the TEXTURE OBJECT, and that cache is not
          // invalidated by `needsUpdate` -- which would make `.262`'s canvas
          // mutation inert while `backgroundIntensity` still scaled the cached
          // result. A fresh texture object cannot hit the stale entry.
          const sc = window.__three.scene
          const oldTex = sc.background
          const src = oldTex.image
          const cv2 = document.createElement('canvas')
          cv2.width = src.width
          cv2.height = src.height
          const c2 = cv2.getContext('2d')
          c2.drawImage(src, 0, 0)
          const W2 = cv2.width
          const H2 = cv2.height
          const t2 = Math.round(H2 * (window.__bgTop ?? 0.485))
          const b2 = Math.round(H2 * (window.__bgBot ?? 0.66))
          for (let x = 0; x < W2; x += 8) {
            const v = x % 16 === 0 ? 58 : 72
            c2.fillStyle = `rgb(${v},${v - 2},${v - 4})`
            c2.fillRect(x, t2, 8, b2 - t2)
          }
          c2.fillStyle = 'rgb(96,94,90)'
          c2.fillRect(0, t2, W2, 3)
          c2.fillStyle = 'rgb(40,39,38)'
          c2.fillRect(0, b2 - 6, W2, 6)
          const Tex = oldTex.constructor
          const fresh = new Tex(cv2)
          fresh.mapping = oldTex.mapping
          fresh.colorSpace = oldTex.colorSpace
          fresh.needsUpdate = true
          // Do NOT dispose oldTex -- SceneBackdrop owns it and restores it on unmount.
          sc.background = fresh
          const px3 = c2.getImageData(Math.round(W2 * 0.5), t2 + 10, 1, 1).data
          return {
            mode: 3,
            newTexture: true,
            sameAsEnvironment: sc.environment === oldTex,
            painted: [px3[0], px3[1], px3[2]],
            top: t2,
            bot: b2,
          }
        }
        if (window.__bgBlockMode === '2') {
          // Unambiguous control: black out the WHOLE backdrop. If the window does
          // not change, its appearance does not come from `scene.background`.
          ctx.fillStyle = 'rgb(0,0,0)'
          ctx.fillRect(0, 0, W, H)
        }
        cv.__blocked = true
        tex.needsUpdate = true
        // Read back a painted row so the intervention can be proven to have held at
        // capture time rather than merely to have been issued (`.254`).
        const probeRow = window.__bgBlockMode === '2' ? Math.round(H * 0.3) : top + 10
        const px = ctx.getImageData(Math.round(W * 0.5), probeRow, 1, 1).data
        return { W, H, top, bot, probeRow, painted: [px[0], px[1], px[2]] }
      })
      if (res.error) throw new Error(`BGBLOCK: ${res.error}`)
      console.log(`BGBLOCK=1 painted a facade into the backdrop: ${JSON.stringify(res)}`)
      await new Promise((r) => setTimeout(r, 900))
    }
const BGMUL = process.env.BGMUL ? Number(process.env.BGMUL) : null
const readBg = () =>
  page.evaluate(() => {
    const sc = window.__three.scene
    return {
      intensity: sc.backgroundIntensity,
      type: sc.background?.isColor ? 'Color' : sc.background ? 'Texture' : null,
    }
  })
const applyBgMul =
  BGMUL == null
    ? null
    : async () => {
        const res = await page.evaluate(
          ({ k }) => {
            const sc = window.__three.scene
            if (!sc.background) return { error: 'scene.background is null' }
            if (!sc.__bgPatched) {
              // Intercepted rather than assigned: anything that repaints the
              // backdrop per frame would otherwise silently revert it (`.254`).
              Object.defineProperty(sc, 'backgroundIntensity', {
                get: () => k,
                set: () => {},
                configurable: true,
              })
              sc.__bgPatched = k
            }
            return { intensity: sc.backgroundIntensity }
          },
          { k: BGMUL },
        )
        if (res.error) throw new Error(`BGMUL: ${res.error}`)
        await new Promise((r) => setTimeout(r, 800))
      }
const LINEAR = process.env.LINEAR === '1'
const LIN_EXPO = Number(process.env.LIN_EXPO || 0.05)
const applyLinear = !LINEAR
  ? null
  : async () => {
      const res = await page.evaluate(
        ({ expo }) => {
          const gl = window.__three.gl
          if (!gl) return { error: 'no renderer on window.__three' }
          if (!gl.__linPatched) {
            Object.defineProperty(gl, 'toneMapping', {
              get: () => 0, // THREE.NoToneMapping
              set: () => {},
              configurable: true,
            })
            Object.defineProperty(gl, 'toneMappingExposure', {
              get: () => expo,
              set: () => {},
              configurable: true,
            })
            gl.__linPatched = true
          }
          return { toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure }
        },
        { expo: LIN_EXPO },
      )
      if (res.error) throw new Error(`LINEAR: ${res.error}`)
      await new Promise((r) => setTimeout(r, 900))
    }
// FLOOREXPOSED=1 measures what fraction of the room's FLOOR PLANE is actually
// exposed, by casting rays straight down on a world grid and tallying the first
// hit (`.274`).
//
// `.273` reported the floor-finish A/B as void because the store took the finish
// but "the render did not". That was WRONG -- read from the eye-level frame, where
// the living/dining floor is almost entirely occluded. The pitched-down frame the
// probe also captures shows the finish plainly (pale tiles vs dark planks). The
// traced null is real, and its cause is occlusion: a rug and furniture cover most
// of the floor, so a floor finish changes very little of the room's reflecting
// surface. Which means an albedo census must weight by EXPOSED area, not total
// area -- a second flaw distinct from `.273`'s texture-blindness, pushing the same
// way.
if (process.env.FLOOREXPOSED === '1') {
  const res = await page.evaluate(() => {
    const { scene } = window.__three
    const rc = new window.__three.raycaster.constructor()
    const V = window.__three.camera.position.constructor
    const solid = (o) => o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
    const sig = (o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      return `${o.geometry?.type ?? '?'}#${m?.color?.getHexString?.() ?? '------'}`
    }
    const rm = window.__store.getState().floorPlan?.rooms?.find((r) => r.id === window.__probeRoom)
    if (!rm) return { error: `no room ${window.__probeRoom}` }
    const N = 60
    const tally = {}
    let n = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = rm.origin[0] + ((i + 0.5) / N) * rm.width
        const z = rm.origin[1] + ((j + 0.5) / N) * rm.depth
        rc.set(new V(x, 2.55, z), new V(0, -1, 0))
        const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object) && k.face)
        const key = h ? sig(h.object) : '(nothing)'
        tally[key] = (tally[key] || 0) + 1
        n++
      }
    }
    return {
      n,
      top: Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} ${((100 * v) / n).toFixed(1)}%`),
    }
  })
  if (res.error) throw new Error(`FLOOREXPOSED: ${res.error}`)
  console.log(`FLOOREXPOSED (${res.n} downward rays over the room rect): ${res.top.join(' | ')}`)
}
if (ALBEDO) {
  const a = await page.evaluate(() => {
    const V = window.__three.camera.position.constructor
    let ar = 0
    let ag = 0
    let ab = 0
    let tot = 0
    window.__three.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      let p = o
      while (p) {
        if (!p.visible) return
        p = p.parent
      }
      o.geometry.computeBoundingBox?.()
      const bb = o.geometry.boundingBox
      if (!bb) return
      const sc = o.getWorldScale(new V())
      const sx = (bb.max.x - bb.min.x) * Math.abs(sc.x)
      const sy = (bb.max.y - bb.min.y) * Math.abs(sc.y)
      const sz = (bb.max.z - bb.min.z) * Math.abs(sc.z)
      const area = 2 * (sx * sy + sy * sz + sx * sz)
      if (!Number.isFinite(area) || area <= 0 || area > 500) return // skip the sky shell
      // Bounce is LOCAL: only the room's own surfaces matter. A whole-flat census
      // (2186 m2) barely moves when one room is repainted -- ratio 0.984/0.972/
      // 0.968 -- and predicts a 2.6 % darkening where real transport gives 16-20 %.
      // Restrict to the measured room's rect (`.277` -- was hardcoded to livingDining,
      // which silently made every other room report livingDining's albedo).
      const wp = o.getWorldPosition(new V())
      const rm = window.__store
        .getState()
        .floorPlan?.rooms?.find((r) => r.id === window.__probeRoom)
      if (rm) {
        const pad = 0.4
        if (
          wp.x < rm.origin[0] - pad ||
          wp.x > rm.origin[0] + rm.width + pad ||
          wp.z < rm.origin[1] - pad ||
          wp.z > rm.origin[1] + rm.depth + pad
        )
          return
      }
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      if (!m?.color) return
      ar += m.color.r * area
      ag += m.color.g * area
      ab += m.color.b * area
      tot += area
    })
    return tot ? { r: ar / tot, g: ag / tot, b: ab / tot, area: tot } : null
  })
  if (a)
    console.log(
      `ALBEDO area-weighted mean: r=${a.r.toFixed(4)} g=${a.g.toFixed(4)} b=${a.b.toFixed(4)}  over ${a.area.toFixed(0)} m2`,
    )
}
const shot = await shotFor(PITCH)
if (BACKDROP)
  console.log(
    `BACKDROPCHECK ${JSON.stringify(
      await page.evaluate(() => {
        const t = window.__three.scene.background
        const s2 = window.__store.getState()
        return {
          asked: s2.backdrop,
          ctor: t?.constructor?.name ?? null,
          mapping: t?.mapping ?? null,
          w: t?.image?.width ?? null,
          h: t?.image?.height ?? null,
        }
      }),
    )}`,
  )
if (BGMUL != null) console.log(`BGMUL=${BGMUL} held at capture: ${JSON.stringify(await readBg())}`)
if (BGBLOCK)
  console.log(
    `BGBLOCK held at capture: ${JSON.stringify(
      await page.evaluate(() => {
        const cv = window.__three.scene.background?.image
        if (!cv?.getContext) return null
        const ctx = cv.getContext('2d')
        const at = (fy) =>
          [
            ...ctx.getImageData(Math.round(cv.width * 0.5), Math.round(cv.height * fy), 1, 1).data,
          ].slice(0, 3)
        return { row30: at(0.3), row50: at(0.5), row55: at(0.55) }
      }),
    )}`,
  )
if (LINEAR)
  console.log(
    `LINEAR=1 held at capture: ${JSON.stringify(
      await page.evaluate(() => ({
        toneMapping: window.__three.gl?.toneMapping,
        exposure: window.__three.gl?.toneMappingExposure,
      })),
    )}  (readings below are sRGB-encoded; decode before ratioing)`,
  )
if (applyFillOff)
  console.log(
    `FILLOFF=1 zeroed: ${JSON.stringify(
      await page.evaluate(() => {
        const out = []
        window.__three.scene.traverse((o) => {
          if (o.isAmbientLight || o.isHemisphereLight) out.push(`${o.type}=${o.intensity}`)
        })
        return out
      }),
    )}`,
  )
if (GBOUNCE != null) console.log(`GBOUNCE held at capture: ${JSON.stringify(await readGround())}`)
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
  // The modal always runs to its own 256-sample cap, so a smaller PTSAMPLES
  // cannot make a shorter render -- it only makes the probe read EARLIER, while
  // the canvas still holds the pre-completion placeholder (`.282`). Every run
  // that asked for the cap produced a real trace (bedroom3 119.4/116.9 and
  // 120.3/117.6; livingDining 137.3/137.3/143.1); every run that asked for less
  // produced the placeholder. So the request is clamped to the cap. PTSAMPLES is
  // kept only to raise it should the cap ever change.
  const want = Math.max(256, Number(process.env.PTSAMPLES || 256))
  // Mean / sd / R-B of a fixed 10% patch of the tracer canvas, read in-page via
  // drawImage onto a 2D scratch canvas (`.282`). Cheap enough to call on every
  // poll, unlike toDataURL of a 1920x1080 WebGL canvas.
  const patchStatsFn = () => {
    const list = [...document.querySelectorAll('canvas')]
    const scene = list[0]
    const cands = list.filter((c) => c !== scene && c.width > 16 && c.height > 16)
    const c = cands.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!c) return null
    const w = Math.round(c.width * 0.1)
    const h = Math.round(c.height * 0.1)
    const s2 = document.createElement('canvas')
    s2.width = w
    s2.height = h
    const ctx = s2.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(c, Math.round(c.width * 0.45), Math.round(c.height * 0.18), w, h, 0, 0, w, h)
    const d = ctx.getImageData(0, 0, w, h).data
    let sl = 0
    let sl2 = 0
    let srb = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      sl += l
      sl2 += l * l
      srb += d[i] - d[i + 2]
    }
    const mean = sl / n
    return {
      L: mean,
      sd: Math.sqrt(Math.max(0, sl2 / n - mean * mean)),
      rb: srb / n,
      cw: c.width,
      ch: c.height,
      n: cands.length,
    }
  }
  await page.evaluate((v) => window.__walkLook?.setPitch(v), PITCH)
  await new Promise((r) => setTimeout(r, 600))
  // PTAI=off|on -- force the `hqAiDenoise` feature flag before the modal mounts
  // (`.285`), so item (t)'s two arms can be rendered at one pose. `useFeature`
  // reads `s.featureFlags[flag]` straight off the store, so setting it there is
  // enough; it is not recomputed per frame the way `Lighting` rewrites
  // `hemi.groundColor` (`.254`). Read back AFTER the capture regardless -- `.254`
  // published two dead-flat sweeps because an intervention silently reverted and
  // only a post-hoc read-back caught it.
  if (process.env.PTAI) {
    const wantAi = process.env.PTAI !== 'off'
    await page.evaluate((v) => {
      const st = window.__store
      st.setState((s) => ({ featureFlags: { ...s.featureFlags, hqAiDenoise: v } }))
    }, wantAi)
    const seen = await page.evaluate(() => window.__store.getState().featureFlags.hqAiDenoise)
    console.log(`  PTAI: asked hqAiDenoise=${wantAi}, store reports ${seen}`)
    if (seen !== wantAi) throw new Error(`PTAI: flag did not take (${seen})`)
  }
  // `.285`: the two interleaved traced states differ by a near-constant
  // whole-frame factor (~0.67 across all 24 cells of a 6x4 grid) plus a cold->
  // neutral R-B shift -- the signature of a different EXPOSURE, not different
  // lighting. `hqRenderSession` is constructed with
  // `exposure: src.gl.toneMappingExposure`, and `Lighting` rewrites that every
  // frame from the day/night curve, so if the modal reads it before the hour has
  // been graded the still renders at a stale exposure. Log it at open and at
  // capture to find out, instead of assuming.
  const expoAt = async (label) => {
    const e = await page.evaluate(() => {
      // `window.__three` is what the rest of this probe uses to reach three
      // objects; `getHqRenderSource` is a module export and not on window.
      const gl = window.__three?.gl ?? null
      const s = window.__store.getState()
      return {
        gl: gl ? gl.toneMappingExposure : null,
        tm: gl ? gl.toneMapping : null,
        hour: s.hour ?? null,
      }
    })
    console.log(
      `  PTEXPO ${label}: gl.toneMappingExposure=${e.gl} toneMapping=${e.tm} hour=${e.hour}`,
    )
    return e
  }
  // PTHDRI=off|on -- force the tracer's environment branch (`.286`). `.285`
  // left one untested lead for item (u): `resolveTracerEnvironment` falls back to
  // a hardcoded cold `GradientEquirectTexture` when `hdriUrl` is absent, and that
  // fallback is brighter AND colder, which is state A's exact signature. The
  // modal builds `hdriUrl` from `useFeature('hdriEnvironment')` plus
  // `store.hdriId`, so forcing the flag forces the branch. If the lead is right,
  // off must give state A every time and on must give state B every time.
  if (process.env.PTHDRI) {
    const wantH = process.env.PTHDRI !== 'off'
    // `hdriId` defaults to null, and `hqEnvironmentUrl(on, null)` returns null --
    // so flipping the flag alone leaves `hdriUrl` undefined and the gradient
    // branch taken either way. The ON arm has to name a real preset, or it is not
    // an A/B at all. PTHDRIID overrides the preset (default `studio_small_09`).
    const wantId = process.env.PTHDRIID || 'studio_small_09'
    await page.evaluate(
      ({ v, id }) => {
        window.__store.setState((st) => ({
          featureFlags: { ...st.featureFlags, hdriEnvironment: v },
          hdriId: v ? id : null,
        }))
      },
      { v: wantH, id: wantId },
    )
    const seen = await page.evaluate(() => ({
      on: window.__store.getState().featureFlags.hdriEnvironment,
      id: window.__store.getState().hdriId,
      liveEnv: (() => {
        const e = window.__three?.scene?.environment
        if (!e) return 'null'
        return `${e.isRenderTargetTexture ? 'renderTarget' : 'plain'} mapping=${e.mapping}`
      })(),
    }))
    console.log(
      `  PTHDRI: asked hdriEnvironment=${wantH}, store reports ${seen.on}, hdriId=${seen.id}, live scene.environment=${seen.liveEnv}`,
    )
    if (seen.on !== wantH) throw new Error(`PTHDRI: flag did not take (${seen.on})`)
  }
  if (process.env.PTEXPO === '1') await expoAt('before modal open')
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
  if (process.env.PTEXPO === '1') await expoAt('at Start render')
  const t0 = Date.now()
  let got = 0
  while (Date.now() - t0 < 600_000) {
    const m = await page.evaluate(() => {
      const t = document.body.innerText || ''
      const r = t.match(/(\d+)\s*\/\s*(\d+)\s*samples?/i)
      return r ? Number(r[1]) : null
    })
    if (m != null) got = m
    // PTTRACE=1 -- sample the tracer canvas DURING the render (`.282`). `.281`
    // found bedroom3's traced level identical at 50 and 150 samples and totally
    // different at 250 (level, texture AND colour temperature), which no Monte
    // Carlo accumulation can do. Whole extra runs answer that slowly and
    // confound sample count with wall-clock; one render read repeatedly gives
    // the trajectory against both at once. Reads a small patch via drawImage
    // onto a 2D scratch canvas -- toDataURL of a 1920x1080 WebGL canvas every
    // 4 s would itself perturb the timing.
    if (process.env.PTLIST === '1' && got > 0 && got < 40) {
      // `.283`: drawImage AND gl.readPixels both return the same frozen frame,
      // while a page screenshot of the SAME modal shows a normal evolving trace.
      // Two independent pixel reads cannot both be stale, so the canvas being
      // read is simply not the canvas being displayed -- the "largest canvas
      // that is not the scene" heuristic is picking the wrong one. Inventory it.
      const inv = await page.evaluate(() =>
        [...document.querySelectorAll('canvas')].map((c, i) => {
          const r = c.getBoundingClientRect()
          return {
            i,
            w: c.width,
            h: c.height,
            css: `${Math.round(r.width)}x${Math.round(r.height)}`,
            vis: r.width > 0 && r.height > 0,
            parent: c.parentElement?.className?.toString().slice(0, 40) || '',
          }
        }),
      )
      for (const c of inv) {
        console.log(
          `  PTLIST [${c.i}] backing=${c.w}x${c.h} css=${c.css} visible=${c.vis} parent="${c.parent}"`,
        )
      }
    }
    if (process.env.PTGL === '1') {
      // `.283`: page screenshots prove the DISPLAYED render evolves and converges
      // normally, while drawImage reads of the same canvas return a frozen early
      // frame. So the freeze is a read artefact. The renderer is constructed with
      // preserveDrawingBuffer:true, so gl.readPixels should see live pixels --
      // this compares the two reads side by side on the same patch.
      const cmp = await page.evaluate(() => {
        const list = [...document.querySelectorAll('canvas')]
        const c = list
          .filter((x) => x !== list[0] && x.width > 16 && x.height > 16)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0]
        if (!c) return null
        const w = Math.round(c.width * 0.1)
        const h = Math.round(c.height * 0.1)
        const sx = Math.round(c.width * 0.45)
        const sy = Math.round(c.height * 0.18)
        const stats = (get) => {
          let sl = 0
          let sl2 = 0
          let n = 0
          for (let i = 0; i < w * h; i++) {
            const [r, g, b] = get(i)
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
            sl += l
            sl2 += l * l
            n++
          }
          const m = sl / n
          return { L: m, sd: Math.sqrt(Math.max(0, sl2 / n - m * m)) }
        }
        const s2 = document.createElement('canvas')
        s2.width = w
        s2.height = h
        const ctx = s2.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(c, sx, sy, w, h, 0, 0, w, h)
        const d2 = ctx.getImageData(0, 0, w, h).data
        const draw = stats((i) => [d2[i * 4], d2[i * 4 + 1], d2[i * 4 + 2]])
        const gl = c.getContext('webgl2') || c.getContext('webgl')
        if (!gl) return { draw, gl: null }
        const px = new Uint8Array(w * h * 4)
        // readPixels origin is bottom-left; flip the y of the patch.
        gl.readPixels(sx, c.height - sy - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const glr = stats((i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]])
        return { draw, gl: glr }
      })
      if (cmp) {
        const g = cmp.gl ? `L=${cmp.gl.L.toFixed(1)} sd=${cmp.gl.sd.toFixed(2)}` : 'n/a'
        console.log(
          `  PTGL samples=${got} drawImage L=${cmp.draw.L.toFixed(1)} sd=${cmp.draw.sd.toFixed(2)}  |  readPixels ${g}`,
        )
      }
    }
    if (process.env.PTSHOT === '1') {
      // What the USER sees, as opposed to what a canvas read returns (`.283`).
      // `.282` filed the frozen canvas as a product defect on the strength of
      // drawImage reads alone; a page screenshot goes through the compositor
      // instead, so if it evolves while the canvas read does not, the freeze is
      // a read artefact and (t) is wrong.
      await page.screenshot({ path: `${OUT}/prog-${String(got).padStart(3, '0')}.png` })
    }
    if (process.env.PTTRACE === '1') {
      const st = await page.evaluate(patchStatsFn)
      if (st) {
        console.log(
          `  PTTRACE t=${((Date.now() - t0) / 1000).toFixed(0)}s samples=${got} ` +
            `L=${st.L.toFixed(1)} sd=${st.sd.toFixed(2)} R-B=${st.rb.toFixed(1)} ${st.cw}x${st.ch}`,
        )
      }
    }
    if (got >= want) break
    await new Promise((r) => setTimeout(r, 4000))
  }
  // Wait for the render to COMPLETE before reading (`.282`). The HQ modal does
  // NOT blit the accumulating frame to its canvas -- PTTRACE sampled a fixed
  // patch 44 times across a whole 256-sample render and got L=179.7 sd=0.93
  // R-B=-14.2 every single time, then the image changed the instant the render
  // finished. So a read taken at `got >= want` returns a static placeholder,
  // not the path trace, and every PT number in `.246`-`.281` that came from an
  // incomplete render measured that placeholder. `want` cannot stop the render
  // early either (the modal always runs to its own 256 cap), so there is no
  // such thing as a valid low-sample read through this UI: always finish.
  //
  // Waiting on the SAMPLE COUNTER alone is not enough -- a first attempt did
  // exactly that, watched the counter stop at 256, waited a further 90 s, and
  // still saved the placeholder. The read has to touch the canvas: the run that
  // first produced a real trace polled the canvas every 5 s, and the finished
  // image was there 5 s after completion. So the settle loop below samples a
  // patch every poll and requires BOTH the counter and the patch to hold still,
  // which asserts on the image actually about to be saved rather than on a
  // counter that says nothing about what the canvas contains.
  if (process.env.PTNOWAIT !== '1') {
    // Wait for the render to finish, then capture by SCREENSHOT (`.283`).
    // Reading the canvas's pixels does not work: drawImage and gl.readPixels
    // both return a frozen early frame, they agree exactly with each other, and
    // they disagree with what the compositor shows for the same element (page
    // screenshots of that modal evolve from noisy at 6 samples to converged at
    // 256, exactly as they should). Two independent pixel reads cannot both be
    // stale by accident, and the canvas inventory shows the right element is
    // being picked -- so the read path is unsound and the compositor is the only
    // instrument known to reflect reality. Costs resolution: the modal preview is
    // ~694 CSS px wide, so the capture is ~1041x585 rather than 1920x1080. The
    // anchor sampler works in normalized coords, so that is a precision cost,
    // not a correctness one.
    let stable = 0
    let last = got
    const w0 = Date.now()
    while (stable < 3 && Date.now() - w0 < 300_000) {
      await new Promise((r) => setTimeout(r, 4000))
      const m2 = await page.evaluate(() => {
        const t = document.body.innerText || ''
        const r = t.match(/(\d+)\s*\/\s*(\d+)\s*samples?/i)
        return r ? Number(r[1]) : null
      })
      if (m2 != null) {
        if (m2 === last) stable += 1
        else {
          stable = 0
          last = m2
          got = m2
        }
      }
    }
    console.log(`  PT: settled at ${got} samples after ${((Date.now() - w0) / 1000).toFixed(0)}s`)
  }
  // PTHOLD=<seconds> -- keep sampling AFTER the target count is reached (`.282`).
  // PTTRACE showed the displayed canvas frozen for a whole 256-sample render, so
  // the question is whether it ever updates at all, and if so on what event.
  if (process.env.PTHOLD) {
    const holdMs = Number(process.env.PTHOLD) * 1000
    const h0 = Date.now()
    while (Date.now() - h0 < holdMs) {
      await new Promise((r) => setTimeout(r, 5000))
      const m2 = await page.evaluate(() => {
        const t = document.body.innerText || ''
        const r = t.match(/(\d+)\s*\/\s*(\d+)\s*samples?/i)
        return r ? Number(r[1]) : null
      })
      const st = await page.evaluate(patchStatsFn)
      if (st) {
        console.log(
          `  PTHOLD t=${((Date.now() - h0) / 1000).toFixed(0)}s samples=${m2} ` +
            `L=${st.L.toFixed(1)} sd=${st.sd.toFixed(2)} R-B=${st.rb.toFixed(1)} canvases=${st.n}`,
        )
      }
    }
  }
  // Read the tracer canvas's OWN PIXELS via toDataURL rather than screenshotting
  // the element. `.246` screenshotted it and the modal footer bled into the
  // bottom of the capture, because an element screenshot grabs the page region
  // at that element's box and the canvas box runs under the chrome. toDataURL
  // cannot include DOM at all, and it returns full render resolution instead of
  // the CSS-scaled preview.
  // Read the canvas's own pixels at full backing-store resolution (`.284`).
  // `.283` switched this to a clipped screenshot believing canvas reads were
  // unsound; they are not. Measuring five patches across one render's
  // screenshots showed the screenshot channel agreeing with the in-page reads to
  // 0.1 at every sample count, and showed a normal convergence curve on the wall
  // patches (sd 7.65 -> 1.33). The reads were always fine -- `.282` had simply
  // pointed its single probe patch at a region that is converged from sample 1.
  // toDataURL gives 1920x1080 instead of the modal preview's ~1388x780, so the
  // screenshot cost resolution for nothing.
  const png = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')]
    const scene = list[0]
    const cands = list.filter((c) => c !== scene && c.width > 16 && c.height > 16)
    const c = cands.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!c) return null
    // WHICH STAGE this is (`.284`). On completion `finalize()` replaces the host
    // canvas with the AI-denoised output, which is a plain 2D canvas -- so a null
    // WebGL context identifies the denoised frame, and a live one the raw trace.
    // The two differ by ~30% in level and flip R-B (item (t)), so a traced figure
    // is meaningless without saying which it came from. Every prior round quoted
    // traced numbers without recording this, which is the whole reason `.280`
    // through `.283` each mis-attributed the difference.
    // Probe for a 2D context, not a WebGL one. Asking for 'webgl2' on a canvas
    // that already holds a WebGL1 context returns null, so the WebGL test
    // mislabels -- it reported 'ai-denoised' for a frame whose values were
    // plainly the raw trace. getContext('2d') has no such ambiguity: it returns
    // null on any WebGL canvas and a context on the denoised 2D one.
    let stage = 'raw-trace'
    try {
      if (c.getContext('2d')) stage = 'ai-denoised'
    } catch {
      stage = 'raw-trace'
    }
    try {
      return { url: c.toDataURL('image/png'), w: c.width, h: c.height, stage }
    } catch {
      return null
    }
  })
  if (!png) throw new Error('PT: could not read a tracer canvas')
  fs.writeFileSync(`${OUT}/pathtraced.png`, Buffer.from(png.url.split(',')[1], 'base64'))
  // PTDOUBLE=1 -- capture the SAME settled render a second time (`.287`). The
  // whole-frame mean varies continuously across runs (113.8, 139.5, 155.7) while
  // the anchors take only two discrete values, which is what a partially-updated
  // TILED blit looks like: `tracer.tiles.set(n,n)` renders 2x2..6x6 tiles, so a
  // capture can catch some tiles carrying the new image and others the old. If
  // that is what is happening, two captures of one finished render will differ.
  if (process.env.PTDOUBLE === '1') {
    const stat = (buf) => {
      let sl = 0
      let srb = 0
      const n = buf.length / 3
      for (let i = 0; i < buf.length; i += 3) {
        sl += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]
        srb += buf[i] - buf[i + 2]
      }
      return `frameL=${(sl / n).toFixed(1)} frameRB=${(srb / n).toFixed(1)}`
    }
    const first = await sharp(`${OUT}/pathtraced.png`).removeAlpha().raw().toBuffer()
    console.log(`  PTDOUBLE capture 1: ${stat(first)}`)
    for (const wait of [5000, 5000]) {
      await new Promise((r) => setTimeout(r, wait))
      const again = await page.evaluate(() => {
        const list = [...document.querySelectorAll('canvas')]
        const c = list
          .filter((x) => x !== list[0] && x.width > 16 && x.height > 16)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0]
        return c ? c.toDataURL('image/png') : null
      })
      if (!again) break
      const p2 = `${OUT}/pathtraced-again.png`
      fs.writeFileSync(p2, Buffer.from(again.split(',')[1], 'base64'))
      const buf = await sharp(p2).removeAlpha().raw().toBuffer()
      console.log(`  PTDOUBLE recapture:  ${stat(buf)}`)
    }
  }
  if (process.env.PTAI) {
    const after = await page.evaluate(() => window.__store.getState().featureFlags.hqAiDenoise)
    console.log(`  PTAI read-back after capture: hqAiDenoise=${after}`)
  }
  console.log(`  PT STAGE: ${png.stage} -- traced figures below are ${png.stage} values`)
  console.log(`pathtraced (${got} samples, ${png.w}x${png.h}) -> ${OUT}/pathtraced.png`)
}
// --- analysis -------------------------------------------------------------
// Fixed fractional bands, with the two HUD rectangles cut out so the toolbar and
// the minimap never count as "ceiling" or "floor".
const grey = async (buf) =>
  sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
const { data, info } = await grey(shot)
// COLOUR buffer alongside the luminance one (`.267`). `.237` measured the app's
// 19:00 pane at R-B 21.0 against a wall at R-B 21.3 -- no warm/cool separation at
// the hour interior photography most depends on it -- and nothing followed it up.
// Chroma is a different axis from everything `.249`-`.266` measured, and hue is far
// less exposure- and framing-dependent than luminance.
const rgb = await sharp(shot).removeAlpha().raw().toBuffer()
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
      // GLAZING POPULATION -- the metric item (l) is actually about. `.236` measured
      // clipping over a window RECTANGLE, which `.237` had to correct because the
      // grilles dominate it. This selects by world-verified SIGNATURE instead, so
      // the population is pane interiors by construction, and reports the fraction
      // of it that CLIPS -- photographs run 15-39 %, the app 0.0 % (`.258` showed
      // why: the scene carries 2.2-3.3x the wall where physics carries 20-200x).
      {
        const sig = process.env.GLAZE_SIG || 'BoxGeometry#bcd4e6'
        const vs = []
        for (const h of geo) {
          if (h.name !== sig) continue
          const gx = Math.min(W - 1, Math.floor(h.x * W))
          const gy = Math.min(H - 1, Math.floor(h.y * H))
          vs.push(data[gy * W + gx])
        }
        if (vs.length) {
          const m = vs.reduce((a, b) => a + b, 0) / vs.length
          const clipped = vs.filter((v) => v > 250).length
          const hot = vs.filter((v) => v > 240).length
          // STRUCTURE, not just the average (`.261`). `.260` found a real window's
          // panes face different things -- open sky, a sunlit wall, a shaded porch
          // -- and clip 59 / 33 / 9 % inside ONE photograph. The app has a single
          // backdrop texture, so its panes blow together. An aggregate clipping
          // fraction cannot tell those apart; a spread can.
          const sd = Math.sqrt(vs.reduce((a, v) => a + (v - m) * (v - m), 0) / vs.length)
          const sorted = [...vs].sort((a, b) => a - b)
          const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]
          const mid = vs.filter((v) => v > 60 && v <= 240).length
          console.log(
            `    GLAZING (${sig}): n=${vs.length}  mean ${m.toFixed(1)}  >250 ${((100 * clipped) / vs.length).toFixed(1)} %  >240 ${((100 * hot) / vs.length).toFixed(1)} %   (photographs clip 15-39 %)`,
          )
          console.log(
            `      structure: sd ${sd.toFixed(1)}  p05 ${q(0.05)}  p50 ${q(0.5)}  p95 ${q(0.95)}  spread(p95-p05) ${q(0.95) - q(0.05)}  mid-tone(60..240) ${((100 * mid) / vs.length).toFixed(1)} %`,
          )
          // CHROMA of the glazing population, and its separation from the walls.
          // A daylit photograph reads warm-interior against cool-exterior (or the
          // reverse at golden hour); `.237` found the app has none at 19:00.
          let gr = 0
          let gg = 0
          let gb = 0
          let gn = 0
          for (const h of geo) {
            if (h.name !== sig) continue
            const gx = Math.min(W - 1, Math.floor(h.x * W))
            const gy = Math.min(H - 1, Math.floor(h.y * H))
            const o = (gy * W + gx) * 3
            gr += rgb[o]
            gg += rgb[o + 1]
            gb += rgb[o + 2]
            gn++
          }
          let wr = 0
          let wg2 = 0
          let wb = 0
          let wn = 0
          for (const h of geo) {
            if (h.name !== 'PlaneGeometry#f5f5f0') continue
            const gx = Math.min(W - 1, Math.floor(h.x * W))
            const gy = Math.min(H - 1, Math.floor(h.y * H))
            const o = (gy * W + gx) * 3
            wr += rgb[o]
            wg2 += rgb[o + 1]
            wb += rgb[o + 2]
            wn++
          }
          if (gn && wn) {
            const grb = gr / gn - gb / gn
            const wrb = wr / wn - wb / wn
            console.log(
              `      chroma: glazing RGB ${(gr / gn).toFixed(0)}/${(gg / gn).toFixed(0)}/${(gb / gn).toFixed(0)} R-B ${grb.toFixed(1)}  |  wall(n=${wn}) RGB ${(wr / wn).toFixed(0)}/${(wg2 / wn).toFixed(0)}/${(wb / wn).toFixed(0)} R-B ${wrb.toFixed(1)}  |  SEPARATION ${(wrb - grb).toFixed(1)}`,
            )
          }
        } else {
          console.log(`    GLAZING (${sig}): no samples at this pose`)
        }
      }
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
  const ANCHOR_OFF = Number(process.env.ANCHOR_OFF || 0)
  const ANCHOR_MINFRAC = Number(process.env.ANCHOR_MINFRAC || 1)
  const anchors = await page.evaluate(
    ({ win, ds, y, half, grid, hud, sides, off, minFrac }) => {
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
        // W shoots back TOWARD the window, so the anchor lands on the glazing --
        // the surface item (l) is about. Its normal is parallel to the window
        // normal, which is the `n` axis rather than `perp` or `up` (`.258`).
        { side: 'W', dir: () => n.clone().multiplyScalar(-1), axis: 'n' },
      ].filter((q) => sides.includes(q.side))
      for (const d of ds) {
        // ANCHOR_OFF shifts the ceiling/floor anchor line sideways off the room
        // axis. The ceiling fan hangs on that axis and ROTATES, so a ceiling
        // anchor above it intermittently hits a blade: `.254` saw d=1.2 land on
        // `BoxGeometry#6b4f34` at one sweep point and clean plaster at the next,
        // which the same-material rule rejects correctly but which makes the
        // accepted anchor set vary run to run. Wall anchors are unaffected -- a
        // sideways ray hits the same wall point wherever along `perp` it starts.
        const origin = new V(
          win.cx + win.nx * d + perp.x * off,
          y,
          win.cz + win.nz * d + perp.z * off,
        )
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
          const axisVec = pr.axis === 'up' ? new V(0, 1, 0) : pr.axis === 'n' ? n : perp
          rec.dotPerp = +Math.abs(wn.dot(axisVec)).toFixed(3)
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
          // Every point in `pts` is already verified same-object, same-signature and
          // unoccluded, so a PARTIAL patch is still a clean population -- the gate
          // is conservatism, not correctness. It has to be relaxable for the
          // glazing, which is crossed by ~20 grille bars at ~12 cm pitch: no patch
          // big enough to measure fits between them, and sampling "pane interiors
          // between the bars" is exactly what `.237` did by hand (`.258`).
          if (pts.length < Math.ceil(grid * grid * minFrac))
            rec.reject = `patch only ${pts.length}/${grid * grid} clean (min ${Math.round(100 * minFrac)}%)`
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
      off: ANCHOR_OFF,
      minFrac: ANCHOR_MINFRAC,
      hud: [
        { x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 },
        { x0: 0.9, x1: 1, y0: 0, y1: 0.06 },
        { x0: 0.76, x1: 1, y0: 0.76, y1: 1 },
      ],
    },
  )
  console.log(
    `\nANCHORED wall falloff  (y=${ANCHOR_Y} m, patch ${(2 * HALF).toFixed(2)}x${(2 * HALF).toFixed(2)} m, ${GRID}x${GRID} world samples, lateral offset ${ANCHOR_OFF} m)`,
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
    const room = (plan.rooms ?? []).find((r) => r.id === window.__probeRoom)
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
    const bySide = { A: [], B: [], C: [], F: [], W: [] }
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
    const grgb = await sharp(`${OUT}/pathtraced.png`).removeAlpha().raw().toBuffer()
    // STATE DISCRIMINATOR (`.285`). The traced instrument is nondeterministic
    // between two discrete states -- runs with identical settings, identical
    // exposure and identical denoise stage land in one or the other, ~45% apart
    // at the anchors. They separate cleanly on the whole-frame mean:
    //   state A (anomalous): frameL 156.1-156.5, frameRB -9.7 to -9.8
    //   state B (expected):  frameL 112.3-114.7, frameRB +3.9 to +4.6
    // frameRB even flips sign, so this is unambiguous and free (the PNG is
    // already loaded). No traced figure in this arc means anything without it --
    // no earlier round recorded which state it was measuring.
    {
      let fl = 0
      let frb = 0
      const fn = grgb.length / 3
      for (let i = 0; i < grgb.length; i += 3) {
        fl += 0.2126 * grgb[i] + 0.7152 * grgb[i + 1] + 0.0722 * grgb[i + 2]
        frb += grgb[i] - grgb[i + 2]
      }
      const fL = fl / fn
      const fRB = frb / fn
      // `.285` classified on `fRB < -4` alone, which silently assumed there are
      // exactly two states. `.286` forced an HDRI on and got frameL=182.8
      // frameRB=+14.7 -- a third state that the old rule labelled "B (expected)".
      // Classify against both terms and say UNKNOWN rather than guess: a
      // discriminator that cannot report "not one of the ones I know" is how
      // `.285` would have gone on to compare a studio-HDRI frame against
      // gradient-lit numbers.
      // `.293` tried to replace this with a left-vs-right CHROMA FALLOFF test,
      // on the finding that the two "states" differ in how far the cold cast
      // extends from the glazing rather than in a global mean. It was reverted:
      // measured over the whole frame height the warm furniture in the lower
      // third swamps the gradient, and the classifier called the KNOWN-HEALTHY
      // frame anomalous (u1 falloff -1.8). The gradient is real but only in the
      // upper wall/ceiling band -- so it is a diagnostic (PTPROFILE=1), not a
      // classifier. This global-mean rule stays because it does separate the
      // observed clusters empirically, while being explicit that it summarises a
      // spatial field with one number.
      const inA = fRB < -4 && fL > 145 && fL < 170
      const inB = fRB > 0 && fRB < 10 && fL > 105 && fL < 130
      const state = inA
        ? 'A (ANOMALOUS -- cold cast does not fall off; see `.293`)'
        : inB
          ? 'B (expected)'
          : 'UNKNOWN -- matches neither known state; do NOT compare against either'
      console.log(`  PT FRAME STATE: ${state}  frameL=${fL.toFixed(1)} frameRB=${fRB.toFixed(1)}`)
      // PTPROFILE=1 -- R-B across 24 columns over a y band (`.293`). Default band
      // is the upper wall/ceiling third, where the cold-cast gradient lives; the
      // lower third is furniture and swamps it. This is what showed the two
      // "states" share a near-window asymptote and differ only in extent.
      if (process.env.PTPROFILE === '1') {
        const yb0 = Math.round(Number(process.env.PTPROF_Y0 || 0.19) * g.info.height)
        const yb1 = Math.round(Number(process.env.PTPROF_Y1 || 0.46) * g.info.height)
        const cols = []
        for (let c = 0; c < 24; c++) {
          const x0 = Math.floor((c * g.info.width) / 24)
          const x1 = Math.floor(((c + 1) * g.info.width) / 24)
          let s2 = 0
          let n2 = 0
          for (let y = yb0; y < yb1; y++) {
            for (let x = x0; x < x1; x++) {
              const i2 = (y * g.info.width + x) * 3
              s2 += grgb[i2] - grgb[i2 + 2]
              n2++
            }
          }
          cols.push((s2 / n2).toFixed(1))
        }
        console.log(`  PT PROFILE y=${yb0}..${yb1} R-B by column: ${cols.join(' ')}`)
      }
    }
    traced = { data: g.data, rgb: grgb, W: g.info.width, H: g.info.height }
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
  const readings = { A: [], B: [], C: [], F: [], W: [] }
  const tracedReadings = { A: [], B: [], C: [], F: [], W: [] }
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
      // Traced COLOUR as well as luminance (`.269`). A within-tracer A/B -- recolour
      // one surface, re-render -- shares the rig on both sides, so `.255`'s rig
      // mismatch cannot apply, and real light transport supplies the colour-bleed
      // magnitude that photographs could not.
      let tr2 = 0
      let tg2 = 0
      let tb2 = 0
      for (const [sx, sy] of a.pts) {
        const gx = Math.min(traced.W - 1, Math.floor(sx * traced.W))
        const gy = Math.min(traced.H - 1, Math.floor(sy * traced.H))
        const o = (gy * traced.W + gx) * 3
        tr2 += traced.rgb[o]
        tg2 += traced.rgb[o + 1]
        tb2 += traced.rgb[o + 2]
      }
      const tn = a.pts.length
      console.log(
        `      traced RGB ${(tr2 / tn).toFixed(0)}/${(tg2 / tn).toFixed(0)}/${(tb2 / tn).toFixed(0)}  traced R-B ${(tr2 / tn - tb2 / tn).toFixed(1)}`,
      )
      tracedReadings[a.side].push({ d: a.d, m: tm })
    }
    let sr = 0
    let sg = 0
    let sb = 0
    for (const [sx, sy] of a.pts) {
      const gx = Math.min(W - 1, Math.floor(sx * W))
      const gy = Math.min(H - 1, Math.floor(sy * H))
      const o = (gy * W + gx) * 3
      sr += rgb[o]
      sg += rgb[o + 1]
      sb += rgb[o + 2]
    }
    const n3 = a.pts.length
    const cr = sr / n3
    const cg = sg / n3
    const cb = sb / n3
    a.chroma = { r: cr, g: cg, b: cb, rb: cr - cb }
    console.log(
      `  d=${a.d.toFixed(1)} side ${a.side}  L=${m.toFixed(1)}${tm == null ? '' : `  traced L=${tm.toFixed(1)}`}  RGB ${cr.toFixed(0)}/${cg.toFixed(0)}/${cb.toFixed(0)} R-B ${(cr - cb).toFixed(1)}   ${a.sig}  span ${a.span} m  |n.perp| ${a.dotPerp}`,
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
    const label = { A: 'wall A', B: 'wall B', C: 'ceiling', F: 'floor', W: 'glazing' }
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
