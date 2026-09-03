/**
 * NIGHT-LIGHTS — fixture lights at night, the state nothing else measures.
 *
 * Every other probe here runs with `lightsMode` at its DEFAULT, which is `'off'`.
 * `FurnitureLights` renders nothing at all in that state, so a census of the live
 * scene correctly reports zero point lights at 21:00 exactly as at 13:00. That
 * reading looks like a broken light system and is simply the switch being off.
 *
 * With the lights ON at 21:00 in orbit this reports, per tier: how many of the flat's
 * items are emitters at all, how many lights actually went live, and the frame cost —
 * a night home is where the per-fragment fill cost of many live lights is paid.
 *
 * NOTE: this probe originally checked a per-tier nearest-N BUDGET
 * (`maxFixtureLights * ORBIT_BUDGET_MULTIPLIER`). That budget no longer exists —
 * `chooseEmitters` and `maxFixtureLights` were deleted because capping to the nearest
 * few emitters made lamps switch on and off as the camera moved. `lightsMode` is now
 * one switch for the whole home, so the expected live count is simply "every emitter",
 * and the interesting number is the COST of rendering them all.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 21)
const OUT = process.env.OUT || '/tmp/ssg-night-lights'
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
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
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const SECONDS = Number(process.env.SECONDS || 4)

/** Turn the fixtures on — the whole point of the run. */
await page.evaluate(() => window.__store.getState().setLightsMode('on'))
await new Promise((r) => setTimeout(r, 1500))

/** How many of the flat's items are light emitters at all? Decides whether the
 *  tier budget can even bind, so a "budget respected" result is not vacuous. */
const emitterCount = await page.evaluate(async () => {
  const mod = await import('/src/furniture/lightEmitters.ts')
  const items = window.__store.getState().items
  let n = 0
  for (const it of items) if (mod.resolveEmitterSpec(it.defId, it.props)) n++
  return n
})

async function census() {
  return page.evaluate(() => {
    const scene = window.__three.scene
    let point = 0
    let lit = 0
    let padded = 0
    let spot = 0
    let spotLit = 0
    scene.traverse((o) => {
      if (o.isPointLight) {
        point++
        if (o.intensity > 0) lit++
        else padded++
      } else if (o.isSpotLight) {
        spot++
        if (o.intensity > 0) spotLit++
      }
    })
    return { point, lit, padded, spot, spotLit }
  })
}

async function cost() {
  const samples = await page.evaluate((secs) => {
    return new Promise((resolve) => {
      const gl = window.__three.gl
      const orig = gl.render.bind(gl)
      let frame = 0
      let acc = 0
      const out = []
      gl.render = (...a) => {
        const t = performance.now()
        orig(...a)
        acc += performance.now() - t
      }
      const rafTick = () => {
        if (acc > 0) out.push(acc)
        acc = 0
        frame++
        if (frame < secs * 60) requestAnimationFrame(rafTick)
        else {
          gl.render = orig
          resolve(out)
        }
      }
      requestAnimationFrame(rafTick)
    })
  }, SECONDS)
  const s = samples.slice().sort((a, b) => a - b)
  const q = (p) => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0)
  return { p50: q(0.5), p90: q(0.9), max: s.length ? +s[s.length - 1].toFixed(1) : 0 }
}

console.log(
  `hour=${HOUR} mode=orbit lightsMode=on — ${emitterCount} emitting items on the default flat\n`,
)
console.log('tier          lit  merged   offP50  onP50   fixtureCost  onP90   onMax')

for (const tier of TIERS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 3500))
  await assertSceneAlive(page, `tier ${tier}`)
  // Coincident same-kind fixtures are merged on every tier now, so the live count
  // can legitimately sit BELOW the emitter count without any camera-proximity cull.
  const merged = await page.evaluate(async () => {
    const q = await import('/src/scene/quality.ts')
    const st = window.__store.getState()
    return q.QUALITY_PRESETS[st.qualityTier].mergeCoincidentLights
  })
  // Lights OFF arm first — the control differs in exactly one variable, so the
  // delta is the fixture cost and nothing else (meta-rule xvi).
  await page.evaluate(() => window.__store.getState().setLightsMode('off'))
  await new Promise((r) => setTimeout(r, 1500))
  const tOff = await cost()
  await page.evaluate(() => window.__store.getState().setLightsMode('on'))
  await new Promise((r) => setTimeout(r, 1500))
  const c = await census()
  const t = await cost()
  fs.writeFileSync(`${OUT}/night-${tier}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `${tier.padEnd(13)} ${String(c.lit).padStart(3)} ${String(merged).padStart(7)} ` +
      `${String(tOff.p50).padStart(8)} ${String(t.p50).padStart(6)} ` +
      `${(t.p50 - tOff.p50).toFixed(1).padStart(12)} ${String(t.p90).padStart(7)} ${String(t.max).padStart(7)}`,
  )
}

await browser.close()
