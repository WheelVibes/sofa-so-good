/**
 * LIGHT-UNITS — are the emitter intensities in physical units, and are they consistent?
 *
 * `lightEmitters.ts` documents its `intensity` field as "candela; renderer uses physical
 * units", and FIXTURE-NEARFIELD-REFUTED named that table the only remaining lever for
 * fixture brightness. Before touching a value, check what the units actually ARE — because
 * if they were candela, the shipped ceiling light (9) would sit against a real 9 W LED bulb
 * at 800 lm / 4-pi = ~64 cd and read as 7x too dim, which is exactly the kind of
 * false comparison that gets a working table "fixed".
 *
 * The check is the rest of the rig: in three's physical units a `DirectionalLight` is in
 * LUX, and real midday sun is ~100,000 lux. So this censuses every live light in the scene
 * — type, intensity, decay, distance — at day and at night, and reports the fixture-to-fill
 * RATIO, which is the only internally meaningful quantity if the rig turns out to be in
 * relative units.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/ssg-walk'
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

const census = async (label) => {
  const out = await page.evaluate(() => {
    const lights = []
    window.__three.scene.traverse((o) => {
      if (!o.isLight || !o.visible) return
      lights.push({
        type: o.type,
        intensity: +o.intensity.toFixed(3),
        decay: o.decay != null ? +o.decay : null,
        distance: o.distance != null ? +o.distance.toFixed(1) : null,
      })
    })
    const by = new Map()
    for (const l of lights) {
      const k = l.type
      if (!by.has(k)) by.set(k, [])
      by.get(k).push(l)
    }
    return {
      exposure: +window.__three.gl.toneMappingExposure.toFixed(3),
      groups: [...by.entries()].map(([t, ls]) => ({
        type: t,
        n: ls.length,
        intensities: [...new Set(ls.map((l) => l.intensity))].sort((a, b) => a - b).slice(0, 8),
      })),
    }
  })
  console.log(`\n--- ${label} (exposure ${out.exposure}) ---`)
  for (const g of out.groups) {
    console.log(
      `  ${g.type.padEnd(20)} x${String(g.n).padStart(3)}  intensities ${JSON.stringify(g.intensities)}`,
    )
  }
  return out
}

await census('day 13:00, lights as shipped')

await page.evaluate(() => {
  const st = window.__store.getState()
  st.setManualHour(21)
  st.setLightsMode?.('on')
})
await new Promise((r) => setTimeout(r, 2500))
await census('night 21:00, lightsMode on')

await browser.close()
