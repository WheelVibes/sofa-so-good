// Confirms EXEMPT features (AI / remote catalog / external APIs) degrade
// gracefully offline — a clear message, never a crash of the whole app.
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
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
await page.evaluate(async () => {
  await navigator.serviceWorker?.ready?.catch?.(() => {})
  for (let i = 0; i < 80; i++) {
    for (const n of await caches.keys()) {
      const reqs = await (await caches.open(n)).keys()
      if (reqs.some((r) => /FloorPlanEditor/.test(r.url))) return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
})
await page.reload({ waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
await page.setOfflineMode(true)
await sleep(800)

async function runCmd(sub) {
  await page.keyboard.press('Escape')
  await sleep(150)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyK')
  await page.keyboard.up('Control')
  await sleep(400)
  for (const ch of sub) await page.keyboard.type(ch, { delay: 8 })
  await sleep(450)
  await page.keyboard.press('Enter')
  await sleep(2500)
}

const checks = ['AI auto-furnish', 'Describe the home']
for (const c of checks) {
  const before = pageErrors.length
  await runCmd(c)
  const crashed = await page.evaluate(() => /Something went wrong/.test(document.body.innerText))
  console.log(
    `  ${crashed ? '✗ CRASH' : '✓ graceful'}  ${c}${
      pageErrors.length > before ? ` (pageerror: ${pageErrors.slice(before).join('|')})` : ''
    }`,
  )
}
await page.screenshot({ path: '/tmp/offline-exempt.png' })
await browser.close()
console.log('EXIT done')
