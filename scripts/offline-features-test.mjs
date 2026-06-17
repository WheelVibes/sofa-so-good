// Broad offline smoke test: boot the production build offline (service worker
// serving the precache), then drive the command palette (Ctrl+K) to open every
// non-exempt feature, asserting none crash-lands the app (top-level
// ErrorBoundary) or throws an uncaught page error. Exempt features (AI / remote
// catalog / external APIs / sidecars) are intentionally not exercised here.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.OFFLINE_BASE || 'http://localhost:4173/sofa-so-good/'

// Distinctive substrings that uniquely filter each command's label.
const COMMANDS = [
  'catalog',
  'Objects',
  'measurement',
  'Smart Start',
  'Design a 3D',
  'Custom-size',
  'Tidy',
  'Design score',
  'Accessibility',
  'Comments',
  'Versions',
  'Edit history',
  'Share & export',
  '360° panorama',
  'tour — linked',
  'HQ render',
  'Render compare',
  'Palette from photo',
  'Design report',
  'Furniture list',
  'plan to SVG',
  'Export 3D',
  'Floor plan editor',
  'Edit a room',
  'Appearance — theme',
  'Guided product',
  'Top view',
  'Reset view',
  'Cycle time',
]

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
const hasErrorCard = () => page.evaluate(() => /Something went wrong/.test(document.body.innerText))

console.log('Boot online, wait for precache…')
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
await page.evaluate(async () => {
  await navigator.serviceWorker?.ready?.catch?.(() => {})
  // Wait until the precache holds a representative on-demand chunk.
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

console.log('GO OFFLINE.\n')
await page.setOfflineMode(true)
await sleep(1000)

const results = []
for (const cmd of COMMANDS) {
  const before = pageErrors.length
  // Reset UI: close anything open.
  await page.keyboard.press('Escape')
  await sleep(150)
  await page.keyboard.press('Escape')
  await sleep(150)
  // Open the command palette and run the command.
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyK')
  await page.keyboard.up('Control')
  await sleep(400)
  for (const ch of cmd) await page.keyboard.type(ch, { delay: 8 })
  await sleep(450)
  await page.keyboard.press('Enter')
  await sleep(2200)
  const crashed = await hasErrorCard()
  const newErrs = pageErrors.slice(before)
  const status = crashed ? 'CRASH' : newErrs.length ? 'PAGEERROR' : 'ok'
  results.push({ cmd, status, errs: newErrs })
  console.log(
    `  ${status === 'ok' ? '✓' : '✗'} ${cmd.padEnd(22)} ${status}${
      newErrs.length ? ` :: ${newErrs.join(' | ').slice(0, 160)}` : ''
    }`,
  )
  if (crashed) {
    await page.screenshot({ path: `/tmp/offline-crash-${cmd.replace(/\W+/g, '_')}.png` })
    // Recover for the next command.
    await page.reload({ waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })
  }
}

const bad = results.filter((r) => r.status !== 'ok')
console.log(`\nSUMMARY: ${results.length - bad.length}/${results.length} ok`)
if (bad.length) {
  console.log('FAILURES:')
  for (const b of bad) console.log(`  ${b.status}  ${b.cmd}  ${b.errs.join(' | ')}`)
}
await browser.close()
console.log('EXIT done')
