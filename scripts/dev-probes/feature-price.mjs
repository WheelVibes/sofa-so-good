/**
 * Prices each tier feature in BOTH currencies at once: milliseconds of p90
 * per-displayed-frame cost, and the fraction of pixels it actually changes.
 *
 * A feature is only worth its slot if those two move together. The motivating
 * finding: the 4096² sun shadow map at Maximum changed 0.47% of pixels — so
 * whatever it costs, it is nearly all waste indoors. This probe makes that
 * comparison systematic across every knob rather than one at a time.
 *
 * Cost measurement follows `frameCost.ts`' rules: sum every `render()` inside one
 * animation frame (the post stack issues ~18 sibling calls) and never quote a
 * frame RATE, because under `frameloop="demand"` rAF ticks are not renders.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, centerBox } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-price'
const TIER = process.env.TIER || 'maximum'
const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 10)
const HOUR = Number(process.env.HOUR || 13)
fs.mkdirSync(OUT, { recursive: true })

/** Each case is one quality override applied on top of TIER's preset. */
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean)
const ALL_CASES = [
  { label: 'baseline (tier preset)', ov: {} },
  { label: 'shadowMapSize 0 (no sun shadows)', ov: { shadowMapSize: 0 } },
  { label: 'shadowMapSize 1024', ov: { shadowMapSize: 1024 } },
  { label: 'shadowMapSize 2048', ov: { shadowMapSize: 2048 } },
  { label: 'postprocessing off (no composer)', ov: { postprocessing: false } },
  { label: 'aoFullRes off (half-res AO)', ov: { aoFullRes: false } },
  { label: 'cinematic off (no grain/CA)', ov: { cinematic: false } },
  { label: 'geometryDetail 1.0', ov: { geometryDetail: 1 } },
  { label: 'geometryDetail 0.7', ov: { geometryDetail: 0.7 } },
  { label: 'ibl off', ov: { ibl: false } },
  { label: 'contactShadows off', ov: { contactShadows: false } },
  { label: 'ao off (TIER-AO)', ov: { ao: false } },
]

/**
 * Measured cases, with two guards against ORDERING BIAS:
 *  - a discarded WARM-UP pass, because the first measured case pays shader
 *    compilation and first-use GPU allocation that later ones don't;
 *  - the baseline repeated at the END, so the run reports whether position in
 *    the sequence moved the number. Without these the baseline measured 16.8ms
 *    first and 12.0ms warm, making every later case look ~3ms cheaper than it is.
 */
const CASES = [
  { label: 'WARMUP (discarded)', ov: {}, warmup: true },
  ...(ONLY.length ? ALL_CASES.filter((c) => ONLY.some((o) => c.label.includes(o))) : ALL_CASES),
  { label: 'baseline again (ordering check)', ov: {} },
]

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
// `interactiveDegrade` halves the DPR during a camera gesture — but ONLY at the
// post-processing tiers. That makes cross-case cost comparison invalid the moment
// a case flips `postprocessing`: the no-composer case would render at full DPR
// while every other case renders at half, and it duly measured +7.6ms (i.e.
// "turning post OFF costs more"). Pin it off so every case shares one resolution.
const url = new URL(appUrl())
url.searchParams.set('ff', 'interactiveDegrade:off')
await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
// Pin the tier (marks qualityUserSet, which also stops the adaptive ladder from
// moving the tier out from under the measurement).
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))

const box = centerBox(1280 * DSF, 800 * DSF)
const canvasBox = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = canvasBox.x + canvasBox.w / 2,
  cy = canvasBox.y + canvasBox.h / 2

