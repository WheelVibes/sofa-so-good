/**
 * TILE-BREAKUP — what does the pro-only tile break-up actually do to a DEFAULT floor?
 *
 * The Simple/Pro audit turned up `tileBreakup` ("Tile repetition break-up") sitting at
 * `tier: 'pro'`. Unlike most of the 108 pro flags — drawings, checks, quotes, AI, editors,
 * all correctly professional — this one is PASSIVE rendering quality: `RoomFloor.tsx` and
 * `PlanRoomFloor.tsx` read it through `isFeatureEnabled` when they build the floor, and
 * the default flat has tiled floors in the kitchen, both bathrooms and the shelter. So a
 * default (Simple) user gets mechanically repeating tiles, which is a classic CG tell.
 *
 * `resolveFlags` puts the `tier === 'pro' && uiMode === 'simple'` branch BEFORE the
 * override branch, so a Simple user cannot enable it even with a dev override — that part
 * is settled by reading the resolver, not by measurement. What needs measuring is the
 * other half: how much difference the flag actually makes. Both arms therefore run in PRO
 * mode and differ in exactly one flag (meta-rule xvi), set via the `?ff=` override BEFORE
 * boot because the floor bakes the value at build time (meta-rule x/iv — a runtime toggle
 * would leave the already-built floor stale and measure nothing).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)

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
// The floor BAKES the flag at build time, so both the ui mode and the single-flag
// override must be in place BEFORE the app boots — a runtime toggle would leave the
// already-built floor stale and measure nothing (meta-rule x/iv).
await page.evaluateOnNewDocument((mode) => {
  try {
    localStorage.setItem('sofa.editor.v1', JSON.stringify({ uiMode: mode }))
  } catch {}
}, 'pro')
const BREAKUP = process.env.BREAKUP === '0' ? 'off' : 'on'
const url = `${appUrl()}${appUrl().includes('?') ? '&' : '?'}ff=tileBreakup:${BREAKUP}`
await page.goto(url, { waitUntil: 'domcontentloaded' })
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

const TIER = process.env.TIER || 'performance'

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

const OUTDIR = process.env.OUT || '/tmp/tile-breakup'
fs.mkdirSync(OUTDIR, { recursive: true })

// Stand in the kitchen and both bathrooms — the tiled floors — and look down.
const rooms = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const out = []
  for (const id of Object.keys(ROOMS)) {
    if (!/bath|kitchen|shelter/i.test(id)) continue
    const shell = getRoomEditorShell(plan, id)?.shell
    if (!shell?.center) continue
    out.push({ id, pos: [shell.center[0], 1.6, shell.center[1]] })
  }
  return out
})

const flags = await page.evaluate(async () => {
  const { isFeatureEnabled } = await import('/src/features/flags/resolve.ts')
  return {
    uiMode: window.__store.getState().uiMode,
    tileBreakup: isFeatureEnabled('tileBreakup'),
  }
})
// Prove the arm is the one intended before trusting any pixel (meta-rule iv).
console.log(`uiMode=${flags.uiMode}  tileBreakup=${flags.tileBreakup}  rooms=${rooms.length}`)

for (const room of rooms) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], 0)
  }, room)
  await new Promise((r) => setTimeout(r, 700))
  await page.evaluate(() => window.__walkLook?.setPitch?.(-0.85))
  await new Promise((r) => setTimeout(r, 1000))
  fs.writeFileSync(`${OUTDIR}/${room.id}.png`, await page.screenshot({ type: 'png' }))
  console.log(`  ${room.id} captured`)
}

console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
