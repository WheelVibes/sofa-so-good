// Deterministic verification for PERF-MAX-1: sample per-frame WebGL draw calls
// (gl.info.render.calls) during a continuous auto-rotate span at a pinned tier.
// When the sun shadow map is frozen (static scene), the shadow depth pass — one
// draw call per shadow-casting mesh — is skipped, so per-frame calls DROP after
// warmup. Independent of swiftshader timing noise.
//
// Usage: node scripts/perf-drawcalls.mjs [tier]
import puppeteer from 'puppeteer'

const tier = process.argv[2] || 'maximum'

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--window-size=800,600',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 640, height: 420 })
await page.goto(process.env.SHOT_URL || 'http://localhost:5173/', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
})
await new Promise((r) => setTimeout(r, 6000))

const setup = await page.evaluate((t) => {
  const s = window.__store.getState()
  s.dismissLocationPrompt()
  s.setLocation({ lat: 1.3521, lon: 103.8198, label: 'SG' })
  s.setManualHour(13)
  s.setQualityTier(t)
  if (!s.autoRotate) s.toggleAutoRotate()
  return { items: s.items.length, tier: window.__store.getState().qualityTier }
}, tier)

// Warm up: let the shadow build then freeze, and let auto-rotate spin up.
await new Promise((r) => setTimeout(r, 4000))

// Hook gl.render to count real renders and accumulate total draw calls with
// autoReset OFF — so calls/renders is a clean per-frame average, immune to the
// async-sampling race against multi-second software frames.
const WINDOW_MS = 25000
const sample = await page.evaluate(async (win) => {
  const g = window.__three?.gl
  if (!g) return { error: 'no __three.gl' }
  const prevAuto = g.info.autoReset
  g.info.autoReset = false
  g.info.reset()
  let renders = 0
  let calls = 0
  let tris = 0
  const orig = g.render.bind(g)
  g.render = (...a) => {
    const r = orig(...a)
    renders++
    calls += g.info.render.calls
    tris += g.info.render.triangles
    g.info.reset()
    return r
  }
  await new Promise((r) => setTimeout(r, win))
  g.render = orig
  g.info.autoReset = prevAuto
  return {
    renders,
    callsPerFrame: renders ? Math.round((calls / renders) * 10) / 10 : 0,
    trisPerFrame: renders ? Math.round(tris / renders) : 0,
  }
}, WINDOW_MS)

console.log(JSON.stringify({ ...setup, ...sample }))
await browser.close()
