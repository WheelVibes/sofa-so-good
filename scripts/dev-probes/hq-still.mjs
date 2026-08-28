/**
 * HQ-STILL — does the path-traced still actually render, and does it match the viewport?
 *
 * HQ-TONE-MATCH (v0.31.5.36) fixed the HQ render to use the app's resolved view transform
 * instead of a hardcoded ACES Filmic, but shipped with an explicit verification gap: it was
 * checked by unit tests and by reading the code path, never by a rendered image. The reason
 * is real — `three-gpu-pathtracer` compiles a megakernel that fails GLSL validation on some
 * drivers, which is exactly why `PT-BLANK-GUARD`/`hqBlankProbe.ts` exists.
 *
 * This drives the session directly off `getHqRenderSource()` (the same objects the modal
 * uses), renders a small still under each tone-mapping operator, and reports the clipped
 * fraction of each. If the megakernel will not compile under ANGLE/metal it says so plainly
 * rather than reporting a blank frame as a result — a uniformly black or white output is the
 * documented signature of that failure, not evidence about tone mapping.
 *
 * Expected if it works: filmic clips materially MORE than AgX, matching `tone-curve.mjs`'s
 * 1.94% vs 0.28% on the live canvas — i.e. the export now tracks the viewport.
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

const SAMPLES = Number(process.env.SAMPLES || 6)
const MODES = (process.env.MODES || 'filmic,agx').split(',')

const out = await page.evaluate(
  async ({ samples, modes }) => {
    const [{ getHqRenderSource }, { createHqRenderSession }] = await Promise.all([
      import('/src/scene/pathtrace/hqRenderSource.ts'),
      import('/src/scene/pathtrace/hqRenderSession.ts'),
    ])
    const src = getHqRenderSource()
    if (!src) return { error: 'no HQ render source (is the 3D view mounted?)' }
    if (!src.gl) return { error: 'HqRenderSource carries no gl — HQ-TONE-MATCH not applied' }

    const results = []
    for (const mode of modes) {
      const r = await new Promise((resolve) => {
        let session = null
        const finish = (payload) => {
          try {
            session?.dispose()
          } catch {}
          resolve(payload)
        }
        createHqRenderSession(src.scene, src.camera, {
          width: 320,
          height: 200,
          maxSamples: samples,
          denoise: false,
          toneMapping: mode,
          exposure: src.gl.toneMappingExposure,
          onDone: () => {
            // Read the accumulation canvas directly and classify it.
            const c = session.canvas
            const g = document.createElement('canvas')
            g.width = c.width
            g.height = c.height
            const ctx = g.getContext('2d')
            ctx.drawImage(c, 0, 0)
            const d = ctx.getImageData(0, 0, g.width, g.height).data
            let clipped = 0
            let black = 0
            let n = 0
            let sum = 0
            for (let i = 0; i < d.length; i += 4) {
              const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
              sum += lum
              if (d[i] >= 254 && d[i + 1] >= 254 && d[i + 2] >= 254) clipped++
              if (d[i] <= 1 && d[i + 1] <= 1 && d[i + 2] <= 1) black++
              n++
            }
            finish({
              mode,
              mean: +(sum / n).toFixed(1),
              clippedPct: +((clipped / n) * 100).toFixed(2),
              blackPct: +((black / n) * 100).toFixed(2),
              samples: session.samples,
            })
          },
          onError: (err) => finish({ mode, error: String(err?.message ?? err) }),
        })
          .then((s) => {
            session = s
          })
          .catch((err) => finish({ mode, error: String(err?.message ?? err) }))
        setTimeout(() => finish({ mode, error: 'timed out waiting for samples' }), 120000)
      })
      results.push(r)
    }
    return { results }
  },
  { samples: SAMPLES, modes: MODES },
)

console.log(`HQ still, ${SAMPLES} samples, 320x200\n`)
if (out.error) {
  console.log(`FAILED: ${out.error}`)
} else {
  console.log('mode      mean   clipped%   black%   samples')
  for (const r of out.results) {
    if (r.error) {
      console.log(`${r.mode.padEnd(9)} ERROR: ${r.error}`)
      continue
    }
    // A uniformly black or white frame is PT-BLANK-GUARD's documented signature of a
    // megakernel that failed to compile — NOT evidence about tone mapping.
    const blank = r.blackPct > 99 || r.clippedPct > 99
    console.log(
      `${r.mode.padEnd(9)} ${String(r.mean).padStart(5)} ${String(r.clippedPct).padStart(9)} ` +
        `${String(r.blackPct).padStart(8)} ${String(r.samples).padStart(8)}` +
        (blank ? '   <-- BLANK: megakernel did not compile, tells us nothing' : ''),
    )
  }
}
await browser.close()
