/**
 * BAKE-SIZE — do Medium+ tiers actually get the 512-square procedural bake?
 *
 * `procedural/generators.ts` documents `BASE_SIZE` as "Performance (the app default) drops
 * to 256 squared ... while Medium+ keeps 512 squared", set by `QualityController`, and adds
 * that "existing textures keep their size until regenerated (cache keys carry the size)".
 * Those two sentences can conflict: if the first bake happens while the ladder is still at a
 * conservative rung, every map is 256 and nothing forces a re-bake when the tier settles
 * higher — so a Medium user would silently keep quarter-resolution maps.
 *
 * A `material-audit.mjs` run at medium found NO 512-square textures at all (705 at 256, max
 * 256), which is what prompted this. That also matters beyond sharpness: JOINT-SCALE
 * arithmetic depends on the bake size, so BATH-TILE-OK's 2.34 mm joint was computed at
 * S=512 and would be 4.7 mm at S=256 — above the 2-3 mm the spec allows for rectified
 * porcelain.
 *
 * Reports the live `getProceduralBaseSize()` and a texture-size histogram at each tier in
 * turn, so "the setting" and "what is actually on the GPU" are visible side by side.
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

const TIERS = (process.env.TIERS || 'medium,maximum').split(',')

async function report(label) {
  const out = await page.evaluate(async () => {
    const g = await import('/src/materials/procedural/generators.ts')
    const hist = new Map()
    const seen = new Set()
    window.__three.scene.traverse((o) => {
      const m = o.material
      if (!m) return
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) {
        const t = m[k]
        const img = t?.image
        if (!img || seen.has(t.uuid)) continue
        seen.add(t.uuid)
        const key = `${img.width}x${img.height}`
        hist.set(key, (hist.get(key) ?? 0) + 1)
      }
    })
    return {
      baseSize: g.getProceduralBaseSize?.() ?? null,
      tier: window.__store.getState().qualityTier,
      hist: [...hist.entries()].sort((a, b) => b[1] - a[1]),
    }
  })
  console.log(
    `${label.padEnd(22)} tier=${String(out.tier).padEnd(12)} ` +
      `getProceduralBaseSize()=${String(out.baseSize).padEnd(4)}  textures: ` +
      out.hist.map(([k, n]) => `${k}x${n}`).join('  '),
  )
  return out
}

console.log('does the live bake size match the tier the ladder settled on?\n')
await report('as booted')
for (const t of TIERS) {
  await page.evaluate((tt) => window.__store.getState().setQualityTier(tt), t)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))
  await assertSceneAlive(page, t)
  await report(`after setTier ${t}`)
}
await browser.close()
