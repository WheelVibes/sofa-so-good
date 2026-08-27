/**
 * Does the sun shadow map contribute anything visible in the orbit view?
 *
 * Renders the same pose/hour/tier twice — once with the tier's real
 * `shadowMapSize`, once with it overridden to 0 (sun shadows off) — and reports
 * the mean absolute per-pixel difference. The shadow map is the most expensive
 * single thing the higher tiers buy (up to 4096²), so if the two frames are
 * effectively identical, that spend is producing nothing the user can see.
 */

import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, centerBox } from './lib.mjs'

const OUT = '/tmp/ssg-shadow'
fs.mkdirSync(OUT, { recursive: true })
const TIER = process.env.TIER || 'maximum'
const HOURS = (process.env.HOURS || '9,13,17').split(',').map(Number)

async function raw(buf, box) {
  return sharp(buf)
    .extract({
      left: Math.round(box.x),
      top: Math.round(box.y),
      width: Math.round(box.w),
      height: Math.round(box.h),
    })
    .removeAlpha()
    .raw()
    .toBuffer()
}

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
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => {
  window.__store.getState().dismissLocationPrompt?.()
  ;[...document.querySelectorAll('button')]
    .find((b) => /use default location|^\s*skip\b/i.test(b.textContent || ''))
    ?.click()
})
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
const box = centerBox(1280, 800)

for (const hour of HOURS) {
  await page.evaluate((h) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(h)
  }, hour)
  await new Promise((r) => setTimeout(r, 3000))
  const shots = {}
  for (const [label, size] of [
    ['on', null],
    ['off', 0],
  ]) {
    await page.evaluate((s) => {
      const st = window.__store.getState()
      // NEVER clear by writing undefined — that sets shadowMapSize to undefined,
      // so `castShadow={shadowMapSize > 0}` is false and shadows are OFF. An
      // earlier version of this probe did exactly that for its "shadows on" arm,
      // so both arms ran shadowless and the reported difference was pure noise.
      if (s === null) st.resetQualityOverrides()
      else st.setQualityOverride('shadowMapSize', s)
    }, size)
    await new Promise((r) => setTimeout(r, 3500))
    const buf = await page.screenshot({ type: 'png' })
    fs.writeFileSync(`${OUT}/${TIER}-h${hour}-shadows-${label}.png`, buf)
    shots[label] = await raw(buf, box)
  }
  let sum = 0,
    max = 0,
    changed = 0
  for (let i = 0; i < shots.on.length; i++) {
    const d = Math.abs(shots.on[i] - shots.off[i])
    sum += d
    if (d > max) max = d
    if (d > 3) changed++
  }
  const n = shots.on.length
  console.log(
    `${TIER} h=${hour}: meanAbsDiff=${(sum / n).toFixed(3)} maxDiff=${max} pixelsChanged>3 = ${((100 * changed) / n).toFixed(2)}%`,
  )
}
await browser.close()
