/**
 * LIGHTMAP-COVERAGE — which surface classes actually carry a baked lightmap, and which fall back
 * to the flat analytic fill.
 *
 * **Why this matters more than the gain.** Measured against a physical Cycles reference at the
 * default living/dining pose, the whole-frame mean agreed to within 4.7 counts — and that agreement
 * was **two large errors in opposite directions cancelling**. Splitting the frame by whether a
 * pixel responds to the baked-GI gain:
 *
 *   lightmapped surfaces (25.6 % of masked px)  app is **+35.5 counts TOO BRIGHT** (p75 +58.3)
 *   analytic-fill-only   (74.4 %)               app is **-18.6 counts TOO DARK**  (p50 -26.2)
 *
 * Doubling `IRRADIANCE_GAIN` moves the median by **1.0 count** and pushes p95 from +20.8 to +31.8
 * over the reference, because it only reaches a quarter of the frame. The lever is COVERAGE.
 *
 * This probe reads the app's own bookkeeping rather than inferring from pixels: `DEV` builds tag
 * each mapped material with `userData.visMapUrl`, so a traversal says exactly which meshes got a
 * map. Pair it with the applier's own console line (printed below), which reports the key-lookup
 * hit rate.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/lightmap-coverage.mjs
 *
 * Caveat on the classification: surface class is read from object/parent NAMES, which is crude —
 * `other` lumps furniture in with anything unnamed. The counts are a triage instrument, not a
 * census; the authoritative number is the hit rate in the app's own log line.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const page = await browser.newPage()
const logs = []
page.on('console', (m) => {
  const t = m.text()
  if (/lightmap/i.test(t)) logs.push(t)
})
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.evaluate(() => {
  const s = window.__store.getState()
  s.endTour?.()
  s.setOnboardingOpen?.(false)
  s.dismissLocationPrompt?.()
  s.dismissChecklist?.()
  s.setManualHour?.(13)
  s.setTimeMode?.('manual')
  s.setQualityTier?.('realistic')
  s.hideLoading?.()
})
await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
await new Promise((r) => setTimeout(r, 8000))
const r = await page.evaluate(() => {
  const byKind = {}
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const mapped = mats.some((m) => m?.userData?.visMapUrl)
    // Name the surface class from the object/geometry tags the exporter and the shell builder set.
    const name = (o.name || o.parent?.name || 'unnamed').toLowerCase()
    let kind = 'other'
    if (/wall/.test(name)) kind = 'wall'
    else if (/ceil/.test(name)) kind = 'ceiling'
    else if (/floor|slab/.test(name)) kind = 'floor'
    else if (/door|window|frame|sill/.test(name)) kind = 'opening'
    byKind[kind] = byKind[kind] || { mapped: 0, unmapped: 0 }
    byKind[kind][mapped ? 'mapped' : 'unmapped']++
  })
  return byKind
})
console.log('mesh counts by surface class (visible, realistic tier):')
for (const [k, v] of Object.entries(r)) {
  const tot = v.mapped + v.unmapped
  console.log(
    `  ${k.padEnd(9)} mapped ${String(v.mapped).padStart(4)} / ${String(tot).padStart(4)}  (${((100 * v.mapped) / tot).toFixed(0)} %)`,
  )
}
console.log('\napp log:')
for (const l of logs.slice(0, 3)) console.log(`  ${l.slice(0, 260)}`)
await browser.close()
