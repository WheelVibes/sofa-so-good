/**
 * UNDERSIDE-SHADOW — is the floor under the furniture as dark as it is in a photograph?
 *
 * `.183` refused the hemisphere ground-bounce term on a judgement made by eye:
 * at x4.5 "the undersides of the TV console and the coffee table are visibly
 * lighter than a piece of furniture sitting on a floor in shadow should be".
 * That is the right objection and the wrong kind of evidence — it cannot be
 * re-checked at a smaller gain, and `.190` showed the whole-floor term is the
 * only one left that fits the physics, so the objection needs a number.
 *
 * The measurable form of "sitting on a floor in shadow" is the SHADOWED FLOOR
 * BENEATH a piece against the LIT FLOOR beside it — same material, so the ratio
 * is a shadow measurement and not an albedo one. Measured in the reference
 * photographs (`.191`): parquet 0.725, pale wood 0.654 and 0.579, i.e. real
 * furniture sits over floor at roughly **0.58-0.73** of the open floor beside it.
 * A term that lifts the app above ~0.73 is `.183`'s defect, made falsifiable.
 *
 * The mask is GEOMETRIC, never a screen rectangle — `.181` spent two rounds on a
 * "floor" band that was furniture. A sample is kept only if the ray hit a
 * near-horizontal, up-facing surface at floor height; it is classified by casting
 * a second ray straight UP and asking whether furniture sits within `OCCLUDE_M`.
 *
 * **Classifying by distance to the nearest furniture FOOTPRINT was tried and is
 * refuted (`.192`).** It fixes the sample count — 40 footprints, 332 samples in
 * one pose against 7 for the ray — and measures the wrong thing: it reported the
 * "shaded" band as 1.89x BRIGHTER than the "open" band, because floor near
 * furniture in a window-facing pose is the sunlit strip by the glass while floor
 * far from furniture is deeper into the room. Distance-to-footprint correlates
 * with distance from the WINDOW, not with furniture shading. Do not re-propose it.
 *
 * The ray classifier has the right sign and the right magnitude; its only problem
 * is that floor both under a piece and visible from standing eye height is rare.
 * So this pools samples across SEVERAL poses rather than trusting one.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
const PHOTO = process.env.PHOTO === '1'
const PITCH = Number(process.env.PITCH || -0.5)
const GRID = Number(process.env.GRID || 90)
/**
 * How close overhead something must be to count as "this floor is under it".
 *
 * MUST stay below ceiling height. The upward ray hits the CEILING like anything
 * else, so at `OCCLUDE=4.0` every floor sample in the room classifies as "under
 * furniture" (measured: 332 under / 0 open) and the ratio silently becomes 1.
 */
const OCCLUDE_M = Number(process.env.OCCLUDE || 1.5)
const CEILING_M = 2.4
/** Standoffs from the window, in metres, sampled in both look directions. */
const STANDOFFS = (process.env.STANDOFFS || '1.2,2.2,3.2,4.6').split(',').map(Number)
const DIRS = (process.env.DIRS || 'in,out').split(',')
/** Which window opening the pose is derived from. `.193` measured the MAIN
 *  BEDROOM for two rounds because this defaulted to "the first window in the
 *  plan"; every other measurement in this arc uses the living/dining room. */
const WINDOW = process.env.WINDOW || 'livingDining'
/** `AO=0` turns screen-space AO off, to price its contribution to the shadow
 *  under furniture. Cleared with `resetQualityOverrides` — writing `undefined`
 *  per key does NOT clear it, it reads as "off" (QUALITY-OVERRIDE-UNDEF). */
/** Re-finish the living/dining floor, to test whether the render responds.
 *  `.181` reported that it does not on the curated default flat, but measured it
 *  with the screen-band method `.182` retracted as contaminated. */
const FLOOR = process.env.FLOOR || ''
const AO = process.env.AO
const OUT = process.env.OUT || '/tmp/underside-shadow'

/**
 * HUD cut-outs, as fractions of the frame. REQUIRED: a puppeteer screenshot
 * composites the DOM over the canvas (`.185`), so a floor sample that lands under
 * the toolbar, the walk toast, the interaction pill, the hint bar or the minimap
 * reads the HUD's pixels instead of the floor's. `.193` shipped two rounds of
 * numbers without these.
 */
const HUD = [
  { x0: 0.24, x1: 0.76, y0: 0, y1: 0.1 }, // toolbar
  { x0: 0.9, x1: 1, y0: 0, y1: 0.06 }, // measure button
  { x0: 0.76, x1: 1, y0: 0.76, y1: 1 }, // minimap + compass
  { x0: 0.32, x1: 0.68, y0: 0.11, y1: 0.22 }, // "Walking through" toast
  { x0: 0.42, x1: 0.59, y0: 0.82, y1: 0.89 }, // interaction pill
  { x0: 0.29, x1: 0.71, y0: 0.91, y1: 0.98 }, // walk-mode hint bar
]
const inHud = (x, y) => HUD.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)

