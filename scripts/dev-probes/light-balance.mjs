/**
 * Live key:fill ratio — the actual light intensities the renderer is using.
 *
 * The sun is the only shadow-casting light; hemisphere, ambient and the IBL probe
 * are non-directional fill that casts nothing. The ratio between them decides
 * whether a cast shadow removes a real fraction of a surface's light (reads as a
 * shadow) or a small one (reads as a tint). Worth measuring rather than deriving,
 * because the fill is the product of several stacked factors (`iblFillScale`,
 * `windowFillAttenuation`, the day level) and it is very easy to quote one from
 * before a change alongside another from after it.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'maximum'
const HOURS = (process.env.HOURS || '9,13,17,21').split(',').map(Number)

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
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3500))
await assertSceneAlive(page, 'after tier set')

console.log(`tier=${TIER}   (sun = the ONLY shadow-casting light)`)
console.log('hour   sun   hemi    amb    env   fill=hemi+amb+env   key:fill')
for (const h of HOURS) {
  await page.evaluate((hh) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(hh)
  }, h)
  // The day/night tween eases over ~0.6s; wait well past it so these are settled.
  await new Promise((r) => setTimeout(r, 3000))
  const l = await page.evaluate(() => {
    let sun = 0,
      hemi = 0,
      amb = 0
    window.__three.scene.traverse((o) => {
      if (o.isDirectionalLight) sun = o.intensity
      else if (o.isHemisphereLight) hemi = o.intensity
      else if (o.isAmbientLight) amb = o.intensity
    })
    return { sun, hemi, amb, env: window.__three.scene.environmentIntensity ?? 0 }
  })
  const fill = l.hemi + l.amb + l.env
  const ratio = fill > 1e-6 ? l.sun / fill : Number.POSITIVE_INFINITY
  console.log(
    `${String(h).padStart(4)}  ${l.sun.toFixed(3)}  ${l.hemi.toFixed(3)}  ${l.amb.toFixed(3)}  ${l.env.toFixed(3)}        ${fill.toFixed(3)}        ${ratio.toFixed(2)}:1`,
  )
}
await browser.close()
