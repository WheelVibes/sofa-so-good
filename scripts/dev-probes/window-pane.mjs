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
const TIER = process.env.TIER || 'realistic'
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
// PHOTO=1 turns on the user-facing Photographic setting. Since v0.31.5.170 the
// FLAG only ships the toggle; the LOOK is `ui.photographicLook`, off by default.
const PHOTO = process.env.PHOTO === '1'
// FAKENOW='2026-08-31T13:00:00+08:00' freezes the page clock BEFORE load, which is
// the only way to exercise a boot-time guard like `ensureDaylightFirstPaint` at an
// hour other than the one the probe happens to run at.
const FAKENOW = process.env.FAKENOW || ''
// ROOM='Bath' stands at a named room's centroid instead of at a window. The
// windowless rooms — bathrooms, corridor, household shelter — are where a
// fixtures-off rule is most likely to leave a user in the dark, and they cannot
// be reached by the window-standoff pose at all.
const ROOM = process.env.ROOM || ''
// YAW (radians) aims the ROOM pose; a room centroid facing yaw 0 often ends up
// nose-to-cabinet in a narrow room like the kitchen.
const YAW = process.env.YAW ? Number(process.env.YAW) : null
// SWEEP replaces the fixed arm list with `;`-separated arms of `key=value` pairs,
// so any pane-material property can be A/B'd live at ONE pose in ONE run:
//   SWEEP='roughness=0.1;roughness=0;color=#ffffff,roughness=0'
// Keys: `color` / `attenuationColor` (hex), `roughness` / `ei` / `metalness` /
// `transmission` (number), `toneMapped` (0/1). Anything absent from an arm is
// restored to the SHIPPED value, so each arm differs from shipped in exactly the
// listed variables and no state leaks between arms. Added for GLASS-CLARITY
// (v0.33.0.10), where `roughness` — long documented as inert — had to be
// re-measured now that the estate is real geometry behind the pane rather than a
// PMREM-blurred sky with no detail to blur.
const SWEEP = process.env.SWEEP || ''
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
await page.evaluateOnNewDocument(
  (flags, fakeNow) => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
      if (flags) localStorage.setItem('hdb_feature_flags', flags)
    } catch {}
    if (fakeNow) {
      const fixed = new Date(fakeNow).getTime()
      const RealDate = Date
      // biome-ignore lint/suspicious/noGlobalAssign: probe-only clock freeze
      Date = class extends RealDate {
        constructor(...a) {
          super(...(a.length ? a : [fixed]))
        }
        static now() {
          return fixed
        }
      }
    }
  },
  FLAGS,
  FAKENOW,
)
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
    // INTERACTIVE-DEGRADE OFF: `InteractiveDprController` halves the raw GL pixel ratio
    // whenever it sees long frames and heals it back later, INVISIBLY to r3f state. Left on,
    // consecutive arms are captured at different render resolutions, which moves any
    // sharpness statistic (a repeated shipped arm measured micro-contrast 1.86 then 1.27,
    // a bigger swing than the roughness sweep itself). Every scenario in `scripts/scenarios`
    // that measures pixels turns it off for the same reason.
    s.setFeatureFlag?.('interactiveDegrade', false)
  },
  { h: HOUR, t: TIER },
)
if (WALKFOV) await page.evaluate((f) => window.__store.getState().setWalkFov(f), WALKFOV)
if (BACKDROP) await page.evaluate((b) => window.__store.getState().setBackdrop(b), BACKDROP)
if (LIGHTS) await page.evaluate((v) => window.__store.getState().setLightsMode(v), LIGHTS)
if (PHOTO) await page.evaluate(() => window.__store.getState().setPhotographicLook(true))
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
    if (q.room) {
      const r = (plan.rooms ?? []).find((x) =>
        new RegExp(q.room, 'i').test(`${x.name ?? ''} ${x.id}`),
      )
      if (!r) return null
      return {
        id: r.name ?? r.id,
        px: r.origin[0] + r.width / 2,
        pz: r.origin[1] + r.depth / 2,
        yaw: q.yaw ?? 0,
      }
    }
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
  { win: WINDOW, standoff: STANDOFF, room: ROOM, yaw: YAW },
)
if (!pose) throw new Error(`no ${ROOM ? 'room' : 'window'} matching /${ROOM || WINDOW}/i`)
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
  // CLEAR panes only for the sweep: the frosted/textured kinds carry their own colour and
  // a deliberately higher roughness (`Math.max` in the pane JSX), so an arm that also
  // rewrote them would not correspond to any shippable source change.
  window.__paneClear = panes.map((m) => (m.roughness ?? 1) <= 0.2)
  window.__paneShipped = panes.map((m) => ({
    color: m.color.getHex(),
    emissive: m.emissive.getHex(),
    ei: m.emissiveIntensity,
    toneMapped: m.toneMapped,
    roughness: m.roughness,
    metalness: m.metalness,
    transmission: m.transmission,
    attenuationColor: m.attenuationColor?.getHex(),
  }))
  return panes.map((m) => ({
    type: m.type,
    color: `#${m.color.getHexString()}`,
    ei: m.emissiveIntensity,
    transmission: m.transmission ?? 0,
    roughness: m.roughness,
  }))
})
if (!found.length && !ROOM) {
  throw new Error('no sky-catch pane materials found — pose or tier suspect')
}

