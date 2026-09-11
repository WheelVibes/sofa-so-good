/**
 * WEATHER-BAKED-GI — what factor lands the app's BAKED bounce where Cycles puts an overcast room.
 *
 * `weatherGrade` reaches the sun, the fill, the IBL probe, the estate and the sky backdrop. It did
 * not reach the two levels `visibilityLightmap.ts` injects, so under a full deck — beam exactly
 * zero, every other indirect source down to `FILL` — the baked bounce still carried its whole
 * clear-sky midday value. This probe is how the replacement factor was CHOSEN rather than asserted.
 *
 * **The target is a Cycles number, not a preference.** `render_weather.py` renders the app's own
 * exported scene under the four calibrated skies; read in LINEAR at the `living-far` pose the
 * INTERIOR ratio to `clear` is the ratio the app's frame has to reproduce. Everything here is
 * captured through `scene/linearView.ts` for the same reason (AGX-PARITY): a ratio of tone-mapped
 * bytes is not a ratio of light.
 *
 * **Why a sweep and not arithmetic.** The factor the BAKE needs is not the ratio the ROOM moves by,
 * because the app renders the sun itself as a `DirectionalLight` and the bake holds only what the
 * sky DOME delivers (`public/assets/lightmaps/index.json`: `with_sun_disc: false`). How much of the
 * app's clear-sky interior comes from each is a property of the app's own light rig, so it is read
 * off rather than derived: `?visWeather=<k>` overrides the factor and this walks it.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/weather-baked-gi.mjs \
 *     --out /tmp/giw/app --k 0.3,0.461,0.55,0.7,0.85,1
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'
import { WALK_EXCLUDE } from './weather-cycles.mjs'

const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const out = arg('--out', '/tmp/giw/app')
const KS = arg('--k', '0.3,0.461,0.55,0.7,0.85,1').split(',').map(Number)
const HOUR = Number(arg('--hour', 13))
/** The `living-far` WALK pose the Cycles arm was rendered from. x, z, yaw, pitch. */
const POSE = [10.87, 5.125, 0, -0.02]
/** Matches the exported manifest's `fovVerticalDeg`, so an app frame and a Cycles frame of the
 *  same pose are geometrically IDENTICAL and one rectangle reads both. */
const FOV = 70
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * MAPPED-SURFACE regions, as frame fractions at the `living-far` pose, fov 70.
 *
 * **A whole-frame statistic cannot adjudicate this term and the sweep below proves it**: driving
 * the factor 0.3 -> 1.0 moves the frame ratio only 0.450 -> 0.555, because the bake reaches about a
 * quarter of the picture (LIGHTMAP-COVERAGE). The defect is on the surfaces the bake DOES reach, so
 * that is where it is measured. All three carry a loaded map and none contains the window, the
 * curtains, the TV screen or a piece of furniture.
 */
export const MAPPED = [
  { name: 'east-wall', x: 0.76, y: 0.36, w: 0.1, h: 0.24 },
  { name: 'west-wall', x: 0.02, y: 0.12, w: 0.11, h: 0.22 },
  { name: 'ceiling', x: 0.45, y: 0.02, w: 0.17, h: 0.08 },
]

/** Interior mean of a LINEAR-view capture, with the same regions `weather-cycles.mjs` excludes. */
async function interiorMean(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const keep = new Uint8Array(w * h).fill(1)
  for (const r of WALK_EXCLUDE) {
    const x0 = Math.round(r.x * w)
    const y0 = Math.round(r.y * h)
    const x1 = Math.min(w, x0 + Math.round(r.w * w))
    const y1 = Math.min(h, y0 + Math.round(r.h * h))
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) keep[y * w + x] = 0
  }
  // `linearView` renders LinearToneMapping into an sRGB-encoded 8-bit buffer, so the byte still
  // carries the sRGB OETF and has to be undone before anything is averaged.
  const un = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  let s = 0
  let n = 0
  let clipped = 0
  for (let p = 0; p < w * h; p++) {
    if (!keep[p]) continue
    const r = data[p * 3]
    const g = data[p * 3 + 1]
    const b = data[p * 3 + 2]
    if (r > 253 && g > 253 && b > 253) clipped++
    s += 0.2126 * un(r / 255) + 0.7152 * un(g / 255) + 0.0722 * un(b / 255)
    n++
  }
  return { mean: s / n, clipped: clipped / n, n }
}

