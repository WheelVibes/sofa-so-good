/**
 * EXPORT-HELPERS — does the glTF/OBJ export ship render-only helpers as geometry?
 *
 * `sceneGltf.ts:buildExportRoot` prunes by `noExport` TAG, helper TYPE and Camera only.
 * Anything else in the graph is treated as home geometry, and a plain `<mesh>` with an
 * invisible material is NOT excluded — critically, `colorWrite: false` is a WebGL renderer
 * state with no glTF equivalent, so an importer has no way to know the mesh was never meant
 * to be seen.
 *
 * This runs the app's OWN `buildExportRoot` over the live scene and counts what survives, so
 * the check cannot drift from the real exporter. Two populations are identified by their
 * runtime signature rather than by name (r3f meshes carry none):
 *   occluders      — `colorWrite: false` and `opacity: 0` (the virtual ceiling)
 *   contactShadows — transparent, `depthWrite: false`, a mapped MeshBasicMaterial on a
 *                    plane (the fake grounding blobs, RZ1)
 * Both are render-only. Either surviving the prune is a defect.
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

const out = await page.evaluate(async () => {
  const { buildExportRoot } = await import('/src/export/sceneGltf.ts')
  const scene = window.__three.scene

  const census = (root) => {
    let meshes = 0
    let occluders = 0
    let contact = 0
    root.traverse((o) => {
      if (!o.isMesh) return
      meshes++
      const m = o.material
      if (!m) return
      if (m.colorWrite === false && m.opacity === 0) occluders++
      else if (m.isMeshBasicMaterial && m.transparent && m.depthWrite === false && m.map) {
        contact++
      }
    })
    return { meshes, occluders, contact }
  }

  const live = census(scene)
  const exported = census(buildExportRoot(scene))
  return { live, exported }
})

console.log('population        in scene   in export')
for (const k of ['meshes', 'occluders', 'contact']) {
  const bad = k !== 'meshes' && out.exported[k] > 0
  console.log(
    `${k.padEnd(17)} ${String(out.live[k]).padStart(8)} ${String(out.exported[k]).padStart(11)}` +
      (bad ? '   <-- render-only helper LEAKED into the export' : k === 'meshes' ? '' : '   ok'),
  )
}
await browser.close()
