/**
 * TRUE per-frame cost in milliseconds, per tier.
 *
 * Every earlier fps figure in these probes counted `requestAnimationFrame`
 * ticks. That is NOT the render rate: the main Canvas is `frameloop="demand"`,
 * so the browser ticks at the display rate while r3f renders only when
 * invalidated — measured 59.7 rAF/s against 30.5 actual renders/s. rAF-based
 * numbers are therefore a CEILING proxy, useless as an absolute frame rate and
 * useless for choosing a tier.
 *
 * This wraps `renderer.render` and times it, giving CPU submit cost per rendered
 * frame (the GPU can still be behind, but a starved GPU blocks the submit, so it
 * tracks). Reported as p50/p90/max plus the achieved render rate.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 12)

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
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
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

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2

console.log(
  `viewport 1280x800 @ dpr ${DSF} (${((1280 * DSF * 800 * DSF) / 1e6).toFixed(1)}M px), ${SECONDS}s orbit per tier`,
)
for (const tier of TIERS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 4000))
  await page.evaluate(() => {
    const gl = window.__three.gl
    if (gl.__ftRestore) gl.__ftRestore()
    const orig = gl.render.bind(gl)
    window.__ft = { ms: [], raf: 0, t0: performance.now() }
    // Sum every render() inside ONE displayed frame. Nesting depth cannot
    // identify "a frame" here: at the post tiers the composer issues ~18
    // SIBLING render() calls per frame (plus a mirror's full extra scene pass),
    // so timing each one separately reports the parts and inflates the render
    // rate to ~1000/s. Bucket by animation frame and flush on the rAF boundary.
    let bucket = 0
    gl.render = (sc, cam) => {
      const t = performance.now()
      try {
        return orig(sc, cam)
      } finally {
        bucket += performance.now() - t
      }
    }
    gl.__ftRestore = () => {
      gl.render = orig
    }
    const tick = () => {
      window.__ft.raf++
      if (bucket > 0) {
        window.__ft.ms.push(bucket)
        bucket = 0
      }
      window.__ft.rafId = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const t0 = Date.now()
  let i = 0
  while ((Date.now() - t0) / 1000 < SECONDS) {
    await page.mouse.move(cx + Math.sin(i / 10) * 250, cy + Math.cos(i / 14) * 85, { steps: 1 })
    await new Promise((r) => setTimeout(r, 8))
    i++
  }
  await page.mouse.up()
  const r = await page.evaluate(() => {
    const f = window.__ft
    cancelAnimationFrame(f.rafId)
    const secs = (performance.now() - f.t0) / 1000
    const a = f.ms.slice().sort((x, y) => x - y)
    const q = (p) =>
      a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : -1
    return {
      n: a.length,
      p50: q(0.5),
      p90: q(0.9),
      max: +(a[a.length - 1] ?? -1).toFixed(1),
      renderHz: +(a.length / secs).toFixed(1),
      rafHz: +(f.raf / secs).toFixed(1),
    }
  })
  console.log(
    `${tier.padEnd(12)} frame cost p50=${String(r.p50).padStart(6)}ms p90=${String(r.p90).padStart(6)}ms max=${String(r.max).padStart(6)}ms   drawnFrames/s=${String(r.renderHz).padStart(5)}  (rAF/s=${r.rafHz})`,
  )
}
await browser.close()
