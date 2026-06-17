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
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
// Skip first-run onboarding so the P hotkey isn't swallowed by the modal guard.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})

const booted = (tag) =>
  page
    .waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
    .then(() => console.log(`   ${tag} booted ✓`))
    .catch(() => console.log(`   ${tag} did NOT boot ✗`))

console.log('1. First online load…')
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await booted('first')

console.log('2. Wait for SW precache of editor chunk…')
const precached = await page.evaluate(async () => {
  await navigator.serviceWorker?.ready?.catch?.(() => {})
  for (let i = 0; i < 80; i++) {
    for (const n of await caches.keys()) {
      const reqs = await (await caches.open(n)).keys()
      if (reqs.some((r) => /FloorPlanEditor/.test(r.url))) return true
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
})
console.log(
  '   FloorPlanEditor precached:',
  precached,
  '| controller:',
  await page.evaluate(() => !!navigator.serviceWorker.controller),
)

console.log('3. Reload (SW serves the page)…')
await page.reload({ waitUntil: 'load', timeout: 60000 })
await booted('reload')

console.log('4. OFFLINE.')
await page.setOfflineMode(true)

console.log('5. Open floor plan editor (press P)…')
await page.click('body').catch(() => {})
await page.keyboard.press('KeyP')
await new Promise((r) => setTimeout(r, 5000))

const result = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    errorBoundary: /Something went wrong/.test(t),
    importFailed: /Importing a module script failed/i.test(t),
    technicalDetail: (t.match(/Importing a module script failed[^\n]*/i) || [''])[0],
  }
})
console.log('6. RESULT:', JSON.stringify(result))
await page.screenshot({ path: '/tmp/offline-editor.png' })
await browser.close()
console.log('EXIT done')
