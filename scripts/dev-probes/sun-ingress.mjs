/**
 * SUN-INGRESS — does DIRECT sun ever reach the floor through a window?
 *
 * The whole photoreal arc was measured at 13:00, which in Singapore (1.35°N) puts
 * the sun at **82° altitude** — near-vertical, and therefore the single worst hour
 * for daylight to enter a vertical window. Golden hour (≈18:00–19:00 local, 16° →
 * 2°) is where professional interior renders live, and `altitudeCurve.ts` still
 * grades the sun at 0.85 intensity with a warm [1, 0.92, 0.78] tint at 10°, on a
 * `castShadow` directional light. So a low warm sun SHOULD throw a window-shaped
 * patch across the floor.
 *
 * Whether it does depends on which way the window faces — which is why this probe
 * sweeps the plan ORIENTATION rather than the hour. At a fixed hour and a fixed
 * pose just inside one window, rotating the building 0/90/180/270 guarantees that
 * one arm points that window at the sun. Lights are OFF in every arm, so the only
 * illumination is daylight.
 *
 * Reads: a direct sun patch is a LOCAL bright region, so it shows up as a jump in
 * the floor band's spread (sd, p99−p50), not just its mean. If no orientation
 * produces one, direct sun does not enter the room at all.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 18)
const TIER = process.env.TIER || 'maximum'
const WINDOW = process.env.WINDOW || 'livingDining'
const STANDOFF = Number(process.env.STANDOFF || 2.6)
const PITCH = Number(process.env.PITCH || -0.3)
const WALKFOV = process.env.WALKFOV ? Number(process.env.WALKFOV) : null
const FACE = process.env.FACE || 'in'
const ORIENTS = (process.env.ORIENTS || '0,90,180,270').split(',').map(Number)
const OUT = process.env.OUT || '/tmp/sun-ingress'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
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
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.setLightsMode('off')
  st.dismissCallout?.('walk-mode')
})
if (WALKFOV) await page.evaluate((f) => window.__store.getState().setWalkFov(f), WALKFOV)
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

// Curtains/blinds fully open, so an arm is never dark merely because something
// is hanging over the glass (the trap `window-hours` documents).
const opened = await page.evaluate(() => {
  const st = window.__store.getState()
  const fx = (st.items ?? []).filter((it) => it.defId === 'curtains' || it.defId === 'roller-blind')
  for (const it of fx)
    st.updateItemProps(it.id, it.defId === 'curtains' ? { drawAmount: 0 } : { lower: 0 })
  // A `window-mesh-screen` is a SEPARATE fixture that covers the glass and is not
  // a curtain — leaving it in place makes the pane read as a flat frosted panel
  // and would be mistaken for the glass material's own doing.
  const screens = (st.items ?? []).filter((it) => it.defId === 'window-mesh-screen')
  if (screens.length)
    st.setItems((st.items ?? []).filter((it) => it.defId !== 'window-mesh-screen'))
  const windowBound = (st.items ?? [])
    .filter((it) => /window|curtain|blind|screen|grille/i.test(it.defId))
    .map((it) => it.defId)
  return { curtains: fx.length, screens: screens.length, windowBound }
})

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
    const tx = cx + nx * (q.standoff + 4)
    const tz = cz + nz * (q.standoff + 4)
    const yawIn = Math.atan2(-(tx - px), -(tz - pz))
    // FACE=out turns around to look BACK at the window wall — the only way to
    // see whether the opening is a real gap that sky and sun come through, as
    // opposed to a hole that shadow-casting geometry still seals.
    return { id: op.id, px, pz, yaw: q.face === 'out' ? yawIn + Math.PI : yawIn }
  },
  { win: WINDOW, standoff: STANDOFF, face: FACE },
)
if (!pose) throw new Error(`no window opening matching /${WINDOW}/i`)

console.log(
  `sun-ingress  tier=${TIER} hour=${HOUR} window=${pose.id} standoff=${STANDOFF}m pitch=${PITCH} face=${FACE}`,
)
console.log(`window fixtures: ${JSON.stringify(opened)}; lights OFF in every arm\n`)

// What the pane actually IS, so a flat-looking window is diagnosed rather than
// guessed at: a `transmission > 0` MeshPhysicalMaterial should show the sky
// through it, a plain MeshStandardMaterial never can.
const glass = await page.evaluate(() => {
  const out = []
  const seen = new Set()
  window.__three.scene.traverse((o) => {
    const m = o.material
    if (!m || Array.isArray(m)) return
    const isGlassy = m.transmission > 0 || (m.transparent && m.opacity < 1)
    if (!isGlassy) return
    const key = `${m.type}|${m.transmission ?? 0}|${m.opacity}|${m.color?.getHexString?.()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      node: o.name || o.type,
      type: m.type,
      transmission: m.transmission ?? 0,
      opacity: m.opacity,
      color: m.color?.getHexString?.(),
      emissive: m.emissive?.getHexString?.(),
      emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness,
      ior: m.ior,
    })
  })
  return out
})
console.log('glassy materials in the scene:')
for (const g of glass) console.log(`  ${JSON.stringify(g)}`)
console.log('')

for (const deg of ORIENTS) {
  await page.evaluate((d) => window.__store.getState().setOrientationDeg(d), deg)
  // Re-teleport AFTER the rotation: the plan is rotated about its centre, so a
  // pose captured in plan coordinates must be re-applied to land in the same
  // place relative to the window.
  await page.evaluate(
    async (q) => {
      const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
      requestWalkTeleport(q.px, q.pz, q.yaw)
      window.__walkLook?.setPitch(q.pitch)
    },
    { ...pose, pitch: PITCH },
  )
  // The lighting rig TWEENS towards its target, so a short settle would sample
  // the sun mid-ramp and read as a weaker patch than the scene really has.
  await new Promise((r) => setTimeout(r, 4000))
  const sun = await page.evaluate(() => {
    const st = window.__store.getState()
    return { orientationDeg: st.orientationDeg, lights: st.lightsMode, hour: st.manualHour }
  })
  fs.writeFileSync(`${OUT}/orient-${deg}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  orient-${String(deg).padEnd(4)} ${JSON.stringify(sun)}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