/** The app's own default orbit pose, restored between cases. */
const CAM = { pos: [12, 8, 12], target: [0, 0, 0] }
async function resetCamera() {
  await page.evaluate((c) => {
    const { camera, controls } = window.__three
    camera.position.set(...c.pos)
    if (controls) {
      controls.target.set(...c.target)
      controls.update()
    } else {
      camera.lookAt(...c.target)
    }
    camera.updateMatrixWorld()
    // Demand mode renders nothing on a programmatic camera move — nudge the
    // store so RenderPump invalidates and the new pose is actually drawn.
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, CAM)
}

async function raw(buf) {
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

async function measure(ov) {
  await page.evaluate((o) => {
    const st = window.__store.getState()
    // Clear via resetQualityOverrides. Writing `undefined` per key does NOT
    // clear — it overwrites the preset value with undefined, which reads as
    // "off" (see QUALITY-OVERRIDE-UNDEF in quality.ts). That silently disabled
    // shadows and the whole post stack for every case after the first.
    st.resetQualityOverrides()
    for (const [k, v] of Object.entries(o)) window.__store.getState().setQualityOverride(k, v)
  }, ov)
  await new Promise((r) => setTimeout(r, 4500))
  // Return the camera to the SAME pose before every capture. Without this each
  // case's still came from wherever the previous case's orbit left the camera,
  // so the "pixels changed" column was diffing different viewpoints and read
  // 50-70% for every feature including ones that barely touch the image.
  await resetCamera()
  await new Promise((r) => setTimeout(r, 2500))
  const still = await page.screenshot({ type: 'png' })
  // Then a timed orbit for the cost.
  await page.evaluate(() => {
    const gl = window.__three.gl
    if (gl.__fpRestore) gl.__fpRestore()
    const orig = gl.render
    window.__fp = { ms: [], t0: performance.now() }
    let bucket = 0
    gl.render = function (...a) {
      const t = performance.now()
      try {
        return orig.apply(this ?? gl, a)
      } finally {
        bucket += performance.now() - t
      }
    }
    gl.__fpRestore = () => {
      gl.render = orig
    }
    const tick = () => {
      if (bucket > 0) {
        window.__fp.ms.push(bucket)
        bucket = 0
      }
      window.__fp.raf = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await resetCamera()
  await new Promise((r) => setTimeout(r, 800))
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
  const cost = await page.evaluate(() => {
    const f = window.__fp
    cancelAnimationFrame(f.raf)
    window.__three.gl.__fpRestore()
    const a = f.ms.slice().sort((x, y) => x - y)
    const q = (p) =>
      a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(2) : -1
    return { n: a.length, p50: q(0.5), p90: q(0.9), max: +(a[a.length - 1] ?? -1).toFixed(2) }
  })
  return { still, cost }
}

console.log(`tier=${TIER} viewport 1280x800 @ dpr ${DSF}  hour=${HOUR}  ${SECONDS}s orbit per case`)
console.log(`budget 16.67ms/frame\n`)
let basePixels = null
let baseP90 = null
const rows = []
for (const c of CASES) {
  const { still, cost } = await measure(c.ov)
  fs.writeFileSync(`${OUT}/${c.label.replace(/[^a-z0-9]+/gi, '_')}.png`, still)
  if (c.warmup) {
    console.log(`${c.label.padEnd(36)} (discarded — absorbs shader compilation)`)
    continue
  }
  const px = await raw(still)
  let changed = 0
  let absSum = 0
  if (basePixels) {
    for (let i = 0; i < px.length; i++) {
      const d = Math.abs(px[i] - basePixels[i])
      absSum += d
      if (d > 8) changed++
    }
  } else {
    basePixels = px
    baseP90 = cost.p90
  }
  // BOTH metrics, because either alone misleads. `pixelsChanged>8` misses a soft
  // effect that shifts a large area by a few levels — a broad 5/255 shadow
  // darkening reads as ~0% and would look like "buys nothing" when it is really
  // "buys something subtle". `meanAbsDiff` catches that but is dominated by
  // large flat regions, so a small sharp change reads as ~0 there. Judge a
  // feature on the pair.
  const pctChanged = basePixels === px ? 0 : (100 * changed) / px.length
  const meanAbs = basePixels === px ? 0 : absSum / px.length
  const dMs = baseP90 === null ? 0 : cost.p90 - baseP90
  rows.push({ label: c.label, p90: cost.p90, dMs, pctChanged, meanAbs, n: cost.n })
  console.log(
    `${c.label.padEnd(36)} p90=${String(cost.p90).padStart(6)}ms  ${(dMs >= 0 ? '+' : '') + dMs.toFixed(2)}ms   pixels>8=${pctChanged.toFixed(2)}%  meanAbsDiff=${meanAbs.toFixed(2)}  (frames=${cost.n})`,
  )
}
fs.writeFileSync(`${OUT}/feature-price.json`, JSON.stringify(rows, null, 2))
console.log(`\nA feature that SAVES ms with ~0% pixel change is pure waste at this tier.`)
await browser.close()
