/**
 * Does the CAPABILITY-DETECTED boot tier actually HOLD under sustained use?
 *
 * The adaptive FPS guard only steps down, so an optimistic boot tier is only
 * acceptable if real interaction keeps it there. Boots with clean storage, orbits
 * continuously, and reports the tier plus measured FPS afterwards.
 */
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
await page.setViewport({
  width: 1280,
  height: 800,
  deviceScaleFactor: Number(process.env.DSF || 2),
})
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.clear()
  } catch {}
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
const boot = await page.evaluate(() => window.__store.getState().qualityTier)
// Past the guard's warm-up window before we start driving frames.
await new Promise((r) => setTimeout(r, 7000))
await page.evaluate(() => {
  window.__fps = { frames: 0, t0: performance.now() }
  const tick = () => {
    window.__fps.frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const b = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = b.x + b.w / 2,
  cy = b.y + b.h / 2
await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 0; i < 160; i++) {
  await page.mouse.move(cx + Math.sin(i / 10) * 260, cy + Math.cos(i / 14) * 90, { steps: 1 })
  await new Promise((r) => setTimeout(r, 16))
}
await page.mouse.up()
const out = await page.evaluate(() => {
  const s = window.__store.getState()
  const dt = (performance.now() - window.__fps.t0) / 1000
  return {
    tierAfterOrbit: s.qualityTier,
    userSet: s.qualityUserSet,
    autoShadowsOff: s.autoShadowsOff,
    fps: +(window.__fps.frames / dt).toFixed(1),
    dpr: window.devicePixelRatio,
  }
})
console.log(JSON.stringify({ bootTier: boot, ...out }, null, 1))
await browser.close()
