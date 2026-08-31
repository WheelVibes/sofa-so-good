/**
 * Is the "not real / animation" look a WARM COLOUR CAST rather than missing detail?
 *
 * `chroma-audit.mjs` measured something that shouldn't be possible if the
 * materials were the problem: at 09:00/Medium the highest-coverage surfaces in
 * the living room carry HSV saturations of 0.00–0.22 (ceiling 0.00, walls 0.16,
 * curtain 0.14), yet the RENDERED frame has mean chroma 0.206 with 14.6% of its
 * pixels above 0.35 saturation. The picture is more colourful than anything in
 * it. So chroma is being ADDED between the albedo and the display, and there are
 * exactly two plausible sources:
 *
 *   1. the ILLUMINANT. `altitudeCurve.ts` gives 09:00 a warm sun (~1.0/0.94/0.83)
 *      over a warm-brown hemisphere ground (~0.40/0.35/0.32), and nothing
 *      downstream white-balances it. A real camera — and a real viewer's own
 *      chromatic adaptation — normalises to the dominant illuminant, which is
 *      why a photograph of a sunlit room still shows a WHITE wall as white. Skip
 *      that step and every neutral surface picks up the light's tint, which is
 *      the single most reliable giveaway of a render.
 *   2. the ALBEDO the cast lands on. `livingDining` defaults to
 *      `wall-paint-warm` (#e9d8c4, a cream), and it is the largest surface in
 *      the frame at 21.8–33.6% coverage. A cream wall under a warm light is
 *      orange twice over.
 *
 * The two are separable, so measure them apart before changing either:
 *
 *   A  baseline
 *   B  illuminant neutralised     sun/hemisphere/ambient forced to white
 *   C  wall repainted off-white   `wall-paint-warm` -> `wall-paint-white`
 *   D  both
 *   E  baseline repeated          the noise floor
 *
 * Reported per case: mean rendered chroma, the fraction of pixels above 0.35
 * saturation, mean luminance, contrast (sd) and the clipped fraction — a
 * white-balance change must not cost contrast or blow highlights. Case B is a
 * DIAGNOSTIC, not a proposal: forcing the lights white would throw away the
 * day/night warmth that carries time-of-day. What it establishes is how much of
 * the cast the illuminant owns, which decides whether the fix belongs in the
 * light colours, in the finishes, or in a white-balance step in the grade.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-warmcast'
const TIER = process.env.TIER || 'medium'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk'
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
if (MODE === 'walk') {
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await new Promise((r) => setTimeout(r, 3500))
}
await assertSceneAlive(page, 'after setup')

const VIEW =
  MODE === 'walk'
    ? { pos: [10.6, 1.6, 6.4], look: [10.6, 1.5, 3.0] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }

async function applyCase(neutralLights, whiteWall) {
  await page.evaluate(
    (neutral, white) => {
      const st = window.__store.getState()
      // `setWallFinish` is the app's own path, so the whole reveal/finish
      // pipeline runs exactly as it would for a user — no material poking.
      st.setWallFinish('livingDining', white ? 'wall-paint-white' : 'wall-paint-warm')
      // `Lighting` rewrites the light colours EVERY FRAME from the altitude
      // curve, so neither a one-shot assignment nor a `setInterval` can win the
      // race — an earlier version of this probe used an interval and case B came
      // back byte-identical to the baseline, which reads as "the illuminant
      // contributes nothing" when it actually means the mutation never landed.
      // The only place guaranteed to be after `Lighting`'s write and before the
      // draw is inside `renderer.render` itself, so wrap it (the same hook
      // `scene/frameCost.ts` uses to meter cost).
      const gl = window.__three.gl
      if (!window.__wc) {
        const orig = gl.render.bind(gl)
        window.__wc = { on: false, restore: () => (gl.render = orig) }
        gl.render = (...args) => {
          if (window.__wc.on) {
            window.__three.scene.traverse((o) => {
              if (o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight) {
                o.color?.setRGB(1, 1, 1)
                if (o.groundColor) {
                  // Keep the ground DARKER than the sky (that luminance gap is
                  // real occlusion information) but strip its hue.
                  const g = o.groundColor
                  const l = 0.2126 * g.r + 0.7152 * g.g + 0.0722 * g.b
                  g.setRGB(l, l, l)
                }
              }
            })
            // The IBL probe is fill too, and at Medium+ it is a large share of
            // the interior's light. Its tint lives in the environment map, which
            // can't be neutralised in place — flag it so the report can say so.
            window.__wc.envPresent = !!window.__three.scene.environment
          }
          return orig(...args)
        }
      }
      window.__wc.on = neutral
    },
    neutralLights,
    whiteWall,
  )
  await new Promise((r) => setTimeout(r, 2500))
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, VIEW)
  await new Promise((r) => setTimeout(r, 2000))
  await assertSceneAlive(page)
  return page.screenshot({ type: 'png' })
}

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

const CASES = [
  { key: 'warm', label: 'warm-up (discarded)', n: false, w: false },
  { key: 'A', label: 'baseline', n: false, w: false },
  { key: 'B', label: 'illuminant neutralised', n: true, w: false },
  { key: 'C', label: 'wall repainted off-white', n: false, w: true },
  { key: 'D', label: 'both', n: true, w: true },
  { key: 'E', label: 'baseline repeated (noise)', n: false, w: false },
]
console.log(`mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log('case                          chroma  >0.35%   mean     sd  clipped')
for (const c of CASES) {
  const buf = await applyCase(c.n, c.w)
  if (c.key === 'warm') continue
  fs.writeFileSync(`${OUT}/${MODE}-${TIER}-h${HOUR}-${c.key}.png`, buf)
  const ch = await chroma(buf)
  const st = await frameStats(buf, { x: BOX.left, y: BOX.top, w: BOX.width, h: BOX.height })
  console.log(
    `${c.key} ${c.label.padEnd(26)} ${ch.mean.toFixed(3)}  ${ch.over.toFixed(1).padStart(5)}%  ${String(st.mean).padStart(6)}  ${String(st.sd).padStart(5)}  ${st.clipped}`,
  )
}
console.log(
  '\nB well below A => the warm ILLUMINANT owns the cast (fix belongs in the grade).\n' +
    'C well below A => the cream WALL owns it (fix belongs in the default finish).',
)
await browser.close()
