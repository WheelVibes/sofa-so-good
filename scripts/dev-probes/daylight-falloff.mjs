/**
 * DAYLIGHT-FALLOFF — how far into the room does window light actually reach?
 *
 * v0.31.5.135 attributed the app's missing shadow depth: the FIXTURES are what
 * lift the blacks (`%<64` 1.7 → 7.8 with them off), but switching them off is not
 * the fix, because it also drops `p50` 180 → 112 and the room goes dim — the
 * DEFAULT-GLOOM failure the lights-on default was signed off to prevent. Real
 * interior photographs hold BOTH: `%<64` 11–12 **and** `p50` 155–189, carried by
 * daylight rather than lamps. So the lamps are a compensation for weak
 * window-light transport, and the flat picture is the bill.
 *
 * This measures the transport directly, with the lamps OFF so only daylight is in
 * play. It also closes an instrument gap noted in `.134`: `walk-tour` stands at
 * eye height with a −0.05 pitch, so the floor is barely in frame and floor
 * realism cannot be judged at all. Here the camera stands just inside the window
 * looking INTO the room and pitched down, so the floor recedes across the frame
 * and a horizontal band maps to a distance from the window.
 *
 * The shape of the falloff is the diagnostic, and it needs no external ground
 * truth: bare inverse-square from a window plane falls off far faster than a real
 * room, because a real room's far end is carried by light bouncing off its own
 * walls and ceiling. **A steep curve means the bounce is missing; a shallow one
 * means the shortfall is in absolute intensity, not transport.**
 *
 * Arms (same pose, one variable each, reset between):
 *   `a-daylight`      lamps off — daylight alone, the thing under test
 *   `b-daylight-noibl` lamps off + IBL off — how much of daylight IS the probe
 *   `c-lamps-on`      the shipped default, for reference
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'maximum'
/** Matched against opening ids; the boot flat's L/D window is `win-livingDining-*`. */
const WINDOW = process.env.WINDOW || 'livingDining'
/** Metres inside the glass to stand. Close, so the room recedes away from it. */
const STANDOFF = Number(process.env.STANDOFF || 0.9)
const PITCH = Number(process.env.PITCH || -0.55)
const OUT = process.env.OUT || '/tmp/daylight-falloff'
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
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

// Curtains/blinds fully open, so the arms differ only in the light, not in what
// is covering the glass (the same trap `window-hours` documents).
const opened = await page.evaluate(() => {
  const st = window.__store.getState()
  const fx = (st.items ?? []).filter((it) => it.defId === 'curtains' || it.defId === 'roller-blind')
  for (const it of fx)
    st.updateItemProps(it.id, it.defId === 'curtains' ? { drawAmount: 0 } : { lower: 0 })
  return fx.length
})

/** Stand just inside the named window, facing INTO the room. Yaw uses the same
 *  `atan2(-dx, -dz)` convention as `walk-tour`. */
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
    // Point the normal at whichever side is actually inside the flat.
    if (!inRoom(cx + nx * 1.2, cz + nz * 1.2)) {
      nx = -nx
      nz = -nz
    }
    const px = cx + nx * q.standoff
    const pz = cz + nz * q.standoff
    // Aim deeper into the room along the same normal.
    const tx = cx + nx * (q.standoff + 4)
    const tz = cz + nz * (q.standoff + 4)
    return { id: op.id, px, pz, yaw: Math.atan2(-(tx - px), -(tz - pz)) }
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

console.log(
  `daylight-falloff  tier=${TIER} hour=${HOUR} window=${pose.id} standoff=${STANDOFF}m pitch=${PITCH}`,
)
console.log(`opened ${opened} window fixtures\n`)

for (const arm of ['a-daylight', 'b-daylight-noibl', 'c-lamps-on']) {
  await page.evaluate(() => {
    const st = window.__store.getState()
    st.setLightsMode('on')
    st.resetQualityOverrides()
  })
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate((id) => {
    const st = window.__store.getState()
    if (id === 'a-daylight') st.setLightsMode('off')
    if (id === 'b-daylight-noibl') {
      st.setLightsMode('off')
      st.setQualityOverride('ibl', false)
    }
  }, arm)
  await new Promise((r) => setTimeout(r, 2500))
  const resolved = await page.evaluate(() => {
    const st = window.__store.getState()
    return {
      lights: st.lightsMode,
      ibl: st.qualityOverrides?.ibl ?? '(unset)',
      tier: st.qualityTier,
      hour: st.manualHour,
    }
  })
  fs.writeFileSync(`${OUT}/${arm}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  ${arm.padEnd(18)} ${JSON.stringify(resolved)}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
