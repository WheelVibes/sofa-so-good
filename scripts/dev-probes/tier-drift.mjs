/**
 * TIER-DRIFT — does the adaptive ladder move the tier during a long walk, and does the
 * interior get darker when it does?
 *
 * A 44-frame walk tour came back with every interior dark grey (bath1 mean luminance 78.8)
 * while the SAME room from a short probe reads 193.9 — a 2.5x difference in nominal-identical
 * conditions (walk, medium, 13:00). Geometry and materials are identical in both frames, so it
 * is a LIGHTING-state difference, and the obvious suspect is `QualityController`'s adaptive
 * ladder demoting under the load of a long run: `performance` mounts no IBL probe, and an
 * interior lit only by hemisphere + ambient is exactly this much darker.
 *
 * Rather than assume, this holds ONE pose and samples repeatedly while doing tour-like work
 * (teleports + screenshots), reporting the LIVE tier, whether `scene.environment` is present,
 * the graded exposure and the frame's mean each time. If the tier moves, the label a probe
 * prints at startup is not the tier its later frames were captured at — which would make every
 * long probe's frames suspect (meta-rule iv).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
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

const OUTDIR = process.env.OUT || '/tmp/tier-drift'
fs.mkdirSync(OUTDIR, { recursive: true })

const pose = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  for (const id of Object.keys(ROOMS)) {
    if (!/bath1/i.test(id)) continue
    const shell = getRoomEditorShell(plan, id)?.shell
    if (shell?.center) return { id, pos: [shell.center[0], 1.6, shell.center[1]] }
  }
  return null
})
if (!pose) throw new Error('bath1 not found')

const sample = async (label) => {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], 0)
  }, pose)
  await new Promise((r) => setTimeout(r, 900))
  const st = await page.evaluate(() => ({
    tier: window.__store.getState().qualityTier,
    // `performance` mounts no IBL probe — the single biggest interior-brightness lever.
    env: !!window.__three.scene.environment,
    exposure: +window.__three.gl.toneMappingExposure.toFixed(3),
    hour: window.__store.getState().manualHour,
    mode: window.__store.getState().timeMode,
  }))
  const png = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUTDIR}/${label}.png`, png)
  return st
}

const rows = []
rows.push(['start', await sample('start')])

// Tour-like load: many teleports + screenshots, which is what the 44-frame run did.
for (let round = 1; round <= 4; round++) {
  for (let i = 0; i < 6; i++) {
    // `i` is a NODE-side value — it is not visible inside the browser callback, so it has
    // to be passed in (the same trap the playbook records for probe callbacks).
    await page.evaluate(
      async (a) => {
        const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
        requestWalkTeleport(a.pos[0] + a.jitter, a.pos[2] - a.jitter, a.yaw)
      },
      { pos: pose.pos, yaw: i, jitter: (i % 3) * 0.2 - 0.2 },
    )
    await new Promise((r) => setTimeout(r, 400))
    await page.screenshot({ type: 'png' })
  }
  rows.push([`after ${round * 6} teleports`, await sample(`r${round}`)])
}

console.log('when                    tier         IBL    exposure  hour/mode')
for (const [k, v] of rows) {
  console.log(
    `${k.padEnd(23)} ${String(v.tier).padEnd(12)} ${String(v.env).padEnd(6)} ${String(v.exposure).padEnd(9)} ${v.hour}/${v.mode}`,
  )
}
console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