/** Rec.709 luminance mean of one rectangle, in the same linear units. */
async function regionMeans(file, un) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const o = {}
  for (const r of MAPPED) {
    const x0 = Math.round(r.x * info.width)
    const y0 = Math.round(r.y * info.height)
    const x1 = Math.min(info.width, x0 + Math.round(r.w * info.width))
    const y1 = Math.min(info.height, y0 + Math.round(r.h * info.height))
    let s = 0
    let n = 0
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * info.width + x) * 3
        s += 0.2126 * un(data[p]) + 0.7152 * un(data[p + 1]) + 0.0722 * un(data[p + 2])
        n++
      }
    o[r.name] = s / n
  }
  return o
}

/** sRGB byte -> linear, for the app's 8-bit LINEAR-view capture. */
export const unByte = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

async function capture(browser, { condition, k }) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 625, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
      localStorage.setItem('ssg_linear_view', '1')
    } catch {}
  })
  const sep = appUrl().includes('?') ? '&' : '?'
  const q = k === null ? '' : `&visWeather=${k}`
  await page.goto(`${appUrl()}${sep}nocache=${Date.now()}${q}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.evaluate(
    ({ h, c }) => {
      const s = window.__store.getState()
      s.endTour?.()
      s.setOnboardingOpen?.(false)
      s.dismissLocationPrompt?.()
      s.dismissChecklist?.()
      s.setManualHour?.(h)
      s.setTimeMode?.('manual')
      s.setQualityTier?.('realistic')
      s.setDeviceClass?.('capable')
      s.setWeather?.(c)
      s.hideLoading?.()
      s.setFeatureFlag?.('interactiveDegrade', false)
    },
    { h: HOUR, c: condition },
  )
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await sleep(7000)
  // THE LOAD ASSERTION. A map set that never loaded and a working subtle term look identical.
  const patched = await page.evaluate(() => {
    let n = 0
    const seen = new Set()
    const visit = (o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        if (!m || seen.has(m.uuid)) continue
        seen.add(m.uuid)
        if (m.__visMapForProbe && (m.__visMapForProbe.image?.width ?? 0) > 0) n++
      }
      for (const c of o.children ?? []) visit(c)
    }
    visit(window.__three.scene)
    return n
  })
  if (patched === 0) throw new Error('no lightmap material carries a loaded image')
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20000,
  })
  await sleep(4000)
  await page.evaluate(
    ({ f, q }) => {
      const s = window.__store.getState()
      s.hideLoading?.()
      s.dismissCallout?.('walk-mode')
      s.setWalkFov?.(f)
      const l = window.__walkLook
      l.setPosition(q[0], q[1])
      l.setYaw(q[2])
      l.setPitch(q[3])
    },
    { f: FOV, q: POSE },
  )
  await sleep(2500)
  await assertSceneAlive(page, `${condition}@${k}`)
  const weather = await page.evaluate(() => window.__store.getState().weather)
  if (weather !== condition) throw new Error(`weather is ${weather}, expected ${condition}`)
  const file = path.join(out, `lin-${condition}-k${k ?? 'none'}.png`)
  await page.screenshot({ path: file })
  await page.close()
  return { file, patched }
}

fs.mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const rows = []
const base = await capture(browser, { condition: 'clear', k: null })
const baseStat = await interiorMean(base.file)
const baseRegions = await regionMeans(base.file, unByte)
console.log(
  `clear (no override): interior mean ${baseStat.mean.toExponential(4)}  clipped ${(baseStat.clipped * 100).toFixed(1)} %  patched ${base.patched}`,
)
for (const k of KS) {
  const shot = await capture(browser, { condition: 'overcast', k })
  const st = await interiorMean(shot.file)
  const reg = await regionMeans(shot.file, unByte)
  const regionRatio = Object.fromEntries(
    MAPPED.map((r) => [r.name, reg[r.name] / baseRegions[r.name]]),
  )
  rows.push({ k, mean: st.mean, ratio: st.mean / baseStat.mean, clipped: st.clipped, regionRatio })
  console.log(
    `visWeather ${String(k).padEnd(6)} frame ${(st.mean / baseStat.mean).toFixed(4)}  ` +
      MAPPED.map((r) => `${r.name} ${regionRatio[r.name].toFixed(4)}`).join('  '),
  )
}
await browser.close()
fs.writeFileSync(
  path.join(out, 'weather-baked-gi.json'),
  JSON.stringify(
    { pose: POSE, hour: HOUR, fov: FOV, clear: baseStat, clearRegions: baseRegions, rows },
    null,
    1,
  ),
)
console.log('\n->', out)
