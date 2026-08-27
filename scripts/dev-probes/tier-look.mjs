/**
 * Tier look comparison. Captures a settled still per render tier at a set of
 * pinned hours, from an identical camera pose, and reports exposure statistics
 * (mean / contrast / clipped-highlight fraction) so "the higher tiers are too
 * bright" is a measurement rather than an impression.
 */

import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-look'
const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
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
    const s = await frameStats(buf, box)
    rows.push({ hour, tier, ...s })
    console.log(
      `h=${String(hour).padStart(2)} ${tier.padEnd(12)} mean=${String(s.mean).padStart(6)} contrast(sd)=${String(s.sd).padStart(6)} clipped=${(s.clipped * 100).toFixed(2)}%`,
    )
  }
}
fs.writeFileSync(path.join(OUT, 'tier-look.json'), JSON.stringify(rows, null, 2))
await browser.close()
