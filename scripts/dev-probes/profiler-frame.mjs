/**
 * PROFILER-FRAME — settle whether Maximum actually misses 60 fps.
 *
 * Two measurements of the same machine and scene disagree, and the ladder depends on
 * which is right:
 *   · `scene/frameCost.ts` (what TIER-ADAPTIVE promotes on) SUMS `renderer.render`
 *     durations inside the rAF loop — CPU submit time — and puts Maximum at ~11.7 ms
 *     p50, comfortably inside the 16.67 ms budget.
 *   · the dev profiler drives `advance()` in a tight BATCH outside rAF and fences with
 *     `gl.finish()` once per batch, and its commit message reports Maximum at
 *     **9.10 ms of a 34.54 ms frame** — a frame that misses 60 fps by 2x.
 *
 * `cost-signal.mjs` could not adjudicate this: a `finish()` inside a rAF callback blocks
 * on the PRESENTATION queue, so it ranked the cheapest tier as the slowest (16.5 ms at
 * `performance`, pinned to the refresh interval — COST-SIGNAL-VSYNC). The profiler's loop
 * is the one method here that is not vsync-paced, so rather than build a third timer this
 * runs the REPO'S OWN profiler and reads its `baselineMs` directly.
 *
 * The profiler is dev-only and gated on the `profiler` feature flag, which is
 * `tier: 'pro'` — and Simple mode (the app default) forces pro flags OFF — so this
 * switches `uiMode` to 'pro' first, which re-resolves the flag map.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 21)
const TIER = process.env.TIER || 'maximum'
const OUT = process.env.OUT || '/tmp/ssg-night-lights'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  // `runCostBreakdown` is ONE long `evaluate` call, and the paired baseline
  // (PROFILER-PAIRED-BASELINE) roughly doubles its length — past puppeteer's
  // 180 s default `protocolTimeout`, which kills the run mid-sweep with a
  // ProtocolError that looks like a page crash but is only the CDP deadline.
  protocolTimeout: 900_000,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
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
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const QUICK = process.env.QUICK !== '0'

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3500))

// The profiler flag is `tier: 'pro'`, and Simple mode forces pro flags off.
await page.evaluate(() => window.__store.getState().setUiMode('pro'))
await page.waitForFunction(() => !!window.__profiler, { timeout: 30000 })
await page.evaluate((m) => window.__store.getState().setLightsMode(m), process.env.LIGHTS || 'on')
await new Promise((r) => setTimeout(r, 2500))
await assertSceneAlive(page, 'profiler ready')

/** Plain submit-time cost, measured the way `scene/frameCost.ts` does, while the
 *  canvas is driven. Run BEFORE and AFTER the sweep: if the same scene measures
 *  slower afterwards, the sweep degrades the renderer it is measuring, and its
 *  absolute numbers (and its later rows) cannot be trusted. */
async function plainCost(label) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const cx = Math.round(box.x + box.w / 2)
  const cy = Math.round(box.y + box.h / 2)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const running = page.evaluate(
    () =>
      new Promise((resolve) => {
        const gl = window.__three.gl
        const orig = gl.render.bind(gl)
        let acc = 0
        const out = []
        gl.render = (...a) => {
          const t = performance.now()
          orig(...a)
          acc += performance.now() - t
        }
        let frames = 0
        const tick = () => {
          if (acc > 0) out.push(acc)
          acc = 0
          if (++frames < 180) requestAnimationFrame(tick)
          else {
            gl.render = orig
            resolve(out)
          }
        }
        requestAnimationFrame(tick)
      }),
  )
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(cx + (i % 20) * 4, cy + (i % 2 === 0 ? 3 : -3))
    await new Promise((r) => setTimeout(r, 100))
  }
  const out = await running
  await page.mouse.up()
  const sorted = out.slice().sort((a, b) => a - b)
  const p50 = sorted.length ? +sorted[Math.floor(sorted.length * 0.5)].toFixed(2) : 0
  console.log(`  submit p50 ${label}: ${p50} ms  (n=${sorted.length})`)
  return p50
}

console.log(`tier=${TIER} hour=${HOUR} lights=${process.env.LIGHTS || 'on'} quick=${QUICK}`)
const before = await plainCost('BEFORE sweep')
console.log('running the repo dev profiler cost breakdown — this drives its own frames\n')

const rows = await page.evaluate(
  async (quick) => await window.__profiler.runCostBreakdown(undefined, { quick }),
  QUICK,
)

const after = await plainCost('AFTER sweep')
console.log(
  `  drift: ${before} -> ${after} ms  (${after > before * 1.3 ? 'SWEEP DEGRADES THE RENDERER' : 'stable'})\n`,
)

if (!rows?.length) {
  console.log('profiler returned no rows')
} else {
  // Every row shares the same baseline frame — that IS the profiler's answer for
  // "how long does a frame take at this tier".
  const baselines = rows.map((r) => r.baselineMs).filter((v) => Number.isFinite(v))
  const base = baselines.length ? baselines.reduce((a, b) => a + b, 0) / baselines.length : 0
  console.log('effect                         baseline   disabled     delta   fpsGain')
  for (const r of rows.slice().sort((a, b) => b.deltaMs - a.deltaMs)) {
    console.log(
      `${String(r.label).slice(0, 28).padEnd(29)} ${r.baselineMs.toFixed(2).padStart(8)} ` +
        `${r.disabledMs.toFixed(2).padStart(10)} ${r.deltaMs.toFixed(2).padStart(9)} ` +
        `${r.fpsGain.toFixed(1).padStart(9)}`,
    )
  }
  console.log(
    `\nprofiler baseline frame: ${base.toFixed(2)} ms  ->  ${(1000 / base).toFixed(1)} fps ` +
      `(60 fps budget = 16.67 ms) — ${base > 16.67 ? 'MISSES' : 'MEETS'} the budget`,
  )
}
await browser.close()
