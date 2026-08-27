/**
 * Steady-state orbit FPS per render tier, with the tier PINNED (`qualityUserSet`)
 * so the adaptive guard can't move it mid-measurement. This is the data behind
 * the auto-detect ceiling: an auto-selected tier is only defensible if it holds
 * the 30fps floor on the hardware it is selected for.
 */
import puppeteer from 'puppeteer'

const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
const DSF = Number(process.env.DSF || 2)
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate(
  (h) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
const b = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = b.x + b.w / 2,
  cy = b.y + b.h / 2
console.log(`viewport 1280x800 @ dpr ${DSF}  (drawing buffer ${1280 * DSF}x${800 * DSF})`)
for (const tier of TIERS) {
  // setQualityTier pins `qualityUserSet`, disabling the adaptive guard.
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))
  await page.evaluate(() => {
    window.__f = { n: 0, t0: 0, worst: 0, last: 0 }
    const tick = (t) => {
      const f = window.__f
      if (f.t0 === 0) {
        f.t0 = t
        f.last = t
      } else {
        const d = t - f.last
        f.last = t
        if (d > f.worst) f.worst = d
        f.n++
      }
      f.raf = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 140; i++) {
    await page.mouse.move(cx + Math.sin(i / 10) * 260, cy + Math.cos(i / 14) * 90, { steps: 1 })
    await new Promise((r) => setTimeout(r, 8))
  }
  await page.mouse.up()
  const r = await page.evaluate(() => {
    const f = window.__f
    cancelAnimationFrame(f.raf)
    const secs = (f.last - f.t0) / 1000
    return { fps: +(f.n / secs).toFixed(1), worstFrameMs: +f.worst.toFixed(1) }
  })
  console.log(
    `${tier.padEnd(12)} orbit fps=${String(r.fps).padStart(5)}  worst frame=${String(r.worstFrameMs).padStart(6)}ms  ${r.fps >= 30 ? 'OK' : 'BELOW 30fps FLOOR'}`,
  )
}
await browser.close()
