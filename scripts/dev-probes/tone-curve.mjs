/**
 * Which view transform should the app default to? — a whole-frame sweep.
 *
 * `wood-detail.mjs` found that the furniture wood's excess saturation is mostly
 * NOT authored. A #7a5c3c albedo has an sRGB HSV saturation of 0.508, and at the
 * measured mean luminance of ~58/255 a pure sRGB encode predicts ~0.54 — yet the
 * rendered wood measures **0.833**. Decomposed over wood pixels at
 * walk/Medium/09:00 (noise floor 0.00): the surface being dark accounts for
 * ~0.05 (lightening the albedo x1.8 gives 0.784), the HueSaturation pass's +0.06
 * baseline accounts for 0.069 (turning it off gives 0.764), and the remaining
 * ~0.21 is the tone curve — switching to AgX gives **0.678**.
 *
 * That is the expected failure mode of `ACESFilmicToneMapping`: three's version
 * applies its curve PER CHANNEL, so on a warm mid-dark surface the blue channel
 * is crushed far harder than the red and saturation climbs. AgX and Khronos
 * Neutral are both designed to hold hue and saturation through the transform.
 *
 * But the view transform applies to the WHOLE image, so it cannot be chosen on
 * one material's numbers. This sweeps every operator across the day in both view
 * modes and reports what actually matters globally:
 *
 *   mean      overall exposure — a "better" curve that darkens the flat is a loss
 *   sd        contrast; a flat image reads as fog, not realism
 *   clipped   fraction of blown-to-white pixels (the v0.31.0.0 regression metric)
 *   chroma    mean saturation, and the fraction of pixels past 0.35
 *
 * Night hours are included deliberately: AgX brightens midtones, and a
 * transform that improves a daylit room can wash out a moody 21:00 one.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-tone'
const TIER = process.env.TIER || 'performance'
const DSF = Number(process.env.DSF || 2)
const MODE = process.env.MODE || 'walk'
const HOURS = (process.env.HOURS || '9,13,18,21').split(',').map(Number)
const TONES = (process.env.TONES || 'filmic,agx,neutral').split(',')
/** Scene-saturation values to sweep. `hueSatSaturation(s)` =
 *  BASE_POST_SATURATION (0.06) + (s - 1), so 1 is the shipped +0.06 and 0.94
 *  puts the HueSaturation pass at exactly 0. */
const SATS = (process.env.SATS || '1').split(',').map(Number)
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
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate(() => window.__store.getState().setTimeMode('manual'))
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
if (MODE === 'walk') {
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await new Promise((r) => setTimeout(r, 3500))
}
await assertSceneAlive(page, 'after setup')

const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }

const W = 1280 * DSF
const H = 800 * DSF
const BOX = {
  left: Math.round(W * 0.25),
  top: Math.round(H * 0.28),
  width: Math.round(W * 0.5),
  height: Math.round(H * 0.44),
}

async function chroma(buf) {
  const { data } = await sharp(buf)
    .extract(BOX)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let over = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    const s = max === 0 ? 0 : (max - min) / max
    sum += s
    if (s > 0.35) over++
  }
  return { mean: sum / n, over: (100 * over) / n }
}

async function shoot(hour, tone, sat = 1) {
  await page.evaluate(
    (h, t, sa) => {
      const s = window.__store.getState()
      s.setManualHour(h)
      s.setToneMapping(t)
      s.setSceneSaturation(sa)
    },
    hour,
    tone,
    sat,
  )
  await new Promise((r) => setTimeout(r, 2600))
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, VIEW)
  await new Promise((r) => setTimeout(r, 2000))
  await assertSceneAlive(page, `h${hour} ${tone}`)
  return page.screenshot({ type: 'png' })
}

// Discard a warm-up so the first measured cell doesn't pay shader compilation.
await shoot(HOURS[0], TONES[0])

console.log(`mode=${MODE} tier=${TIER} dpr=${DSF}`)
console.log('hour  tone      sat    mean     sd  clipped   chroma  >0.35%')
for (const hour of HOURS) {
  for (const tone of TONES) {
    for (const sat of SATS) {
      const buf = await shoot(hour, tone, sat)
      fs.writeFileSync(`${OUT}/${MODE}-${TIER}-h${hour}-${tone}-s${sat}.png`, buf)
      const st = await frameStats(buf, { x: BOX.left, y: BOX.top, w: BOX.width, h: BOX.height })
      const ch = await chroma(buf)
      console.log(
        `${String(hour).padStart(4)}  ${tone.padEnd(8)} ${sat.toFixed(2)} ${String(st.mean).padStart(6)}  ${String(st.sd).padStart(5)}  ${String(st.clipped).padStart(7)}   ${ch.mean.toFixed(3)}  ${ch.over.toFixed(1).padStart(5)}%`,
      )
    }
  }
  console.log('')
}
await browser.close()
