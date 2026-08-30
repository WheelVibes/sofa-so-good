/**
 * UNDERSIDE-SHADOW — is the floor under the furniture as dark as it is in a photograph?
 *
 * `.183` refused the hemisphere ground-bounce term on a judgement made by eye:
 * at x4.5 "the undersides of the TV console and the coffee table are visibly
 * lighter than a piece of furniture sitting on a floor in shadow should be". That
 * is the right objection and the wrong kind of evidence — it cannot be re-checked
 * at a different gain, and `.190` showed the whole-floor term is the only one left
 * that fits the physics, so the objection now has to be falsifiable.
 *
 * The measurable form of "sitting on a floor in shadow" is the SHADOWED FLOOR
 * BENEATH a piece against the LIT FLOOR beside it — same material, so the ratio
 * is a shadow measurement and not an albedo one. Measured in the reference
 * photographs (`.191`): parquet 0.725, pale wood 0.654 and 0.579, i.e. real
 * furniture sits over floor at roughly **0.58-0.73** of the open floor beside it.
 *
 * The mask is GEOMETRIC, never a screen rectangle — `.181` spent two rounds on a
 * "floor" band that was furniture. A sample is kept only if the ray hit a
 * near-horizontal, up-facing surface at floor height; it is then classified by
 * casting a second ray straight UP from that point and asking whether anything
 * solid sits within `OCCLUDE_M` of it.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'medium'
const PHOTO = process.env.PHOTO === '1'
const STANDOFF = Number(process.env.STANDOFF || 4.6)
/** Pitched down: the floor has to be most of the frame for this to have samples. */
const PITCH = Number(process.env.PITCH || -0.5)
const GRID = Number(process.env.GRID || 90)
/** `in` looks away from the window, into the room where the furniture is; `out`
 *  looks back at the window, matching `light-distribution.mjs`'s pose. */
const DIR = process.env.DIR || 'in'
/**
 * How close overhead something must be to count as "this floor is under it".
 *
 * MUST stay below ceiling height. The upward ray hits the CEILING like anything
 * else, so at `OCCLUDE=4.0` every floor sample in the room classifies as "under
 * furniture" (measured: 332 under / 0 open) and the ratio silently becomes 1.
 */
const OCCLUDE_M = Number(process.env.OCCLUDE || 1.5)
/** Rough interior ceiling height; only used to warn about the trap above. */
const CEILING_M = 2.4
const OUT = process.env.OUT || '/tmp/underside-shadow'

fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

await page.evaluate(
  ({ h, t, photo }) => {
    const s = window.__store.getState()
    s.setQualityTier(t)
    s.setTimeMode?.('manual')
    s.setManualHour?.(h)
    s.setCameraMode?.('firstPerson')
    s.setPhotographicLook?.(photo)
  },
  { h: HOUR, t: TIER, photo: PHOTO },
)
await new Promise((r) => setTimeout(r, 1200))

// Stand back from the living/dining window, pitched down at the floor.
//
// Pose goes through the app's OWN walk-teleport signal and `__walkLook`, never a
// direct `camera.lookAt`: `FirstPersonCamera` rewrites the camera's orientation
// every frame from its own yaw/pitch state, so a hand-set orientation is stomped
// before the next render. Measured — a `DIR=in` and a `DIR=out` run came back
// byte-identical (333/7 samples, 0.689 both) while the direct call was in place,
// which is a mechanism silently not firing rather than a scene fact.
const pose = await page.evaluate(
  ({ standoff, dir }) => {
    const s = window.__store.getState()
    const plan = s.floorPlan
    const op = (plan?.openings ?? []).find((o) => o.kind === 'window')
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
    // `out` faces the window (matching `light-distribution.mjs`); `in` faces the
    // room behind the camera, which is where the furniture is.
    const yawOut = Math.atan2(-(cx - px), -(cz - pz))
    return { px, pz, yaw: dir === 'out' ? yawOut : yawOut + Math.PI }
  },
  { standoff: STANDOFF, dir: DIR },
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
await new Promise((r) => setTimeout(r, 2500))

await assertSceneAlive(page, 'underside-shadow')

async function sampleFloor() {
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
          const r = rc.intersectObjects(scene.children, true)
          const h = r.find((k) => solid(k.object))
          if (!h?.face) continue
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          // Floor only: up-facing, and at floor height.
          if (n.y < 0.9 || h.point.y > 0.15) continue
          // Is something solid directly overhead, close enough to shade it?
          rc.set(h.point.clone().addScaledVector(up, 0.02), up)
          rc.far = occlude
          const above = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          rc.far = Infinity
          out.push({ x, y, under: !!above, gap: above ? +above.distance.toFixed(2) : null })
        }
      }
      return out
    },
    { g: GRID, occlude: OCCLUDE_M },
  )
}

/**
 * The raycast pass is retried until it actually finds floor. Under machine load
 * a fixed settle sleep is not enough — streaming can still be committing — and
 * the failure mode is an EMPTY sample set, which reads exactly like "this pose
 * sees no floor". Retrying separates the two: a pose that is genuinely wrong
 * stays empty through every attempt.
 */
let hits = []
for (let attempt = 1; attempt <= 6; attempt++) {
  hits = await sampleFloor()
  if (hits.length >= 50) break
  console.log(`  attempt ${attempt}: ${hits.length} floor samples, waiting…`)
  await new Promise((r) => setTimeout(r, 2000))
}

const shot = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/frame.png`, shot)
const sharp = (await import('sharp')).default
const img = sharp(shot)
const meta = await img.metadata()
const raw = await img.raw().toBuffer()
const ch = raw.length / (meta.width * meta.height)

const under = []
const open = []
for (const h of hits) {
  const px = Math.min(meta.width - 1, Math.floor(h.x * meta.width))
  const py = Math.min(meta.height - 1, Math.floor(h.y * meta.height))
  const o = (py * meta.width + px) * ch
  const l = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2]
  ;(h.under ? under : open).push(l)
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
    dir: DIR,
    pose,
    occludeM: OCCLUDE_M,
  }),
)
console.log(`frame -> ${OUT}/frame.png`)
console.log('')
console.log(`floor samples: under furniture ${under.length}, open floor ${open.length}`)
console.log(
  `  under = ${mu.toFixed(1)}   open = ${mo.toFixed(1)}   under/open = ${(mu / mo).toFixed(3)}`,
)
console.log('')
console.log('reference photographs (.191): 0.579, 0.654, 0.725')
console.log('  a term that lifts this ABOVE ~0.73 is the `.183` underside defect, measured.')
if (OCCLUDE_M >= CEILING_M)
  console.log(
    `  WARNING: OCCLUDE ${OCCLUDE_M} reaches the ceiling — every floor sample will read as "under".`,
  )
if (under.length < 20 || open.length < 20)
  console.log('  WARNING: too few samples in one class. Floor that is BOTH under furniture and')
console.log('  visible from standing eye height is rare, so this is a limit of the classifier,')
console.log('  not necessarily a bad pose. See the .191 entry in the research doc.')
await browser.close()
