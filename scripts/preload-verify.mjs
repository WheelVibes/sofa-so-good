// Verifies the idle preloader proactively fetches on-demand feature chunks
// after boot WITHOUT the user opening anything — so they're cached/instant and
// offline-ready. Loads the app, waits while idle (no interaction), then checks
// the FloorPlanEditor chunk was requested as a script.
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
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await page.waitForFunction(() => !document.getElementById('boot-loader'), { timeout: 60000 })

// Idle for a while WITHOUT any interaction; the preloader should warm chunks.
// Page-context import() records a resource-timing entry even when the service
// worker serves it from precache; SW precache fetches happen in the SW context
// and do NOT, so this proves the page (i.e. the preloader) imported the chunk.
await new Promise((r) => setTimeout(r, 9000))

const requested = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((e) => e.name),
)
const editorPreloaded = requested.some((u) => /FloorPlanEditor-/.test(u))
const otherPreloaded = ['SmartStartWizard', 'ShareModal', 'VersionsPanel'].filter((n) =>
  requested.some((u) => new RegExp(`${n}-`).test(u)),
)
console.log('FloorPlanEditor chunk fetched without opening it:', editorPreloaded)
console.log('Other feature chunks warmed:', otherPreloaded.join(', ') || '(none yet)')
await browser.close()
console.log(editorPreloaded ? 'PASS ✓' : 'FAIL ✗')
console.log('EXIT done')