// The pane's `useFrame` (`apartment/Window.tsx`, `apartment/PlanShell.tsx`) rewrites
// `color`, `emissiveIntensity` and `transmission` EVERY frame from daylight, so a value
// assigned from an `evaluate` is gone before the next draw — the exact race `warm-cast.mjs`
// documents ("an interval reports a byte-identical no-op"). The only point guaranteed to be
// after that write and before the draw is inside `renderer.render`, so wrap it and re-apply
// the current arm there. `roughness` is NOT written per frame and would have landed either
// way; everything else needs this.
await page.evaluate(() => {
  const gl = window.__three.gl
  const orig = gl.render.bind(gl)
  window.__paneArm = {}
  gl.render = (...args) => {
    const p = window.__paneArm || {}
    window.__panes.forEach((m, i) => {
      if (!window.__paneClear[i]) return
      const s = window.__paneShipped[i]
      m.color.setHex(p.color ?? s.color)
      m.emissiveIntensity = p.ei ?? s.ei
      m.toneMapped = p.toneMapped ?? s.toneMapped
      if (s.roughness !== undefined) m.roughness = p.roughness ?? s.roughness
      if (s.metalness !== undefined) m.metalness = p.metalness ?? s.metalness
      if (s.transmission !== undefined) m.transmission = p.transmission ?? s.transmission
      if (s.attenuationColor !== undefined)
        m.attenuationColor.setHex(p.attenuationColor ?? s.attenuationColor)
    })
    return orig(...args)
  }
})
console.log(
  `window-pane  tier=${TIER} hour=${HOUR} window=${pose.id} standoff=${STANDOFF}m backdrop=${BACKDROP || '(default)'}`,
)
const boot = await page.evaluate(() => {
  const st = window.__store.getState()
  return { lightsMode: st.lightsMode, timeMode: st.timeMode, hour: st.manualHour }
})
console.log(`boot: ${JSON.stringify(boot)}`)
console.log(`panes: ${JSON.stringify(found)}\n`)

const canvasEl = await page.$('canvas')

const HEX_KEYS = new Set(['color', 'attenuationColor'])
/** `roughness=0,color=#ffffff` -> `{ roughness: 0, color: 0xffffff }`. */
function parseArm(spec) {
  const patch = {}
  for (const pair of spec.split(',')) {
    const [k, v] = pair.split('=').map((x) => x.trim())
    if (!k) continue
    patch[k] = HEX_KEYS.has(k)
      ? Number.parseInt(v.replace('#', ''), 16)
      : k === 'toneMapped'
        ? v !== '0'
        : Number(v)
  }
  return patch
}

const ARMS = SWEEP
  ? SWEEP.split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((spec, i) => [
        `s${String(i + 1).padStart(2, '0')}-${spec.replace(/[^\w.=-]+/g, '_')}`,
        parseArm(spec),
      ])
  : [
      ['a-shipped', {}],
      ['b-emissive-off', { ei: 0 }],
      ['c-untinted', { color: 0xffffff }],
      ['d-skycatch-0_8', { ei: 0.8 }],
      ['e-hdr-skycatch', { ei: 1.6, toneMapped: false }],
      ['f-untinted-hdr', { color: 0xffffff, ei: 1.6, toneMapped: false }],
    ]
for (const [name, patch] of ARMS.slice(0, ROOM && !SWEEP ? 1 : ARMS.length)) {
  await page.evaluate((p) => {
    // Publish the arm; the `gl.render` wrap above applies it after the pane's own
    // per-frame write. Anything absent falls back to the shipped snapshot, so each arm
    // differs from shipped in exactly the listed variables and no state leaks forward.
    window.__paneArm = p
    window.__panes.forEach((m, i) => {
      if (window.__paneClear[i]) m.needsUpdate = true
    })
  }, patch)
  await new Promise((r) => setTimeout(r, 1500))
  // Read the LIVE values after the settle, i.e. after the wrap has re-applied the arm over
  // the pane's own per-frame write — reading them straight after publishing would report the
  // shipped values and hide a no-op arm.
  const state = await page.evaluate(() => {
    const i = window.__paneClear.findIndex(Boolean)
    const m = window.__panes[i]
    if (!m) return { panes: 0 }
    return {
      color: `#${m.color.getHexString()}`,
      ei: m.emissiveIntensity,
      toneMapped: m.toneMapped,
      roughness: m.roughness,
      transmission: Number(m.transmission?.toFixed(3)),
      // The render resolution the arm was actually captured at — see the degrade note above.
      dpr: window.__three.gl.getPixelRatio(),
    }
  })
  // Capture the CANVAS element, not the page: v0.31.5.182 found every
  // frame-level number in this arc contaminated by the bright toolbar and
  // minimap. Region crops were never affected, but `%<64` and frame means were.
  fs.writeFileSync(`${OUT}/${name}.png`, await (canvasEl ?? page).screenshot({ type: 'png' }))
  console.log(`  ${name.padEnd(16)} ${JSON.stringify(state)}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
