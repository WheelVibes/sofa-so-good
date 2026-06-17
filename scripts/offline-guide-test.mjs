// Verifies the VitePress user guide is precached and works fully OFFLINE from
// the first launch: load the app online once (the SW precaches everything,
// guide included), go offline, then open the guide and a sub-page + a
// screenshot — all must load from cache with real guide content.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.OFFLINE_BASE || 'http://localhost:4173/sofa-so-good/'
const userDataDir = mkdtempSync(join(tmpdir(), 'pptr-'))
const browser = await puppeteer.launch({
  headless: true,
  userDataDir,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})

console.log('1. Load app online; wait for the SW to precache the guide…')
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
const precached = await page.evaluate(async () => {
  await navigator.serviceWorker?.ready?.catch?.(() => {})
  for (let i = 0; i < 120; i++) {
    for (const n of await caches.keys()) {
      const reqs = await (await caches.open(n)).keys()
      const urls = reqs.map((r) => r.url)
      // Workbox precache stores entries with a ?__WB_REVISION__= suffix, so
      // match without anchoring to the end of the URL.
      if (
        urls.some((u) => /\/docs\/index\.html/.test(u)) &&
        urls.some((u) => /\/docs\/screenshots\//.test(u))
      )
        return true
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
})
console.log('   guide (index + screenshot) precached:', precached)

console.log('2. GO OFFLINE, then open the guide directly…')
await page.setOfflineMode(true)
const results = {}

// Guide home.
await page.goto(`${BASE}docs/`, { waitUntil: 'load', timeout: 60000 }).catch((e) => {
  results.gotoErr = String(e)
})
results.home = await page.evaluate(() => ({
  title: document.title,
  // Real VitePress guide pages have the .VPDoc / .vp-doc content container.
  isGuide: !!document.querySelector('.VPDoc, .vp-doc, .VPContent'),
  isAppShell: !!document.getElementById('boot-loader') || !!document.querySelector('#root canvas'),
  text: document.body.innerText.slice(0, 80).replace(/\s+/g, ' '),
}))

// A sub-page.
await page
  .goto(`${BASE}docs/floor-plan-editor.html`, { waitUntil: 'load', timeout: 60000 })
  .catch((e) => {
    results.subErr = String(e)
  })
results.subPage = await page.evaluate(() => ({
  isGuide: !!document.querySelector('.VPDoc, .vp-doc, .VPContent'),
  text: document.body.innerText.slice(0, 80).replace(/\s+/g, ' '),
}))

// A screenshot asset.
results.screenshot = await page.evaluate(async (base) => {
  try {
    const res = await fetch(`${base}docs/screenshots/floor-plan-editor.png`, { cache: 'no-store' })
    return { status: res.status, type: res.headers.get('content-type') }
  } catch (e) {
    return { err: String(e) }
  }
}, BASE)

console.log('3. RESULT:', JSON.stringify(results, null, 2))
await page.screenshot({ path: '/tmp/offline-guide.png' })
await browser.close()
const ok =
  precached &&
  results.home?.isGuide &&
  !results.home?.isAppShell &&
  results.subPage?.isGuide &&
  results.screenshot?.status === 200
console.log(ok ? '\nPASS: user guide works offline from first launch ✓' : '\nFAIL ✗')
console.log('EXIT done')
