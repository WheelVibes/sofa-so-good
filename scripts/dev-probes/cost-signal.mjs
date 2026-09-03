/**
 * COST-SIGNAL — does the adaptive ladder's cost meter under-report GPU work?
 *
 * `scene/frameCost.ts` drives TIER-ADAPTIVE's promote/demote decisions by SUMMING
 * `renderer.render` durations per animation frame. Its own docstring concedes this is
 * "CPU submit time, not GPU completion time" and assumes submit "tracks well enough in
 * practice because a starved GPU backs pressure up into the submitting call".
 *
 * That assumption is now testable, because staging's reworked dev profiler — which
 * measures with a synchronous `advance` + `gl.finish()` — reports Maximum spending
 * **9.10 ms of a 34.54 ms frame** on the 19 fixture lights, where this suite's meter
 * measures the whole frame at ~11.7 ms p50 and the fixtures at 1.6 ms. Both cannot be
 * right about the same machine, and the difference matters: if submit time
 * under-reports, the ladder can promote to a tier that actually misses frame budget.
 *
 * So this measures BOTH signals over the SAME frames (meta-rule i):
 *   submit     — sum of render() durations in the frame, exactly what frameCost.ts does
 *   completion — first render start to after a `gl.finish()` at end of frame, i.e.
 *                including the GPU work the submit number may be hiding
 * A camera drag drives the canvas throughout, because `frameloop="demand"` means an
 * idle canvas renders nothing and both numbers would measure the pump (meta-rule xviii).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 21)
const OUT = process.env.OUT || '/tmp/ssg-night-lights'
fs.mkdirSync(OUT, { recursive: true })

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

const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const SECONDS = Number(process.env.SECONDS || 5)

await page.evaluate((m) => window.__store.getState().setLightsMode(m), process.env.LIGHTS || 'on')
await new Promise((r) => setTimeout(r, 1500))

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = Math.round(box.x + box.w / 2)
const cy = Math.round(box.y + box.h / 2)

async function measure() {
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const running = page.evaluate((secs) => {
    return new Promise((resolve) => {
      const gl = window.__three.gl
      const raw = gl.getContext()
      const orig = gl.render.bind(gl)
      let submitAcc = 0
      let firstStart = 0
      let rendered = false
      gl.render = (...a) => {
        const t = performance.now()
        if (!rendered) {
          firstStart = t
          rendered = true
        }
        orig(...a)
        submitAcc += performance.now() - t
      }
      const submit = []
      const completion = []
      let frames = 0
      const tick = () => {
        if (rendered) {
          // Fence AFTER the frame's last render call: the difference between this
          // and the submit sum is the GPU work the submit number cannot see.
          raw.finish()
          completion.push(performance.now() - firstStart)
          submit.push(submitAcc)
        }
        submitAcc = 0
        rendered = false
        if (++frames < secs * 60) requestAnimationFrame(tick)
        else {
          gl.render = orig
          resolve({ submit, completion })
        }
      }
      requestAnimationFrame(tick)
    })
  }, SECONDS)
  for (let i = 0; i < SECONDS * 10; i++) {
    await page.mouse.move(cx + (i % 20) * 4, cy + (i % 2 === 0 ? 3 : -3))
    await new Promise((r) => setTimeout(r, 100))
  }
  const out = await running
  await page.mouse.up()
  const stat = (a) => {
    const s = a.slice().sort((x, y) => x - y)
    const q = (p) =>
      s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0
    return {
      n: s.length,
      p50: q(0.5),
      p90: q(0.9),
      max: s.length ? +s[s.length - 1].toFixed(1) : 0,
    }
  }
  return { submit: stat(out.submit), completion: stat(out.completion) }
}

console.log(`hour=${HOUR} orbit drag, ${SECONDS}s per tier — submit vs completion\n`)
console.log('tier          n    submitP50  submitP90   complP50  complP90  complMax   ratio')
for (const tier of TIERS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 3500))
  await assertSceneAlive(page, `tier ${tier}`)
  const m = await measure()
  const ratio = m.submit.p50 > 0 ? (m.completion.p50 / m.submit.p50).toFixed(2) : 'n/a'
  console.log(
    `${tier.padEnd(13)} ${String(m.submit.n).padStart(3)} ${String(m.submit.p50).padStart(10)} ` +
      `${String(m.submit.p90).padStart(10)} ${String(m.completion.p50).padStart(10)} ` +
      `${String(m.completion.p90).padStart(9)} ${String(m.completion.max).padStart(9)} ${ratio.padStart(7)}`,
  )
}
await browser.close()
