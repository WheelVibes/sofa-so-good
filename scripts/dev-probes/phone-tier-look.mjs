/**
 * PHONE-TIER-LOOK — what the tier most mobile users get actually looks like.
 *
 * The phone veto puts real phones on `performance`: flat shading, no AO, no IBL, no post
 * stack, DPR 1. Every frame judged in this loop so far has been desktop `medium` or
 * `maximum`, so the tier the majority of users actually see has never been reviewed.
 *
 * The viewport is held FIXED at a phone size and only the TIER is varied (meta-rule xvi),
 * so the comparison isolates what the tier costs visually rather than confounding it with
 * resolution and framing. Alongside each frame it reports interior statistics over a
 * centre slab — never the full canvas, which is dominated by translucent DOM chrome
 * (meta-rule vi) — plus the render systems actually live at that tier, so a visual verdict
 * can be attributed to a specific missing system rather than to vibes.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/ssg-phone-tier'
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
if (process.env.BOOT_PHONE !== '0') {
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
if (process.env.COARSE !== '0') {
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

const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const HOURS = (process.env.HOURS || '13,21').split(',').map(Number)

/** Interior statistics over a centre slab of the CANVAS (never the full rect). */
async function slabStats() {
  const shot = await page.screenshot({ type: 'png' })
  const sharp = (await import('sharp')).default
  const img = sharp(shot)
  const meta = await img.metadata()
  const raw = await img.raw().toBuffer()
  const ch = raw.length / (meta.width * meta.height)
  // Middle half horizontally, middle third vertically — the flat sits there at phone
  // aspect and it excludes the toolbar and the onboarding card.
  const x0 = Math.floor(meta.width * 0.25)
  const x1 = Math.floor(meta.width * 0.75)
  const y0 = Math.floor(meta.height * 0.33)
  const y1 = Math.floor(meta.height * 0.66)
  const lum = []
  let dark = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * meta.width + x) * ch
      const l = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2]
      lum.push(l)
      if (l < 60) dark++
    }
  }
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length
  const sigma = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length)
  return {
    mean: +mean.toFixed(1),
    sigma: +sigma.toFixed(1),
    darkPct: +((dark / lum.length) * 100).toFixed(1),
  }
}

async function systems() {
  return page.evaluate(() => {
    const { scene, gl } = window.__three
    let occluders = 0
    const renderCalls = 0
    scene.traverse((o) => {
      if (o.isMesh && o.material?.colorWrite === false && o.material?.opacity === 0) occluders++
    })
    return {
      ibl: !!scene.environment,
      shadows: gl.shadowMap.enabled,
      dpr: +gl.getPixelRatio().toFixed(2),
      occluders,
      renderCalls,
    }
  })
}

console.log('phone 390x844, viewport FIXED, tier varied — the only variable is the tier\n')
console.log('hour tier          dpr  ibl    shadows  mean   sigma  dark%')

for (const h of HOURS) {
  await page.evaluate((hh) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(hh)
  }, h)
  for (const tier of TIERS) {
    await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
    await page
      .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 4000))
    await assertSceneAlive(page, `${tier}@${h}`)
    const sys = await systems()
    const st = await slabStats()
    fs.writeFileSync(`${OUT}/${h}h-${tier}.png`, await page.screenshot({ type: 'png' }))
    console.log(
      `${String(h).padEnd(4)} ${tier.padEnd(13)} ${String(sys.dpr).padStart(3)}  ` +
        `${String(sys.ibl).padEnd(6)} ${String(sys.shadows).padEnd(8)} ` +
        `${String(st.mean).padStart(5)} ${String(st.sigma).padStart(6)} ${String(st.darkPct).padStart(6)}`,
    )
  }
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
