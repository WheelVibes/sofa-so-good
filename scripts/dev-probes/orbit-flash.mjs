/**
 * Orbit white-flash detector + tier look comparison.
 * Drives a real mouse orbit drag on the canvas at a given tier while capturing
 * a burst of screenshots, then reports per-frame mean luminance so a white
 * flash (a frame far brighter than its neighbours) is detectable numerically.
 */

import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, centerBox, frameStats, isBlank } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-shots'
const URL_ = appUrl()
const REPS = Number(process.env.REPS || 1)
const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
const FRAMES = Number(process.env.FRAMES || 26)
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
    '--window-size=1600,1000',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
const logs = []
page.on('console', (m) => {
  const t = m.text()
  if (/error|lost|context|warn/i.test(t) || m.type() === 'error') logs.push(`[${m.type()}] ${t}`)
})
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
  window.__glEvents = []
  const origGet = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (...a) {
    const ctx = origGet.apply(this, a)
    if (/webgl/.test(a[0])) {
      this.addEventListener('webglcontextlost', () =>
        window.__glEvents.push({ t: performance.now(), e: 'lost' }),
      )
      this.addEventListener('webglcontextrestored', () =>
        window.__glEvents.push({ t: performance.now(), e: 'restored' }),
      )
    }
    return ctx
  }
})
await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
// Dismiss the first-run "Where are you?" location prompt (a store flag) — it is
// a modal that covers the canvas and swallows the orbit drag.
await page.evaluate(() => {
  window.__store?.getState?.().dismissLocationPrompt?.()
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /use default location|^\s*skip\b/i.test(b.textContent || ''),
  )
  btn?.click()
})
await page.waitForFunction(() => window.__store?.getState().sceneReady, {
  timeout: 90000,
})
// Pin the clock so every tier/run is compared under IDENTICAL lighting. The app
// default is timeMode 'system' (the viewer's real clock), so an unpinned run
// silently renders whatever time it happens to be — a night run has full-strength
// bloom + lit fixtures and is not comparable to a daylight one.
await page.evaluate(
  (h) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
await new Promise((r) => setTimeout(r, 1500))

await new Promise((r) => setTimeout(r, 2500))

const report = {}
const RUNS = []
for (let r = 0; r < REPS; r++) for (const t of TIERS) RUNS.push({ tier: t, rep: r })
for (const { tier, rep } of RUNS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  // Wait for the tier-change transition overlay to clear.
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 4000))
  await page.evaluate(() => {
    window.__glEvents = []
  })

  const box = centerBox(1280, 800)
  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const cx = canvasBox.x + canvasBox.w / 2,
    cy = canvasBox.y + canvasBox.h / 2

  // Steady frame BEFORE the gesture (the look reference).
  const still = await page.screenshot({ type: 'png' })
  if (rep === 0) fs.writeFileSync(path.join(OUT, `${tier}-00-still.png`), still)

  // Real orbit drag: press, then many small moves, capturing between them.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const frames = []
  for (let i = 0; i < FRAMES; i++) {
    await page.mouse.move(cx + (i + 1) * 14, cy + Math.sin(i / 4) * 8, { steps: 2 })
    const buf = await page.screenshot({ type: 'png' })
    const s = await frameStats(buf, box)
    frames.push(s)
    if (s.mean > 160)
      fs.writeFileSync(
        path.join(OUT, `FLASH-${tier}-r${rep}-${String(i).padStart(2, '0')}.png`),
        buf,
      )
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 1200))
  const after = await page.screenshot({ type: 'png' })
  if (rep === 0) fs.writeFileSync(path.join(OUT, `${tier}-99-after.png`), after)

  const glEvents = await page.evaluate(() => window.__glEvents)
  const means = frames.map((f) => f.mean)
  const med = [...means].sort((a, b) => a - b)[Math.floor(means.length / 2)]
  // A white flash is a FEATURELESS canvas (page background through a cleared
  // buffer), not merely a bright one — key on variance, never brightness.
  const spikes = frames.map((f, i) => ({ i, ...f })).filter((f) => isBlank(f))
  report[`${tier}-r${rep}`] = {
    stillMean: (await frameStats(still, box)).mean,
    afterMean: (await frameStats(after, box)).mean,
    medianOrbitMean: med,
    min: Math.min(...means),
    max: Math.max(...means),
    spikes,
    glEvents,
    means,
  }
  const R = report[`${tier}-r${rep}`]
  console.log(`\n### ${tier} (rep ${rep})`)
  console.log(`still=${R.stillMean} median=${med} min=${R.min} max=${R.max}`)
  console.log('means:', means.join(' '))
  if (spikes.length) console.log('SPIKES:', JSON.stringify(spikes))
  if (glEvents.length) console.log('GL EVENTS:', JSON.stringify(glEvents))
}
fs.writeFileSync(path.join(OUT, 'orbit-flash-report.json'), JSON.stringify(report, null, 2))
console.log('\n=== CONSOLE ===')
console.log([...new Set(logs)].slice(0, 40).join('\n'))
await browser.close()
