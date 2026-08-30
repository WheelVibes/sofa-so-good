/**
 * WINDOW-HOURS — does what you see OUT of the window follow the clock?
 *
 * ⚠️ HEADER CORRECTED v0.31.5.124 — the premise below was true when this probe was
 * written and is NOT true now. It claimed the default `backdrop` is `'city'` (a STATIC
 * palette) and that the sun-driven `sky` alternative is gated behind a `tier: 'pro'`
 * `proceduralSky` flag that Simple mode forces off, so a default user's exterior never
 * changes. Since v0.31.5.92 the default `backdrop` IS `'sky'` (`uiSlice.ts`) and
 * `proceduralSky` is `default: true, tier: 'simple'` (`features/flags/registry.ts`) —
 * this probe's own resolved line now prints `proceduralSky: true,
 * photoBackdropActive: true`. Measured with it: `sky` gives pane p50 116 / 136 / 46 at
 * hours 9 / 13 / 21 while `city` gives 135 / 135 / 113, i.e. the exterior DOES track the
 * clock by default and the static preset is the time-invariant one.
 *
 * That is exactly the kind of "identical readings" meta-rule (xxv) says to VERIFY rather
 * than assume, so this measures it: one fixed pose facing a window, curtains opened once,
 * then hour 9 / 13 / 21 with nothing else touched (meta-rule xvi). Frames are saved for
 * the same crop to be compared offline — an earlier ray-based mask was abandoned because
 * the sky dome is a real scene object (no ray ever "escapes") and the glass reads as
 * opaque to a naive transparency test, so the picture is the more honest instrument here.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
/** Override the backdrop kind (`city` | `dusk` | `park` | `hills` | `sky` | `none`).
 *  Unset = leave the app default alone, which is the arm that matters for a
 *  default-user question. */
const BACKDROP = process.env.BACKDROP || ''
const OUT = process.env.OUT || '/tmp/bath-tile'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  // `runCostBreakdown` is ONE long `evaluate` call, and the paired baseline
  // (PROFILER-PAIRED-BASELINE) roughly doubles its length — past puppeteer's
  // 180 s default `protocolTimeout`, which kills the run mid-sweep with a
  // ProtocolError that looks like a page crash but is only the CDP deadline.
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
// BOOT AS THE DEVICE UNDER TEST. `quality.ts` reads device capabilities ONCE at boot,
// so anything emulated after `goto` is invisible to the veto: an earlier version of this
// probe booted at 1280x800 and only switched to phone viewports later, which showed the
// detector a desktop every time and made the phone veto look broken when it had simply
// never been asked. Set metrics, touch and the pointer media feature BEFORE load.
if (process.env.BOOT_PHONE === '1') {
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
} else {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
}
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
// `quality.ts:readDeviceCapabilities` reads `matchMedia('(pointer: coarse)')`, and
// puppeteer's `setViewport({ isMobile, hasTouch })` does NOT set that media feature —
// so without this a "phone" probe reports a fine pointer and the phone veto in
// `capabilityCeilingTier` never fires, making the ladder look broken when it is the
// harness that is lying. Must be set BEFORE load: capabilities are read once at boot.
if (process.env.COARSE === '1') {
  // Straight to CDP: puppeteer's `emulateMediaFeatures` allowlist rejects `pointer`
  // ("Unsupported media feature"), but the protocol itself supports it, and this is
  // real media emulation rather than a `matchMedia` shim. Sent AFTER the device-metrics
  // override above, which otherwise resets emulated media, and before `goto`.
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'any-pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  })
}
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const TIER = process.env.TIER || 'medium'

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))

fs.mkdirSync(OUT, { recursive: true })

const OUTDIR = process.env.OUT || '/tmp/window-hours'
fs.mkdirSync(OUTDIR, { recursive: true })

// Face the main bedroom window, derived from the plan's own opening (not a guessed pose).
const pose = await page.evaluate(async () => {
  const st = window.__store.getState()
  const plan = st.floorPlan
  const op = (plan.openings ?? []).find((o) => o.kind === 'window' && /mainBedroom/i.test(o.id))
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
  const nx = -uz
  const nz = ux
  const inRoom = (px, pz) =>
    (plan.rooms ?? []).some(
      (r) =>
        px >= r.origin[0] &&
        px <= r.origin[0] + r.width &&
        pz >= r.origin[1] &&
        pz <= r.origin[1] + r.depth,
    )
  let px = cx + nx * 2.2
  let pz = cz + nz * 2.2
  if (!inRoom(px, pz)) {
    px = cx - nx * 2.2
    pz = cz - nz * 2.2
  }
  return { id: op.id, pos: [px, 1.6, pz], yaw: Math.atan2(-(cx - px), -(cz - pz)) }
})
if (!pose) throw new Error('no main-bedroom window opening found')

await page.evaluate(async (q) => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
}, pose)
await new Promise((r) => setTimeout(r, 1200))

if (BACKDROP) {
  await page.evaluate((b) => window.__store.getState().setBackdrop(b), BACKDROP)
  await new Promise((r) => setTimeout(r, 1500))
}

// Force every curtain/blind OPEN, so the only variable across arms is the hour.
// NOT `toggleWindowFixture`: that FLIPS, and since WINDOW-TIME-INVARIANT
// (v0.31.5.88) the default flat already ships `drawAmount: 0`, so a blind toggle
// now CLOSES the very windows this probe exists to look through (meta-rule ci —
// check a new change against the last one). Set the open value explicitly.
const opened = await page.evaluate(() => {
  const st = window.__store.getState()
  const fixtures = (st.items ?? []).filter(
    (it) => it.defId === 'curtains' || it.defId === 'roller-blind',
  )
  for (const it of fixtures) {
    st.updateItemProps(it.id, it.defId === 'curtains' ? { drawAmount: 0 } : { lower: 0 })
  }
  return fixtures.length
})
await new Promise((r) => setTimeout(r, 1500))
// PRINT THE RESOLVED STATE (meta-rule iv) — an arm that silently resolves to a
// different backdrop / camera mode / tier is not the arm you think you ran.
const resolved = await page.evaluate(async () => {
  const st = window.__store.getState()
  const { isPhotoBackdropActive } = await import('/src/scene/SceneBackdrop.tsx')
  const { isFeatureEnabled } = await import('/src/features/featureFlags.ts')
  const fx = (st.items ?? [])
    .filter((it) => it.defId === 'curtains' || it.defId === 'roller-blind')
    .map((it) => `${it.defId}:${it.props?.drawAmount ?? it.props?.lower}`)
  return {
    backdrop: st.backdrop,
    cameraMode: st.cameraMode,
    tier: st.qualityTier,
    uiMode: st.uiMode,
    proceduralSky: isFeatureEnabled('proceduralSky'),
    photoBackdropActive: isPhotoBackdropActive(st.backdrop, st.cameraMode, !!st.customBackdropUrl),
    fixtures: fx.join(' '),
  }
})
console.log(`pose=${pose.id}  resolved=${JSON.stringify(resolved)}`)
console.log(`opened ${opened} window fixtures; sweeping hours with nothing else changed\n`)

for (const hr of [9, 13, 21]) {
  await page.evaluate((h) => window.__store.getState().setManualHour(h), hr)
  await new Promise((r) => setTimeout(r, 1800))
  fs.writeFileSync(
    `${OUTDIR}/h${String(hr).padStart(2, '0')}.png`,
    await page.screenshot({ type: 'png' }),
  )
  console.log(`hour ${String(hr).padStart(2)} captured`)
}

console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