fs.mkdirSync(OUT, { recursive: true })

// Launch config MATCHED to `light-distribution.mjs`. The previous args forced
// SOFTWARE GL (`--enable-unsafe-swiftshader`), which in `curtain-glow.mjs` made
// the `performance` tier render the ORBIT DOLLHOUSE while every state check said
// walk mode -- four rounds of wrong findings (.214-.218). Do not copy a launch
// block from a probe without checking which backend it asks for.
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
// SUPPRESS ONBOARDING BEFORE THE FIRST NAVIGATION. Without this the welcome
// modal renders over the canvas with a BLURRED, DIMMED backdrop, and every pixel
// read from the screenshot is the scene seen through that scrim rather than the
// scene. It invalidated this probe's whole `.191`/`.192` output — see the `.193`
// entry in the research doc. `light-distribution.mjs` has always done this.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

await page.evaluate(
  ({ h, t, photo, ao, floor }) => {
    const s = window.__store.getState()
    s.setQualityTier(t)
    s.resetQualityOverrides?.()
    if (ao !== undefined) s.setQualityOverride?.('ao', ao === '1')
    if (floor) s.setFloorFinish?.('livingDining', floor)
    s.setTimeMode?.('manual')
    s.setManualHour?.(h)
    s.setCameraMode?.('firstPerson')
    s.setPhotographicLook?.(photo)
  },
  { h: HOUR, t: TIER, photo: PHOTO, ao: AO, floor: FLOOR },
)
await new Promise((r) => setTimeout(r, 1500))

/**
 * Pose goes through the app's OWN walk-teleport signal, never a direct
 * `camera.lookAt`: `FirstPersonCamera` rewrites the camera's orientation every
 * frame from its own yaw/pitch state, so a hand-set orientation is stomped before
 * the next render. Measured (`.191`) — `DIR=in` and `DIR=out` came back
 * byte-identical while the direct call was in place, which is a mechanism
 * silently not firing, reading exactly like a real result.
 */
async function poseAt(standoff, dir) {
  const pose = await page.evaluate(
    ({ standoff, dir, win }) => {
      const plan = window.__store.getState().floorPlan
      const re = new RegExp(win, 'i')
      const wins = (plan?.openings ?? []).filter((o) => o.kind === 'window')
      const op = wins.find((o) => re.test(o.id ?? '')) ?? wins[0]
      const w = (plan?.walls ?? []).find((x) => x.id === op?.wallId)
      if (!op || !w) return null
      const [x0, z0] = w.start
      const [x1, z1] = w.end
      const len = Math.hypot(x1 - x0, z1 - z0)
      const ux = (x1 - x0) / len
      const uz = (z1 - z0) / len
      const t = op.offset + op.width / 2
      const cx = x0 + ux * t
      const cz = z0 + uz * t
      const inside = (px, pz) =>
        (plan?.rooms ?? []).some(
          (r) =>
            px >= r.origin[0] &&
            px <= r.origin[0] + r.width &&
            pz >= r.origin[1] &&
            pz <= r.origin[1] + r.depth,
        )
      let nx = -uz
      let nz = ux
      if (!inside(cx + nx * 1.2, cz + nz * 1.2)) {
        nx = -nx
        nz = -nz
      }
      const px = cx + nx * standoff
      const pz = cz + nz * standoff
      const yawOut = Math.atan2(-(cx - px), -(cz - pz))
      return { px, pz, yaw: dir === 'out' ? yawOut : yawOut + Math.PI }
    },
    { standoff, dir, win: WINDOW },
  )
  if (!pose) throw new Error('no window opening in the loaded plan')
  await page.evaluate(
    async (q) => {
      const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
      requestWalkTeleport(q.px, q.pz, q.yaw)
      window.__walkLook?.setPitch(q.pitch)
    },
    { ...pose, pitch: PITCH },
  )
  await new Promise((r) => setTimeout(r, 2200))
  return pose
}

function sampleFloor() {
  return page.evaluate(
    ({ g, occlude }) => {
      const { scene, camera } = window.__three
      const THREE = window.__three
      const rc = new THREE.raycaster.constructor()
      const up = new camera.position.constructor()
      const n = new camera.position.constructor()
      up.set(0, 1, 0)
      const solid = (o) =>
        o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
      const out = []
      for (let j = 0; j < g; j++) {
        for (let i = 0; i < g; i++) {
          const x = (i + 0.5) / g
          const y = (j + 0.5) / g
          rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
          const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          if (!h?.face) continue
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          // DOWN-FACING faces between shin and table height: the actual surface
          // class `.183` objected to, and the only class the hemisphere's
          // `groundColor` reaches (`.194`).
          if (n.y < -0.9 && h.point.y > 0.1 && h.point.y < 0.9) {
            out.push({ x, y, kind: 'face' })
            continue
          }
          if (n.y < 0.9 || h.point.y > 0.15) continue
          rc.set(h.point.clone().addScaledVector(up, 0.02), up)
          rc.far = occlude
          const above = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          rc.far = Infinity
          out.push({ x, y, kind: 'floor', under: !!above })
        }
      }
      return out
    },
    { g: GRID, occlude: OCCLUDE_M },
  )
}

