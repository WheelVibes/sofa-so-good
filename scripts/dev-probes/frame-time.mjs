/**
 * TRUE per-frame cost in milliseconds, per tier.
 *
 * Every earlier fps figure in these probes counted `requestAnimationFrame`
 * ticks. That is NOT the render rate: the main Canvas is `frameloop="demand"`,
 * so the browser ticks at the display rate while r3f renders only when
 * invalidated — measured 59.7 rAF/s against 30.5 actual renders/s. rAF-based
 * numbers are therefore a CEILING proxy, useless as an absolute frame rate and
 * useless for choosing a tier.
 *
 * This wraps `renderer.render` and times it, giving CPU submit cost per rendered
 * frame (the GPU can still be behind, but a starved GPU blocks the submit, so it
 * tracks). Reported as p50/p90/max plus the achieved render rate.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 12)
// `MODE=walk` measures FIRST-PERSON WALK MODE WITH MOTION, not the orbit drag.
//
// **Why this knob exists.** Every frame-cost figure in this arc was taken in
// ORBIT mode, while every FIDELITY figure was taken in WALK mode -- including the
// "zero frame cost" verdict on the visibility lightmaps. Those are different
// camera rigs with different content on screen: walk mode is inside the room, and
// it mounts the HUD and the MINIMAP, which is a second view. A cost measured in
// the mode nobody is grading is not evidence about the mode they are.
//
// Honest limitation, and it is a real one: there is no yaw lever. Mouse-look needs
// OS-level Pointer Lock, which is unavailable headless, and `window.__walkLook`
// exposes pitch only. So this drives TRANSLATION (held KeyW, alternating strafe)
// plus PITCH oscillation. Yaw rotation -- the motion that most stresses frustum
// culling and shadow-map refresh -- is NOT exercised, so treat walk numbers as a
// floor on walk cost, not a ceiling.
const MODE = process.env.MODE || 'orbit'
const WALKPITCH = process.env.WALKPITCH !== '0'
// EXTRAINV=1 adds a SECOND invalidate source, one per animation frame, mimicking
// what OrbitControls contributes in orbit mode. If the walk-mode 2:1 rAF-to-drawn
// ratio is an ordering artefact -- the pump's single invalidate landing after r3f
// has already decided for that frame -- this doubles the drawn rate. If walk mode
// is genuinely saturated, it changes nothing (or makes it worse).
const EXTRAINV = process.env.EXTRAINV === '1'
if (MODE !== 'orbit' && MODE !== 'walk') {
  console.error(`MODE must be orbit or walk, got ${MODE}`)
  process.exit(1)
}

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
await page.evaluate(
  (h) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2

if (MODE === 'walk') {
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.setCameraMode('firstPerson')
    s.dismissCallout?.('walk-mode')
  })
  await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 2500))
}

console.log(
  `viewport 1280x800 @ dpr ${DSF} (${((1280 * DSF * 800 * DSF) / 1e6).toFixed(1)}M px), ` +
    `${SECONDS}s ${MODE === 'walk' ? `WALK (translate${WALKPITCH ? ' + pitch' : ', pitch OFF = instrument control'}; no yaw)` : 'orbit drag'} per tier`,
)

/** Drive motion for SECONDS, in whichever mode was asked for. */
async function drive() {
  const t0 = Date.now()
  let i = 0
  if (MODE === 'orbit') {
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    while ((Date.now() - t0) / 1000 < SECONDS) {
      await page.mouse.move(cx + Math.sin(i / 10) * 250, cy + Math.cos(i / 14) * 85, { steps: 1 })
      await new Promise((r) => setTimeout(r, 8))
      i++
    }
    await page.mouse.up()
    return
  }
  // Walk: hold forward, reverse every ~2 s so the camera stays inside the flat
  // rather than pressing into a wall for ten seconds (a stalled camera would
  // measure a static scene while looking like motion).
  await page.keyboard.down('KeyW')
  let forward = true
  while ((Date.now() - t0) / 1000 < SECONDS) {
    const elapsed = (Date.now() - t0) / 1000
    if ((Math.floor(elapsed / 2) % 2 === 0) !== forward) {
      await page.keyboard.up(forward ? 'KeyW' : 'KeyS')
      forward = !forward
      await page.keyboard.down(forward ? 'KeyW' : 'KeyS')
    }
    // WALKPITCH=0 is the CONTROL. Driving the pitch costs one CDP round-trip per
    // iteration (~125/s), and each one lands as a task on the page's main thread --
    // so it is a candidate cause of any rAF drop this probe reports, not just an
    // observer of one. Turning it off isolates the renderer from the instrument.
    if (WALKPITCH) {
      await page.evaluate((v) => window.__walkLook?.setPitch(v), Math.sin(i / 12) * 0.35)
    }
    await new Promise((r) => setTimeout(r, 8))
    i++
  }
  await page.keyboard.up(forward ? 'KeyW' : 'KeyS')
}
for (const tier of TIERS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 4000))
  if (EXTRAINV) {
    await page.evaluate(() => {
      if (window.__extraInvId) cancelAnimationFrame(window.__extraInvId)
      const inv = window.__three.invalidate
      if (typeof inv !== 'function') throw new Error('__three.invalidate is absent')
      const tick = () => {
        inv()
        window.__extraInvId = requestAnimationFrame(tick)
      }
      window.__extraInvId = requestAnimationFrame(tick)
    })
  }
  await page.evaluate(() => {
    const gl = window.__three.gl
    if (gl.__ftRestore) gl.__ftRestore()
    const orig = gl.render.bind(gl)
    window.__ft = { ms: [], raf: 0, t0: performance.now() }
    // Sum every render() inside ONE displayed frame. Nesting depth cannot
    // identify "a frame" here: at the post tiers the composer issues ~18
    // SIBLING render() calls per frame (plus a mirror's full extra scene pass),
    // so timing each one separately reports the parts and inflates the render
    // rate to ~1000/s. Bucket by animation frame and flush on the rAF boundary.
    let bucket = 0
    gl.render = (sc, cam) => {
      const t = performance.now()
      try {
        return orig(sc, cam)
      } finally {
        bucket += performance.now() - t
      }
    }
    gl.__ftRestore = () => {
      gl.render = orig
    }
    const tick = () => {
      window.__ft.raf++
      if (bucket > 0) {
        window.__ft.ms.push(bucket)
        bucket = 0
      }
      window.__ft.rafId = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await drive()
  const r = await page.evaluate(() => {
    const f = window.__ft
    cancelAnimationFrame(f.rafId)
    const secs = (performance.now() - f.t0) / 1000
    const a = f.ms.slice().sort((x, y) => x - y)
    const q = (p) =>
      a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : -1
    return {
      n: a.length,
      p50: q(0.5),
      p90: q(0.9),
      max: +(a[a.length - 1] ?? -1).toFixed(1),
      renderHz: +(a.length / secs).toFixed(1),
      rafHz: +(f.raf / secs).toFixed(1),
    }
  })
  console.log(
    `${tier.padEnd(12)} frame cost p50=${String(r.p50).padStart(6)}ms p90=${String(r.p90).padStart(6)}ms max=${String(r.max).padStart(6)}ms   drawnFrames/s=${String(r.renderHz).padStart(5)}  (rAF/s=${r.rafHz})`,
  )
}
await browser.close()
