/**
 * Identifies WHY an orbit frame composites blank, with near-zero instrumentation
 * (heavy GL wrapping perturbs the timing enough to hide the bug).
 *
 * Reads three's own counters — `gl.info.render.frame` (incremented per
 * renderer.render) and the live drawing-buffer size / pixel ratio — around each
 * captured frame, plus a tiny log of the two resize entry points. A blank frame
 * then tells us which it is: a resize with no repaint, or a frame that never rendered.
 */

import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, centerBox, frameStats, isBlank } from './lib.mjs'

const OUT = '/tmp/ssg-cause'
const TIER = process.env.TIER || 'realistic'
const FRAMES = Number(process.env.FRAMES || 30)
const REPS = Number(process.env.REPS || 3)
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
await page.evaluate(
  (h) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
await new Promise((r) => setTimeout(r, 1500))
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
// Optional per-setting override so a single tier axis can be isolated from the
// rest of the tier preset (e.g. High with the post stack off, but High's shadow
// map / VSM filter / DPR / geometry detail all unchanged).
if (process.env.OVERRIDE) {
  const [k, v] = process.env.OVERRIDE.split('=')
  await page.evaluate(
    (k, v) =>
      window.__store
        .getState()
        .setQualityOverride(k, v === 'true' ? true : v === 'false' ? false : Number(v)),
    k,
    v,
  )
  await new Promise((r) => setTimeout(r, 3000))
}
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 5000))

// Two tiny wrappers on the resize entry points — called a handful of times per
// second, so they cost nothing and don't shift the timing the way per-GL-call
// wrapping does.
await page.evaluate(() => {
  const gl = window.__three.gl
  window.__rs = []
  const oS = gl.setSize.bind(gl)
  gl.setSize = (w, h, u) => {
    window.__rs.push({ t: +performance.now().toFixed(1), k: 'setSize', w, h })
    return oS(w, h, u)
  }
  const oP = gl.setPixelRatio.bind(gl)
  gl.setPixelRatio = (v) => {
    window.__rs.push({ t: +performance.now().toFixed(1), k: 'setPixelRatio', v })
    return oP(v)
  }
})
const snap = () =>
  page.evaluate(() => {
    const gl = window.__three.gl
    const rs = window.__rs.splice(0)
    return {
      frame: gl.info.render.frame,
      calls: gl.info.render.calls,
      ratio: gl.getPixelRatio(),
      bw: gl.domElement.width,
      bh: gl.domElement.height,
      rs,
    }
  })

const box = centerBox(1280, 800)
const canvasBox = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = canvasBox.x + canvasBox.w / 2,
  cy = canvasBox.y + canvasBox.h / 2

let blanks = 0,
  total = 0
for (let rep = 0; rep < REPS; rep++) {
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  let prev = await snap()
  for (let i = 0; i < FRAMES; i++) {
    await page.mouse.move(cx + (i + 1) * 14, cy + Math.sin(i / 4) * 8, { steps: 2 })
    const buf = await page.screenshot({ type: 'png' })
    const cur = await snap()
    const st = await frameStats(buf, box)
    total++
    const blank = isBlank(st)
    const line = `rep${rep} i=${String(i).padStart(2)} frames+${cur.frame - prev.frame} calls=${cur.calls} ratio=${cur.ratio} buf=${cur.bw}x${cur.bh} resizes=${JSON.stringify(cur.rs)}`
    if (blank) {
      blanks++
      console.log(`BLANK ${line}`)
      fs.writeFileSync(`${OUT}/blank-r${rep}-${i}.png`, buf)
    } else if (process.env.VERBOSE) console.log(`ok    ${line}`)
    prev = cur
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 1200))
}
console.log(`\nblank ${blanks}/${total}`)
await browser.close()
