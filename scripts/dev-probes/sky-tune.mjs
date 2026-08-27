/**
 * Why is the orbit sky white instead of blue, and which parameter fixes it?
 *
 * The dollhouse view renders a real sun-driven Preetham sky (drei `<Sky>`, fed by
 * `lighting/altitudeCurve.ts:skyFromAltitude`), NOT a flat gradient — but measured
 * at 13:00 its zenith reads rgb 229/232/233, HSV saturation **0.017**, and the
 * zenith is indistinguishable from the horizon (0.017 vs 0.021) when a Preetham
 * sky should show a strong blue gradient between them.
 *
 * It is not the tone curve: the zenith is washed out under ALL THREE operators
 * (filmic 0.008, AgX 0.017, Khronos Neutral 0.073), so the dome is simply far too
 * bright for the app's exposure and every operator rolls it onto its shoulder.
 * That points upstream, at the scattering parameters themselves — and the curve
 * uses `rayleigh: 1` at high sun where drei's own default is 3. Rayleigh IS the
 * blue-scattering term, so a low value gives a pale sky by construction.
 *
 * This sweeps the live shader uniforms on the sky dome (found by looking for a
 * material carrying a `rayleigh` uniform) so every arm is one run over an
 * identical view, and reports the ZENITH colour — the part of the sky that should
 * be bluest, and the part the orbit camera actually shows above the model.
 *
 * SWEEP is `;`-separated arms of `uniform=value` pairs, e.g.
 *   SWEEP='rayleigh=1;rayleigh=2;rayleigh=3;rayleigh=3,turbidity=3'
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-skytune'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 13)
const SWEEP = (process.env.SWEEP || 'rayleigh=1;rayleigh=2;rayleigh=3;rayleigh=1')
  .split(';')
  .filter(Boolean)
  .map((g) =>
    g
      .split(',')
      .map((kv) => kv.split('='))
      .map(([k, v]) => [k.trim(), Number(v)]),
  )
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
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
// Pin the clock FIRST — `setManualHour` also flips `timeMode`, so using it purely
// as a redraw nudge in an unpinned probe silently straddles day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4500))
await assertSceneAlive(page, 'after setup')

const found = await page.evaluate(() => {
  let mat = null
  window.__three.scene.traverse((o) => {
    const m = o.material
    if (!mat && m?.uniforms?.rayleigh) mat = m
  })
  if (!mat) return null
  window.__sky = mat
  return {
    turbidity: mat.uniforms.turbidity?.value ?? null,
    rayleigh: mat.uniforms.rayleigh?.value ?? null,
    mieCoefficient: mat.uniforms.mieCoefficient?.value ?? null,
    mieDirectionalG: mat.uniforms.mieDirectionalG?.value ?? null,
  }
})
if (!found) {
  console.log('no sky material with a `rayleigh` uniform found — is <Sky> mounted?')
  await browser.close()
  process.exit(1)
}
console.log(`tier=${TIER} hour=${HOUR} — sky uniforms as shipped: ${JSON.stringify(found)}\n`)

const W = 1280 * DSF
const H = 800 * DSF
// Zenith slab: above the model, clear of the toolbar.
const ZEN = {
  left: Math.round(W * 0.24),
  top: Math.round(H * 0.12),
  width: Math.round(W * 0.3),
  height: Math.round(H * 0.08),
}

async function measure(tag) {
  await new Promise((r) => setTimeout(r, 1400))
  await assertSceneAlive(page, tag)
  const buf = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUT}/sky-${TIER}-h${HOUR}-${tag}.png`, buf)
  const { data } = await sharp(buf)
    .extract(ZEN)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let r = 0
  let g = 0
  let b = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  r /= n
  g /= n
  b /= n
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return { r, g, b, sat: mx === 0 ? 0 : (mx - mn) / mx, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b }
}

console.log('arm                       zenith rgb              b-r    sat    luma')
for (const arm of SWEEP) {
  await page.evaluate((pairs) => {
    for (const [k, v] of pairs) {
      if (window.__sky.uniforms[k]) window.__sky.uniforms[k].value = v
    }
    window.__sky.needsUpdate = true
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, arm)
  const tag = arm.map(([k, v]) => `${k}=${v}`).join(',')
  const m = await measure(tag.replace(/[^\w.=-]/g, '_'))
  console.log(
    `${tag.padEnd(24)} ${m.r.toFixed(1).padStart(6)} ${m.g.toFixed(1).padStart(6)} ${m.b.toFixed(1).padStart(6)}  ${(m.b - m.r).toFixed(1).padStart(5)}  ${m.sat.toFixed(3)}  ${m.luma.toFixed(1)}`,
  )
}
await browser.close()
