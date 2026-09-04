/**
 * Dump the app's own sky equirect and compare it against a Cycles-rendered one.
 *
 *   node scripts/dev-probes/sky-equirect.mjs --ref=/tmp/mb/sky-cycles.png [--out=/tmp/app-sky.png]
 *
 * The app paints its sky background on a canvas from three gradient stops plus a
 * haze band (`backdropEquirect.ts:bakeSkyEquirect`). Item (l) measures that term
 * as 27 % too dark (1.368x, cv 0.63 % over four views) — the window's p99 IS
 * `scene.background` seen through the pane. This puts the two side by side.
 *
 * Reads the sun vector from the LIVE app rather than passing one in, so the two
 * images are of the same sun and the comparison is not accidentally about pose —
 * the mis-transcribed-pose error class that cost this arc two rounds.
 */
import fs from 'node:fs'
import process from 'node:process'
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'
import { readLuma } from './read-image.mjs'

const args = process.argv.slice(2)
const refArg = args.find((a) => a.startsWith('--ref='))
const outArg = args.find((a) => a.startsWith('--out='))
const OUT = outArg ? outArg.slice(6) : '/tmp/app-sky-equirect.png'
const HOUR = Number(process.env.HOUR || 13)
// TURBIDITY sweeps the Perez model's haze parameter. The `sky` preset is a real
// Perez sky (not the gradient the photo presets use — `v0.31.7.73` said gradient
// and was describing the wrong code path), so its over-blueness has a PHYSICAL
// knob: low turbidity means very clear air and a deeply saturated blue. The
// shipped default is 2.5, i.e. "exceptionally clear", for tropical Singapore.
// Unset = read the SHIPPED value from `skyFromAltitude(altitude).turbidity`, the
// altitude-driven curve the app actually uses (T=5 at 30 deg+, 6 at 10 deg, 8 at
// the horizon, 10 at -12 deg). Do NOT default to a literal: `v0.31.7.73` and `.78`
// were measured with a hardcoded 2.5 this probe invented, and reported the app's
// noon sky as 1.42x too dark when at its real T=5 it is 1.07x. A probe that
// supplies its own value for the parameter under test is measuring itself.
const TURBIDITY = process.env.TURBIDITY == null ? null : Number(process.env.TURBIDITY)

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const page = await browser.newPage()
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
await new Promise((r) => setTimeout(r, 1500))

const got = await page.evaluate(async (t) => {
  const mod = await import('/src/scene/backdropEquirect.ts')
  const sun = await import('/src/scene/lighting/sunPosition.ts')
  const curve = await import('/src/scene/lighting/altitudeCurve.ts')
  const three = window.__three
  // The app's own live sun: read the DirectionalLight's travel vector, the same
  // quantity BLENDREF writes into the manifest that Cycles was placed from.
  let dir = null
  three.scene.traverse((o) => {
    if (o.isDirectionalLight && !dir) {
      const p = o.getWorldPosition(o.position.clone())
      const t = o.target
        ? o.target.getWorldPosition(o.target.position.clone())
        : { x: 0, y: 0, z: 0 }
      dir = [t.x - p.x, t.y - p.y, t.z - p.z]
    }
  })
  if (!dir) return { error: 'no DirectionalLight in the scene' }
  const len = Math.hypot(...dir) || 1
  // `Vec3` is a TUPLE, not `{x, y, z}`. Passing an object makes every `a[0]`
  // undefined, every dot product NaN, and the whole canvas clamp to zero — which
  // is what the first run of this probe produced, and it read as "the app's sky is
  // black" rather than "the probe called it wrong".
  const toSun = [-dir[0] / len, -dir[1] / len, -dir[2] / len]
  const alt = Math.asin(Math.max(-1, Math.min(1, toSun[1])))
  const turb = t == null ? curve.skyFromAltitude(alt).turbidity : t
  const canvas = mod.bakeSkyEquirect(toSun, turb)
  return {
    turbidity: turb,
    turbiditySource: t == null ? 'shipped curve' : 'override',
    dataUrl: canvas.toDataURL('image/png'),
    w: canvas.width,
    h: canvas.height,
    travel: dir.map((v) => +v.toFixed(5)),
    hasSunPosition: typeof sun.orientedSunDirection === 'function',
  }
}, TURBIDITY)
if (got.error) throw new Error(got.error)
fs.writeFileSync(OUT, Buffer.from(got.dataUrl.split(',')[1], 'base64'))
console.log(
  `  app sky equirect -> ${OUT}  ${got.w}x${got.h}   sun travel ${JSON.stringify(got.travel)}`,
)

if (refArg) {
  const ref = refArg.slice(6)
  const [a, b] = await Promise.all([readLuma(OUT), readLuma(ref)])
  const band = (im, y0, y1) => {
    let s = 0
    let n = 0
    for (let y = Math.floor(y0 * im.h); y < Math.floor(y1 * im.h); y++)
      for (let x = 0; x < im.w; x++) {
        s += im.lum[y * im.w + x]
        n++
      }
    return (s / n / im.max) * 255
  }
  console.log(`\n  Mean luma per band, 0-255 scale (app vs Cycles, and the ratio):`)
  for (const [label, y0, y1] of [
    ['zenith      ', 0.0, 0.15],
    ['upper sky   ', 0.15, 0.4],
    ['HORIZON band', 0.45, 0.55],
    ['lower/ground', 0.6, 1.0],
  ]) {
    const va = band(a, y0, y1)
    const vb = band(b, y0, y1)
    console.log(
      `    ${label}  app ${va.toFixed(1).padStart(6)}   cycles ${vb.toFixed(1).padStart(6)}   cycles/app ${(vb / va).toFixed(3)}`,
    )
  }
}
await browser.close()
