/**
 * Watches the TIER-ADAPTIVE ladder run for real: boots with clean storage,
 * drives continuous orbit, and samples the live tier + learned ceiling over time.
 *
 * What this has to prove, and what a unit test cannot: that the ladder actually
 * PROMOTES on capable hardware (a gate that never fires is indistinguishable
 * from the old down-only guard), that it SETTLES rather than oscillating, and
 * that the settled tier survives a reload without re-probing.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 60)
/** CDP CPU throttle multiplier — simulates weaker hardware so the DOWNWARD half
 *  of the ladder can be exercised on a fast dev machine. 1 = no throttling. */
const CPU = Number(process.env.CPU || 1)

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
if (CPU > 1) {
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  console.log(`CPU throttled ${CPU}x (simulating weaker hardware)`)
}
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
// No storage clearing: puppeteer launches with a fresh temporary profile, so the
// first visit already starts empty. An `evaluateOnNewDocument` clear would fire
// on EVERY navigation (each load gets a new `window`, so a guard flag on it never
// survives) and would wipe the prefs the reload check exists to verify.

async function boot(label) {
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
  const st = await page.evaluate(() => {
    const s = window.__store.getState()
    // Record the tier timeline + a real fps counter IN THE PAGE, so sampling
    // costs no CDP round-trips. Polling from node once per ~0.5s was enough to
    // starve the render loop and make the ladder demote on frames the harness
    // itself had slowed down.
    window.__ladder = []
    window.__fps = { n: 0, renders: 0, t0: performance.now() }
    const tick = () => {
      window.__fps.n++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    // Count TRUE renders as well. A rAF tick is NOT a rendered frame: the main
    // Canvas is frameloop="demand", so the browser can tick at 60Hz while r3f
    // renders far less often. Conflating the two is exactly how a probe reports
    // "60fps" for a scene that is really drawing half that.
    {
      const gl = window.__three.gl
      const orig = gl.render.bind(gl)
      gl.render = (sc, cam) => {
        window.__fps.renders++
        return orig(sc, cam)
      }
    }
    const snap = () => {
      const q = window.__store.getState()
      const last = window.__ladder[window.__ladder.length - 1]
      if (!last || last.tier !== q.qualityTier || last.autoMaxTier !== q.autoMaxTier) {
        window.__ladder.push({
          t: +((performance.now() - window.__fps.t0) / 1000).toFixed(1),
          tier: q.qualityTier,
          autoMaxTier: q.autoMaxTier,
          shadowsOff: q.autoShadowsOff,
        })
      }
    }
    snap()
    window.__store.subscribe(snap)
    return { tier: s.qualityTier, autoMaxTier: s.autoMaxTier, settled: s.qualityAutoSettled }
  })
  console.log(
    `${label}: boot tier=${st.tier} autoMaxTier=${st.autoMaxTier} settledFromPrefs=${st.settled}`,
  )
  return st
}

await boot('FIRST VISIT (clean storage)')

// Drive a continuous orbit so the pump renders continuously and the ladder gets
// real sample windows (it deliberately ignores idle demand-mode frames).
const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2
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
const run = await page.evaluate(() => ({
  ladder: window.__ladder,
  rafHz: +(window.__fps.n / ((performance.now() - window.__fps.t0) / 1000)).toFixed(1),
  renderHz: +(window.__fps.renders / ((performance.now() - window.__fps.t0) / 1000)).toFixed(1),
}))
console.log(`in-page rAF ticks/s = ${run.rafHz}   TRUE renderer.render()/s = ${run.renderHz}`)
for (const e of run.ladder) {
  console.log(
    `  t=${String(e.t).padStart(5)}s  tier=${e.tier.padEnd(11)} autoMaxTier=${String(e.autoMaxTier).padEnd(11)} shadowsOff=${e.shadowsOff}`,
  )
}
console.log(`tier changes in ${SECONDS}s of continuous orbit: ${run.ladder.length - 1}`)

// Reload: a settled device must boot straight to its tier, not re-probe.
await boot('RELOAD (prefs persisted)')
await browser.close()
