/**
 * FIRST-RUN — what a genuinely NEW visitor sees, overlays and all.
 *
 * Every probe in this repo suppresses the first-run path: they set
 * `hdb_onboarded` in `evaluateOnNewDocument` and call `dismissLocationPrompt()`
 * before `sceneReady`. So every frame judged in `.20`-`.74` was captured AFTER
 * the onboarding carousel, the 9-step tour and the location prompt were gone.
 * Nobody has looked at the thing a first-time user actually meets.
 *
 * That path has been broken before — `state/storage/firstPaintDaylight.ts`
 * exists because a Chrome audit in 2026-08 found a new visitor after dark
 * staring at a pitch-black flat through the whole of onboarding.
 *
 * This probe does the opposite of the others: it suppresses NOTHING, pins the
 * WALL CLOCK (`FAKE_HOUR`, since the app boots `timeMode: 'system'` and the
 * daylight guard keys off it), and captures a timed sequence from first paint.
 * Each shot prints the store's own first-run flags beside it (meta-rule iv).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl } from './lib.mjs'

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
// NOTE: no `hdb_onboarded` seed and no `dismissLocationPrompt()` — that is the
// entire point of this probe.
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
// FAKE_HOUR — pin the page's WALL CLOCK before load. The app boots in
// `timeMode: 'system'`, so anything keyed to the real time of day is invisible
// unless you control it; the `off` sightings (`.62`, `.68`) were daytime runs and
// the `on` sightings (`.72`, and every run in this round) were evening ones.
// Installed via `evaluateOnNewDocument` so it is in place before any app code.
if (process.env.FAKE_HOUR) {
  await page.evaluateOnNewDocument((h) => {
    const RealDate = Date
    const base = new RealDate()
    base.setHours(h, 0, 0, 0)
    const fixed = base.getTime()
    // biome-ignore lint/suspicious/noGlobalAssign: probe-only clock stub
    Date = class extends RealDate {
      constructor(...a) {
        super(...(a.length ? a : [fixed]))
      }
      static now() {
        return fixed
      }
    }
  }, Number(process.env.FAKE_HOUR))
}
// WATCH=1 — name the WRITER. Installed before any app code: poll for
// `window.__store`, then wrap its `setState` so every write that changes
// `lightsMode` records a stack. Also snapshots scalar state so the 13:00 vs
// 22:00 arms can be diffed WHOLE — pinning the clock might be selecting a
// different startup PATH, with the lights only a symptom (meta-rule lxii).
if (process.env.WATCH === '1') {
  await page.evaluateOnNewDocument(() => {
    window.__lightsWrites = []
    const install = () => {
      const st = window.__store
      if (!st?.setState) return false
      const orig = st.setState.bind(st)
      st.setState = (partial, replace) => {
        const before = st.getState().lightsMode
        const r = orig(partial, replace)
        const after = st.getState().lightsMode
        if (before !== after) {
          window.__lightsWrites.push({
            from: before,
            to: after,
            stack: new Error().stack?.split('\n').slice(1, 7).join(' | '),
          })
        }
        return r
      }
      return true
    }
    if (!install()) {
      const iv = setInterval(() => {
        if (install()) clearInterval(iv)
      }, 5)
    }
  })
}
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })

await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

const OUTDIR = process.env.OUT || '/tmp/first-run'
fs.mkdirSync(OUTDIR, { recursive: true })
const TAG = process.env.FAKE_HOUR || 'now'

const flags = async () => {
  const f = await page.evaluate(() => {
    const s = window.__store.getState()
    const seen = (k) => {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    }
    return {
      lights: s.lightsMode,
      time: `${s.timeMode}/${Math.round(s.manualHour)}`,
      items: Array.isArray(s.items) ? s.items.length : null,
      onboarded: seen('hdb_onboarded'),
      // Whatever overlay text is on screen is the ground truth for "what is
      // covering the scene" — the store flags alone do not tell you.
      overlay: [...document.querySelectorAll('div,section,aside')]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          const st = getComputedStyle(e)
          return (
            r.width > 300 &&
            r.height > 150 &&
            st.position === 'fixed' &&
            st.visibility !== 'hidden' &&
            Number(st.opacity) > 0.1
          )
        })
        .map((e) => (e.textContent || '').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 3),
    }
  })
  return f
}

// Scene-region luminance: everything OUTSIDE the modal card and the toolbar
// (meta-rule lxxviii). A whole-canvas mean here is dominated by a big white card.
const sceneStats = async (label) => {
  const shot = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUTDIR}/${TAG}-${label}.png`, shot)
  const { data, info } = await sharp(shot)
    .removeAlpha()
    .resize(64, 40, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lum = (k) => 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]
  let sum = 0
  let n = 0
  let dark = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if ((x >= 20 && x <= 43 && y >= 9 && y <= 30) || y < 4) continue
      const v = lum((y * info.width + x) * 3)
      sum += v
      n++
      if (v < 24) dark++
    }
  }
  return { mean: sum / n, dark: (100 * dark) / n }
}

// SEQUENCE=1 — drive the whole first-run journey through the STORE (robust; the
// tooltip anchors move) and measure the scene at every stage: carousel -> the
// 9 tour steps -> location prompt -> unobstructed. `tourSteps.ts` has no camera
// fields, so the hypothesis under test is that the boot ORBIT pose persists
// through all of it — i.e. `.75`'s dark screen is not a brief splash.
if (process.env.SEQUENCE === '1') {
  const row = async (label) => {
    const st = await page.evaluate(() => {
      const s = window.__store.getState()
      return { tour: s.tourOpen ? s.tourStep : null, onb: s.onboardingOpen, cam: s.cameraMode }
    })
    const m = await sceneStats(label)
    console.log(
      `  ${label.padEnd(22)} cam=${String(st.cam).padEnd(11)} tour=${String(st.tour).padEnd(4)} ` +
        `scene mean ${m.mean.toFixed(1).padStart(6)}  near-black ${m.dark.toFixed(1).padStart(5)}%`,
    )
  }
  const steps = await page.evaluate(async () => {
    const { TOUR_STEPS } = await import('/src/ui/tour/tourSteps.ts')
    return TOUR_STEPS?.length ?? 9
  })
  console.log(`first-run SEQUENCE, wall clock ${TAG}:00, ${steps} tour steps\n`)
  await row('1-carousel')
  await page.evaluate(() => window.__store.getState().startTour())
  await new Promise((r) => setTimeout(r, 1200))
  for (let i = 0; i < steps; i++) {
    await row(`2-tour-step${i}`)
    await page.evaluate((c) => window.__store.getState().tourNext(c), steps)
    await new Promise((r) => setTimeout(r, 700))
  }
  await row('3-after-tour')
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await new Promise((r) => setTimeout(r, 1200))
  await row('4-unobstructed')
  console.log(`\nframes -> ${OUTDIR}`)
  await browser.close()
  process.exit(0)
}

console.log(`first-run capture, wall clock ${TAG}:00\n`)
for (const t of [0, 2000, 5000, 9000]) {
  if (t) await new Promise((r) => setTimeout(r, t === 2000 ? 2000 : 3000))
  const f = await flags()
  fs.writeFileSync(`${OUTDIR}/h${TAG}-t${t}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `  t=${String(t).padStart(5)}ms  lights=${String(f.lights).padEnd(3)} ${f.time}  items=${f.items}  onboarded=${f.onboarded}`,
  )
  for (const o of f.overlay) console.log(`             overlay: "${o}"`)
}
console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
