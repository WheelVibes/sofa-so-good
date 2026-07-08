// Relative FPS harness for continuous-render (orbit auto-rotate) stress at a
// PINNED render tier. Software WebGL (swiftshader) so absolute numbers are low
// and meaningless — use ONLY for A/B before/after comparisons of a rendering
// change. Unlike perf.mjs (near-idle demand mode), this forces a continuous
// render span (autoRotate) at maximum tier in daylight so the sun shadow pass +
// post stack run every frame — the path PERF-MAX-1 targets.
//
// Usage: node scripts/perf-orbit.mjs [tier] [itemCount]
//   tier default 'maximum'; itemCount default 40.
import puppeteer from 'puppeteer'

const tier = process.argv[2] || 'maximum'
const count = Number(process.argv[3] || 40)

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--window-size=1400,900',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
// Small viewport: shrink the non-shadow (main-pass + post) fill so the per-frame
// delta is dominated by the sun shadow pass PERF-MAX-1 targets, and so frames
// are frequent enough to time even under swiftshader.
await page.setViewport({ width: 720, height: 480 })
await page.goto(process.env.SHOT_URL || 'http://localhost:5173/', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
})
await new Promise((r) => setTimeout(r, 6000))

const placed = await page.evaluate(
  ({ n, t }) => {
    const s = window.__store.getState()
    s.dismissLocationPrompt()
    s.setLocation({ lat: 1.3521, lon: 103.8198, label: 'SG' })
    s.setManualHour(13) // midday — sun high, shadows active
    s.setQualityTier(t) // pin tier (also disables the FPS auto-downgrade)
    const defs = [
      'armchair',
      'dining-chair',
      'coffee-table',
      'potted-plant',
      'floor-lamp',
      'nightstand',
      'bookshelf',
      'wardrobe-3door',
      'desk',
      'bed-queen',
      'sofa-3seat',
    ]
    for (let i = 0; i < n; i++) {
      const def = defs[i % defs.length]
      const x = 1 + (i % 11) * 1.05
      const z = 1 + Math.floor(i / 11) * 1.0
      s.addItem({ defId: def, position: [x, z], rotation: ((i % 4) * Math.PI) / 2, props: {} })
    }
    s.selectItem(null)
    s.setSelectedItemIds([])
    if (!s.autoRotate) s.toggleAutoRotate() // force a continuous render span
    return { items: s.items.length, tier: window.__store.getState().qualityTier }
  },
  { n: count, t: tier },
)

// Let the scene warm + the shadow map build, then measure a fixed window.
const WINDOW_MS = 15000
await new Promise((r) => setTimeout(r, 2500))
const m = await page.evaluate(
  (win) =>
    new Promise((resolve) => {
      let frames = 0
      const start = performance.now()
      function loop(t) {
        frames++
        if (t - start >= win) resolve({ frames, elapsed: Math.round(t - start) })
        else requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }),
  WINDOW_MS,
)
const frameMs = Math.round((m.elapsed / m.frames) * 10) / 10
const fps = Math.round(((m.frames * 1000) / m.elapsed) * 10) / 10

const heapMB = await page.evaluate(() => {
  const mm = performance.memory
  return mm ? Math.round(mm.usedJSHeapSize / 1048576) : null
})

console.log(JSON.stringify({ ...placed, requested: count, frames: m.frames, frameMs, fps, heapMB }))
await browser.close()
