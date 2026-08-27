/** What tier does the app actually BOOT into on this machine (TIER-AUTODETECT)? */
import puppeteer from 'puppeteer'

const browser = await puppeteer.launch({
  headless: true,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.clear()
  } catch {}
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => {
  window.__store.getState().dismissLocationPrompt?.()
})
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
const st = await page.evaluate(() => {
  const s = window.__store.getState()
  const c = document.createElement('canvas').getContext('webgl2')
  const d = c.getExtension('WEBGL_debug_renderer_info')
  // What the APP's own context reports — this is what detectDefaultTier sees.
  const agl = window.__three?.gl?.getContext?.()
  let appRenderer = null,
    isW2 = null
  try {
    const ad = agl?.getExtension('WEBGL_debug_renderer_info')
    appRenderer = ad ? agl.getParameter(ad.UNMASKED_RENDERER_WEBGL) : '(no extension)'
    isW2 = typeof WebGL2RenderingContext !== 'undefined' && agl instanceof WebGL2RenderingContext
  } catch (e) {
    appRenderer = `threw: ${e.message}`
  }
  return {
    bootTier: s.qualityTier,
    userSet: s.qualityUserSet,
    probeRenderer: c.getParameter(d.UNMASKED_RENDERER_WEBGL),
    appRenderer,
    appIsWebGL2: isW2,
    cores: navigator.hardwareConcurrency,
    coarse: matchMedia('(pointer: coarse)').matches,
  }
})
console.log(JSON.stringify(st, null, 1))
await browser.close()