const sharp = (await import('sharp')).default
const under = []
const open = []
const faces = []
const perPose = []

for (const standoff of STANDOFFS) {
  for (const dir of DIRS) {
    await poseAt(standoff, dir)
    await assertSceneAlive(page, `underside ${standoff} ${dir}`)
    // Retried because under machine load the pass returns an EMPTY set, which
    // reads exactly like "this pose sees no floor" (`.191`).
    let hits = []
    for (let attempt = 1; attempt <= 4; attempt++) {
      hits = await sampleFloor()
      if (hits.length >= 30) break
      await new Promise((r) => setTimeout(r, 1500))
    }
    const shot = await page.screenshot({ type: 'png' })
    const img = sharp(shot)
    const meta = await img.metadata()
    const raw = await img.raw().toBuffer()
    const ch = raw.length / (meta.width * meta.height)
    let u = 0
    let o = 0
    for (const h of hits) {
      if (inHud(h.x, h.y)) continue
      const px = Math.min(meta.width - 1, Math.floor(h.x * meta.width))
      const py = Math.min(meta.height - 1, Math.floor(h.y * meta.height))
      const off = (py * meta.width + px) * ch
      const l = 0.2126 * raw[off] + 0.7152 * raw[off + 1] + 0.0722 * raw[off + 2]
      if (h.kind === 'face') {
        faces.push(l)
        continue
      }
      if (h.under) {
        under.push(l)
        u++
      } else {
        open.push(l)
        o++
      }
    }
    perPose.push({ standoff, dir, floor: hits.length, under: u, open: o })
    fs.writeFileSync(`${OUT}/pose-${standoff}-${dir}.png`, shot)
  }
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN)
const mu = mean(under)
const mo = mean(open)

console.log(
  'underside-shadow ',
  JSON.stringify({
    tier: TIER,
    hour: HOUR,
    photographicLook: PHOTO,
    window: WINDOW,
    occludeM: OCCLUDE_M,
  }),
)
console.log(`frames -> ${OUT}`)
console.log('')
for (const p of perPose)
  console.log(
    `  standoff ${p.standoff} ${p.dir.padEnd(3)}  floor ${String(p.floor).padStart(3)}  under ${String(p.under).padStart(3)}  open ${String(p.open).padStart(3)}`,
  )
console.log('')
console.log(`POOLED  under ${under.length} / open ${open.length} / down-faces ${faces.length}`)
console.log(
  `  under = ${mu.toFixed(1)}   open = ${mo.toFixed(1)}   under/open = ${(mu / mo).toFixed(3)}`,
)
console.log(`  open-floor MEAN = ${mo.toFixed(1)}`)
// Floor VARIATION over the geometrically-masked open-floor samples: a gloss
// proxy. A glossy floor mirrors the window and the room and varies a lot; a matte
// one is nearly uniform. Reference photographs (`.197`): glossy parquet
// 0.156-0.218, matte pale wood 0.037-0.051 — there is no single target, it is a
// property of the FINISH, so this is for comparing finishes and looks.
const sd = (a) => {
  if (a.length < 2) return Number.NaN
  const m = mean(a)
  return Math.sqrt(a.reduce((s2, v) => s2 + (v - m) ** 2, 0) / a.length)
}
console.log(
  `  open-floor variation sd/mean = ${(sd(open) / mo).toFixed(3)}   (photographs: matte 0.037-0.051, glossy 0.156-0.218)`,
)
const mf = mean(faces)
console.log(
  `  DOWN-FACING faces = ${mf.toFixed(1)}   face/open = ${(mf / mo).toFixed(3)}   (no photographic target — see .195)`,
)
console.log('')
console.log('reference photographs (.191): 0.579, 0.654, 0.725')
console.log('  a term that lifts this ABOVE ~0.73 is the `.183` underside defect, measured.')
if (OCCLUDE_M >= CEILING_M)
  console.log(`  WARNING: OCCLUDE ${OCCLUDE_M} reaches the ceiling — everything reads as "under".`)
if (under.length < 30 || open.length < 30)
  console.log('  WARNING: too few pooled samples — add standoffs, do not trust this ratio.')
await browser.close()
