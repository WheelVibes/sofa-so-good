/**
 * Tier look comparison. Captures a settled still per render tier at a set of
 * pinned hours, from an identical camera pose, and reports exposure statistics
 * (mean / contrast / clipped-highlight fraction) so "the higher tiers are too
 * bright" is a measurement rather than an impression.
 *
 * ## The authoritative number is the CENTRE SLAB, not the full canvas
 *
 * This probe used to report only the full canvas rect, and that is dominated by
 * **DOM chrome, not by the render**. The toolbar, the "Get started" card and the
 * zoom/compass rail are opaque-ish panels drawn OVER the canvas; they are also
 * translucent, so their brightness tracks whatever the canvas puts behind them
 * and they therefore differ per tier — which makes them look exactly like a
 * render regression.
 *
 * How badly: at 13:00 the full-canvas clipped fraction read **6.79% on
 * Performance and 6.85% on Medium against 1.28% / 1.50% on High / Maximum**, and
 * that got written up as "~7% of the midday frame is blown at the flat tiers".
 * Re-measured on the IDENTICAL saved frames over `lib.mjs:centerBox`, the 3D
 * render clips **0.03% / 0.26% / 0.25% / 0.27%** — i.e. nothing, at every tier.
 * A 4x4 grid of the full canvas put the blown pixels in the top-centre cells
 * (22% — the toolbar), the bottom-left cell (54% — the "Get started" card) and
 * the bottom-right rail, with every interior cell at 0.0%.
 *
 * So both are printed, the centre slab is the one to quote, and any future
 * exposure claim from this probe must come from the slab. `lib.mjs:centerBox`
 * exists for exactly this reason and its own docstring says so; this probe simply
 * was not using it.
 */

import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, centerBox, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-look'
const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const HOURS = (process.env.HOURS || '13').split(',').map(Number)
const URL_ = appUrl()
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => {
  window.__store.getState().dismissLocationPrompt?.()
  ;[...document.querySelectorAll('button')]
    .find((b) => /use default location|^\s*skip\b/i.test(b.textContent || ''))
    ?.click()
})
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
// Pin the fixture-light mode so every run is comparable. An earlier version of
// this probe blind-clicked the first button whose aria-label matched
// /dismiss|close/, which silently flipped the toolbar lights toggle between runs
// and made two captures non-comparable.
await page.evaluate(() => window.__store.getState().setLightsMode('on'))
const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})

const rows = []
for (const hour of HOURS) {
  await page.evaluate((h) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(h)
  }, hour)
  await new Promise((r) => setTimeout(r, 2000))
  for (const tier of TIERS) {
    await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
    await page
      .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 4500))
    const buf = await page.screenshot({ type: 'png' })
    const name = `h${String(hour).padStart(2, '0')}-${tier}.png`
    fs.writeFileSync(path.join(OUT, name), buf)
    // Full canvas (kept for continuity, and to keep the DOM contribution
    // visible) and the DOM-free centre slab, which is the authoritative one.
    const full = await frameStats(buf, box)
    const cb = centerBox(box.w, box.h)
    const s = await frameStats(buf, { x: box.x + cb.x, y: box.y + cb.y, w: cb.w, h: cb.h })
    rows.push({ hour, tier, ...s, fullClipped: full.clipped })
    console.log(
      `h=${String(hour).padStart(2)} ${tier.padEnd(12)} SLAB mean=${String(s.mean).padStart(6)} contrast(sd)=${String(s.sd).padStart(6)} clipped=${(s.clipped * 100).toFixed(2)}%` +
        `   | full-canvas clipped=${(full.clipped * 100).toFixed(2)}% (DOM chrome — do NOT quote)`,
    )
  }
}
fs.writeFileSync(path.join(OUT, 'tier-look.json'), JSON.stringify(rows, null, 2))
await browser.close()
