/**
 * LIGHTS-BOOT — does the app boot with `lightsMode: 'on'`, or does a PROBE STEP
 * flip it?
 *
 * `.54` DEFAULT-GLOOM reported "`lightsMode` defaults to `'off'`" and built the
 * biggest lever offered to the user on top of it (lights-on worth 2.3-2.5x). In
 * `.72` two clean walk-tour runs at medium (HOUR=8 and HOUR=13, no `LIGHTS` env)
 * both resolved `on`, while `.62` (performance) and `.68` (maximum) resolved
 * `off`. `uiSlice.ts` initialises `'off'` and nothing in `src/` auto-sets it.
 *
 * So this probe does the ONE thing the others cannot: it prints `lightsMode`
 * immediately after `sceneReady` with NOTHING else called, then again after each
 * setup step in turn, so the exact call that changes it is named rather than
 * guessed. Every line prints the value AND what was just done to earn it
 * (meta-rule iv).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
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
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

const read = async (label) => {
  const v = await page.evaluate(() => {
    const s = window.__store.getState()
    return {
      lights: s.lightsMode,
      time: s.timeMode,
      hour: s.manualHour,
      tier: s.qualityTier,
      cam: s.cameraMode,
      ready: s.sceneReady,
    }
  })
  console.log(
    `  ${label.padEnd(34)} lightsMode=${String(v.lights).padEnd(5)} time=${v.time}/${v.hour} tier=${v.tier} cam=${v.cam}`,
  )
  return v.lights
}

// POLL=1 — read `lightsMode` repeatedly from `sceneReady` without touching
// anything. The move-in seed lands AFTER `sceneReady` (a known harness gotcha:
// "seeding/selecting items right after sceneReady gets clobbered by the move-in
// seed"), so if the value flips partway through, the disagreement between `.54`
// and `.72` is a RACE, not a preference.
if (process.env.WATCH === '1') {
  const out = await page.evaluate(() => {
    const s = window.__store.getState()
    return {
      writes: window.__lightsWrites ?? [],
      scalars: Object.fromEntries(
        Object.entries(s)
          .filter(
            ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
          )
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      items: Array.isArray(s.items) ? s.items.length : null,
    }
  })
  console.log(`lightsMode=${out.scalars.lightsMode}   items=${out.items}`)
  console.log(`\n${out.writes.length} write(s) that CHANGED lightsMode:`)
  for (const w of out.writes) console.log(`  ${w.from} -> ${w.to}\n     ${w.stack}`)
  fs.writeFileSync(
    `/tmp/lights-scalars-${process.env.FAKE_HOUR || 'now'}.json`,
    JSON.stringify(out.scalars, null, 1),
  )
  console.log(
    `\nscalar store snapshot -> /tmp/lights-scalars-${process.env.FAKE_HOUR || 'now'}.json`,
  )
  await browser.close()
  process.exit(0)
}

if (process.env.POLL === '1') {
  console.log('lightsMode polled from sceneReady, nothing else called:\n')
  let prev = null
  for (let i = 0; i <= 40; i++) {
    const v = await page.evaluate(() => window.__store.getState().lightsMode)
    if (v !== prev) {
      console.log(
        `  t=${String(i * 500).padStart(5)}ms  lightsMode=${v}${prev === null ? '' : '   <-- CHANGED'}`,
      )
      prev = v
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log(`\nsettled at lightsMode=${prev} after 20 s`)
  await browser.close()
  process.exit(0)
}

console.log('lightsMode after each setup step (nothing else is called):\n')
const first = await read('1. sceneReady (nothing called)')

await page.evaluate(
  (h) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
await new Promise((r) => setTimeout(r, 800))
await read('2. + setTimeMode/setManualHour')

await page.evaluate(
  (t) => window.__store.getState().setQualityTier(t),
  process.env.TIER || 'performance',
)
await new Promise((r) => setTimeout(r, 2000))
await read('3. + setQualityTier')

await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
await new Promise((r) => setTimeout(r, 2000))
await read('4. + setCameraMode(firstPerson)')

await page.evaluate(() => window.__store.getState().dismissCallout?.('walk-mode'))
await new Promise((r) => setTimeout(r, 800))
await read("5. + dismissCallout('walk-mode')")

await page.evaluate(async () => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(1.84, 2.51, 0)
})
await new Promise((r) => setTimeout(r, 1500))
const last = await read('6. + requestWalkTeleport')

console.log(
  `\nVERDICT: boots ${first === 'off' ? 'OFF' : String(first).toUpperCase()}; ` +
    `after full walk setup ${String(last).toUpperCase()}` +
    (first === last ? '  (no setup step changes it)' : '  <-- A SETUP STEP CHANGED IT'),
)
await browser.close()
