/**
 * FINISH-APPLY — does a finish applied at RUNTIME strand on the 64-square preview?
 *
 * The boot path is clean (no 64-square texture exists anywhere in the default flat
 * after v0.31.5.38/.39). The window that remains open by inspection is a finish applied
 * LATER: `buildMaterial` returns a 64-square quick preview synchronously and the worker
 * swaps the real maps onto it ~80 ms afterwards, while two persistent consumers clone it
 * immediately — `getFurnitureMatWithRepeat` (which caches the clone globally per
 * `(id, repeat)` AND clones the textures, so it can never pick the upgrade up) and
 * `GltfModel`'s finish skin. If either clones inside that window, the piece keeps
 * preview-resolution maps for the rest of the session.
 *
 * Applies a `mat:` finish to real items via `updateItemProps`, then reads the map size
 * off the material three is actually DRAWING with (meta-rule xl), immediately and again
 * after the upgrade has had time to land. A 64 that stays 64 is the bug.
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

const FINISH = process.env.FINISH || 'mat:floor-wood-walnut'

/** Size of every map bound to a mesh under the named items, as drawn. */
const drawnSizes = async (ids) => {
  return await page.evaluate((itemIds) => {
    const wanted = new Set(itemIds)
    const rows = new Map()
    window.__three.scene.traverse((o) => {
      // Furniture roots carry their item id in userData; walk up to find it.
      let p = o
      let id = null
      while (p) {
        const cand = p.userData?.itemId ?? p.userData?.id
        if (cand && wanted.has(cand)) {
          id = cand
          break
        }
        p = p.parent
      }
      if (!id || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m?.map?.image) continue
        const key = `${m.map.image.width}x${m.map.image.height}`
        rows.set(key, (rows.get(key) ?? 0) + 1)
      }
    })
    return [...rows.entries()].sort((a, b) => b[1] - a[1])
  }, ids)
}

// Pick a handful of real items to re-finish.
const ids = await page.evaluate(() => {
  const items = window.__store.getState().items ?? []
  return items.slice(0, 6).map((i) => i.id)
})
console.log(`re-finishing ${ids.length} items with ${FINISH}\n`)

console.log('before          ', JSON.stringify(await drawnSizes(ids)))

await page.evaluate(
  (args) => {
    const st = window.__store.getState()
    for (const id of args.ids) st.updateItemProps(id, { finish: args.finish })
  },
  { ids, finish: FINISH },
)

// Immediately: the preview may legitimately be showing here — that is PERF-C working.
await new Promise((r) => setTimeout(r, 120))
console.log('t+120ms         ', JSON.stringify(await drawnSizes(ids)))
// After the upgrade has had ample time. Anything still at 64 is STRANDED.
await new Promise((r) => setTimeout(r, 4000))
console.log('t+4s            ', JSON.stringify(await drawnSizes(ids)))
await new Promise((r) => setTimeout(r, 6000))
console.log('t+10s           ', JSON.stringify(await drawnSizes(ids)))

fs.writeFileSync('/tmp/finish-apply.png', await page.screenshot({ type: 'png' }))
console.log('\nframe -> /tmp/finish-apply.png')
await browser.close()
