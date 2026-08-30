/**
 * WINDOW-PANE — why does a window read as a pale panel instead of a view?
 *
 * `.146` measured, looking back at the living-room window from across the room at
 * golden hour, that the brightest pane pixel is **197 / 255**. In an interior
 * photograph the window is the blown-out brightest thing in the frame, because the
 * exterior is one to two orders of magnitude brighter than the room. The pane is
 * real glass on Maximum (`MeshPhysicalMaterial`, transmission 0.92, ior 1.5) but it
 * also carries `color #bcd4e6` (which tints everything transmitted) and a flat
 * `emissive #cfe4f5` at `glassSkyCatchIntensity(daylight) = daylight * 0.4` — the
 * RZ2 sky-catch, which exists so panes are not flat dark rectangles on the cheap
 * tiers that have no transmission at all.
 *
 * Arms at ONE pose, each differing from shipped in exactly one variable, mutating
 * the DRAWN material only (nothing is written to the store or to source):
 *   shipped · emissive off · untinted white body · brighter sky-catch · HDR sky-catch
 *
 * Reads: pane mean and MAX luma (a real window clips), plus the frames themselves.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'maximum'
const WINDOW = process.env.WINDOW || 'livingDining'
const STANDOFF = Number(process.env.STANDOFF || 4.0)
const PITCH = Number(process.env.PITCH || -0.15)
const WALKFOV = process.env.WALKFOV ? Number(process.env.WALKFOV) : null
// WINDOW-SKY-DEFAULT (v0.31.5.92) made `sky` the default over `city` because the
// static city preset paints lit tower windows at EVERY hour. Setting BACKDROP=city
// here is how you see what content behind the glass would buy, and what that
// recorded defect costs, at a given hour.
const BACKDROP = process.env.BACKDROP || ''
// CURTAINPROPS='{"pattern":"herringbone"}' — re-prop every curtain in the flat.
// The default plan hangs PLAIN cotton, and the reference photograph's curtains
// are a patterned jacquard, so "the app's curtains are flatter" may be a content
// choice rather than a renderer gap. This is how that is separated.
const CURTAINPROPS = process.env.CURTAINPROPS || ''
// LIGHTS=off isolates the lamps. Surface relief only becomes image contrast when
// something DIRECTIONAL modulates it, so this is how "the textiles are flat"
// gets separated from "the fill has no direction".
const LIGHTS = process.env.LIGHTS || ''
// FLAGS='{"photographicFill":true}' — seeded into localStorage BEFORE load, since
// `resolveFlags` reads the overrides map once at boot.
const FLAGS = process.env.FLAGS || ''
const OUT = process.env.OUT || '/tmp/window-pane'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument((flags) => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
    if (flags) localStorage.setItem('hdb_feature_flags', flags)
  } catch {}
}, FLAGS)
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
    s.dismissCallout?.('walk-mode')
  },
  { h: HOUR, t: TIER },
)
if (WALKFOV) await page.evaluate((f) => window.__store.getState().setWalkFov(f), WALKFOV)
if (BACKDROP) await page.evaluate((b) => window.__store.getState().setBackdrop(b), BACKDROP)
if (LIGHTS) await page.evaluate((v) => window.__store.getState().setLightsMode(v), LIGHTS)
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

// Curtains/blinds open in every arm, so a dim pane is never just something hanging
// over the glass (the trap `window-hours` documents).
await page.evaluate(
  (extra) => {
    const st = window.__store.getState()
    for (const it of st.items ?? []) {
      if (it.defId === 'curtains') st.updateItemProps(it.id, { drawAmount: 0, ...extra })
      if (it.defId === 'roller-blind') st.updateItemProps(it.id, { lower: 0 })
    }
  },
  CURTAINPROPS ? JSON.parse(CURTAINPROPS) : {},
)

// Stand back from the named window and turn round to FACE it.
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

// Grab every pane material (there are several windows) and remember shipped state.
const found = await page.evaluate(() => {
  const panes = []
  window.__three.scene.traverse((o) => {
    const m = o.material
    if (!m || Array.isArray(m)) return
    // Match on the sky-catch emissive COLOUR alone. Gating on transmission or on
    // emissiveIntensity > 0 finds nothing at night, when the curve drives both
    // down — which looks like "no panes" rather than "night".
    if (!m.emissive) return
    if (`#${m.emissive.getHexString()}` !== '#cfe4f5') return
    panes.push(m)
  })
  window.__panes = panes
  window.__paneShipped = panes.map((m) => ({
    color: m.color.getHex(),
    emissive: m.emissive.getHex(),
    ei: m.emissiveIntensity,
    toneMapped: m.toneMapped,
  }))
  return panes.map((m) => ({
    type: m.type,
    color: `#${m.color.getHexString()}`,
    ei: m.emissiveIntensity,
    transmission: m.transmission ?? 0,
  }))
})
if (!found.length) throw new Error('no sky-catch pane materials found — pose or tier suspect')
console.log(
  `window-pane  tier=${TIER} hour=${HOUR} window=${pose.id} standoff=${STANDOFF}m backdrop=${BACKDROP || '(default)'}`,
)
console.log(`panes: ${JSON.stringify(found)}\n`)

const ARMS = [
  ['a-shipped', {}],
  ['b-emissive-off', { ei: 0 }],
  ['c-untinted', { color: 0xffffff }],
  ['d-skycatch-0_8', { ei: 0.8 }],
  ['e-hdr-skycatch', { ei: 1.6, toneMapped: false }],
  ['f-untinted-hdr', { color: 0xffffff, ei: 1.6, toneMapped: false }],
]
for (const [name, patch] of ARMS) {
  const state = await page.evaluate((p) => {
    window.__panes.forEach((m, i) => {
      const s = window.__paneShipped[i]
      m.color.setHex(p.color ?? s.color)
      m.emissiveIntensity = p.ei ?? s.ei
      m.toneMapped = p.toneMapped ?? s.toneMapped
      m.needsUpdate = true
    })
    const m = window.__panes[0]
    return {
      color: `#${m.color.getHexString()}`,
      ei: m.emissiveIntensity,
      toneMapped: m.toneMapped,
    }
  }, patch)
  await new Promise((r) => setTimeout(r, 1500))
  fs.writeFileSync(`${OUT}/${name}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  ${name.padEnd(16)} ${JSON.stringify(state)}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
