/**
 * Does sun-shadow MAP RESOLUTION matter where it is actually judged?
 *
 * The orbit-view pricing said `shadowMapSize` 1024/2048/4096 are
 * indistinguishable (0.07% of pixels) while the biggest map costs ~3ms. But orbit
 * is a dollhouse view metres away from everything, and resolution buys shadow
 * SHARPNESS — the place a user judges a contact shadow is standing next to the
 * furniture in walk mode. So the resize cannot be justified from orbit numbers
 * alone; this probe re-asks the question from inside the room.
 *
 * There is also a specific reason the answer might be "resolution doesn't
 * matter": Medium+ tiers run VSM with `radius: 6` / `blurSamples: 12`
 * (`look.VSM_SHADOW`), a real separable blur over the variance map. A blur that
 * wide may already be throwing away the extra texels a 4096 map provides.
 *
 * Method notes (see src/scene/CLAUDE.md for why each matters):
 *  - overrides cleared with `resetQualityOverrides()`, never by writing undefined;
 *  - camera pinned to one pose per viewpoint before every capture;
 *  - warm-up discarded and the reference repeated at the end as a noise floor;
 *  - BOTH `pixels>8` and `meanAbsDiff` reported.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-walkshadow'
const TIER = process.env.TIER || 'realistic'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const SIZES = (process.env.SIZES || '4096,2048,1024,512,4096').split(',').map(Number)
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
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))

// Enter walk mode so the camera is at eye height inside the flat — the viewpoint
// a contact shadow is actually judged from.
await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
await new Promise((r) => setTimeout(r, 4000))
// A crashed scene is perfectly stable, so it would report 0.00 difference for
// every shadow size and read as "resolution changes nothing". Fail loudly.
await assertSceneAlive(page, 'after entering walk mode')

/** Eye-height viewpoints standing close to furniture, looking down at the floor
 *  where a contact shadow would land. */
const VIEWS = [
  { name: 'living-floor', pos: [10.5, 1.6, 6.5], look: [9.0, 0.2, 4.5] },
  { name: 'dining-floor', pos: [11.0, 1.6, 5.6], look: [11.0, 0.1, 3.6] },
  { name: 'bed-floor', pos: [4.5, 1.6, 3.2], look: [3.0, 0.1, 2.0] },
]

async function place(view) {
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    // Demand mode draws nothing on a programmatic camera move — nudge the store
    // so RenderPump invalidates.
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, view)
  await new Promise((r) => setTimeout(r, 2200))
}

async function centreRaw(buf) {
  // Centre slab only: the walk HUD and toolbar are opaque DOM over the canvas.
  const w = 1280 * DSF
  const h = 800 * DSF
  return sharp(buf)
    .extract({
      left: Math.round(w * 0.25),
      top: Math.round(h * 0.28),
      width: Math.round(w * 0.5),
      height: Math.round(h * 0.44),
    })
    .removeAlpha()
    .raw()
    .toBuffer()
}

console.log(`tier=${TIER} hour=${HOUR} dpr=${DSF} — WALK mode, shadowMapSize sweep`)
console.log('reference = first size in the sweep; last entry repeats it as a noise floor\n')

for (const view of VIEWS) {
  console.log(`view: ${view.name}`)
  let ref = null
  let first = true
  for (const [i, size] of SIZES.entries()) {
    await page.evaluate((s) => {
      const st = window.__store.getState()
      st.resetQualityOverrides()
      window.__store.getState().setQualityOverride('shadowMapSize', s)
    }, size)
    await new Promise((r) => setTimeout(r, 2500))
    await place(view)
    await assertSceneAlive(page, `shadowMapSize ${size}`)
    const buf = await page.screenshot({ type: 'png' })
    fs.writeFileSync(
      `${OUT}/${view.name}-${size}${i === SIZES.length - 1 ? '-repeat' : ''}.png`,
      buf,
    )
    const px = await centreRaw(buf)
    if (!ref) {
      ref = px
      console.log(`  ${String(size).padStart(5)}  (reference)`)
      first = false
      continue
    }
    let changed = 0
    let abs = 0
    for (let k = 0; k < px.length; k++) {
      const d = Math.abs(px[k] - ref[k])
      abs += d
      if (d > 8) changed++
    }
    const label = i === SIZES.length - 1 ? `${size} (repeat = noise floor)` : String(size)
    console.log(
      `  ${label.padStart(28)}  pixels>8=${((100 * changed) / px.length).toFixed(2)}%  meanAbsDiff=${(abs / px.length).toFixed(2)}`,
    )
  }
  void first
  console.log('')
}
await browser.close()
