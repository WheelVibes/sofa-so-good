/**
 * FIREFOX-SMOKE: the first Firefox run this repo has ever done.
 *
 * Every screenshot/perf harness here (`shot.mjs`, `perf.mjs`, `frame-time.mjs`) drives
 * Chromium via puppeteer; Firefox has never booted the app at all, even though
 * `playwright`/`@playwright/test` are dependencies. This is a SMOKE test, not a full
 * parity suite: boot the default flat in Firefox, confirm the store/scene come up,
 * confirm WebGL2 actually renders (headless Firefox on macOS can come up with NO
 * WebGL2 at all — see the launch-arg fallback below), and take one screenshot per
 * quality mode so a human can eyeball whether the render looks like the same app.
 *
 * Frame-cost sampling reuses `dev-probes/frame-time.mjs`'s method: wrap
 * `window.__three.gl.render` to time each CALL (not wall-clock rAF, which is a vsync
 * ceiling — see that file's header) and drive frames with r3f's own `advance()` so the
 * post-processing composer is exercised, not a bare `gl.render(scene, camera)`.
 *
 * Usage: `node scripts/dev-probes/firefox-smoke.mjs` — expects a dev server already
 * on `SSG_URL` (default http://localhost:5200/, NEVER 5173 — see `lib.mjs:appUrl`).
 */
import { mkdir } from 'node:fs/promises'
import { firefox } from 'playwright'

// Deliberately NOT `lib.mjs:appUrl()` — that defaults to :5173, which this task's
// instructions forbid (a stray dev server from another checkout could answer there).
// This probe's default is the already-running probe dev server on :5200.
const TARGET_URL = process.env.SSG_URL || process.env.URL || 'http://localhost:5200/'
const MODES = (process.env.MODES || 'performance,realistic').split(',')
const FRAMES = Number(process.env.FRAMES || 60)
// Screenshot filename prefix, so isolation runs (MODES orders) keep separate frames.
const SHOT_PREFIX = process.env.SHOT_PREFIX || ''

// macOS headless Firefox sometimes has no WebGL2 unless explicitly forced — try
// plain first, fall back to forcing prefs, and report which path was needed.
async function launchWithFallback() {
  const plain = await firefox.launch({ headless: true })
  const page = await plain.newPage()
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  const hasWebgl2 = await page
    .evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
    .catch(() => false)
  if (hasWebgl2) return { browser: plain, page, prefsForced: false }
  await page.close()
  await plain.close()
  const forced = await firefox.launch({
    headless: true,
    firefoxUserPrefs: {
      'webgl.force-enabled': true,
      'webgl.disabled': false,
      'layers.acceleration.force-enabled': true,
    },
  })
  const page2 = await forced.newPage()
  return { browser: forced, page: page2, prefsForced: true }
}

/**
 * FIREFOX-TIER-SWITCH diagnostic dump. Additive to the smoke's own reads: the
 * open audit item needs to separate "stuck pixel-ratio drop" from "ladder
 * demotion" from "DoF" as the cause of the soft recovered frame, so snapshot
 * the pixel ratio, the drawing-buffer size vs the CSS size, the adaptive
 * ladder's own state (`deviceClass`/`autoMaxDevice`/`dprHalved`/
 * `autoShadowsOff`) and the RESOLVED quality settings (via the same
 * `/src/scene/quality.ts` dev-server import that
 * `scripts/scenarios/fallback-swiftshader.json` uses) around every switch.
 */
async function dumpState(page, label) {
  const d = await page
    .evaluate(async () => {
      const s = window.__store.getState()
      const gl3 = window.__three?.gl
      const c = gl3?.domElement
      let resolved = null
      try {
        const m = await import('/src/scene/quality.ts')
        const q = m.resolveQuality(
          s.qualityTier,
          s.qualityOverrides,
          s.deviceClass,
          s.softwareRenderer,
        )
        resolved = {
          shadowMapSize: q.shadowMapSize,
          postprocessing: q.postprocessing,
          ao: q.ao,
          dof: q.dof,
          cinematic: q.cinematic,
          dprMax: q.dprMax,
          ibl: q.ibl,
          envResolution: q.envResolution,
        }
      } catch (e) {
        resolved = { error: String(e) }
      }
      // FIREFOX-TIER-SWITCH: the interactive-degrade decision inputs, so a soft
      // frame can be attributed to a HELD degrade (a long frame inside the hold
      // window) vs a stuck one (nothing wants it, yet the ratio stayed down).
      let degrade = null
      try {
        const d = await import('/src/scene/interactiveDegrade.ts')
        const cm = await import('/src/scene/cameraMotionSignal.ts')
        const now = performance.now()
        const lastLong = d.lastLongFrameTime()
        degrade = {
          msSinceLastLongFrame: lastLong ? Math.round(now - lastLong) : null,
          gestureActive: cm.isCameraGestureActive(),
          msSinceGestureEnd: cm.cameraGestureEndedAt()
            ? Math.round(now - cm.cameraGestureEndedAt())
            : null,
          wants: d.shouldDegradeDpr({
            now,
            gestureActive: cm.isCameraGestureActive(),
            gestureEndedAt: cm.cameraGestureEndedAt(),
            lastLongFrameAt: lastLong,
            postprocessing: !!resolved?.postprocessing,
            effectiveDpr: Math.min(window.devicePixelRatio || 1, resolved?.dprMax ?? 1),
            recording: s.recording,
          }),
          LONG_FRAME_MS: d.LONG_FRAME_MS,
          LONG_FRAME_HOLD_MS: d.LONG_FRAME_HOLD_MS,
        }
      } catch (e) {
        degrade = { error: String(e) }
      }
      return {
        qualityTier: s.qualityTier,
        deviceClass: s.deviceClass,
        autoMaxDevice: s.autoMaxDevice,
        dprHalved: s.dprHalved,
        autoShadowsOff: s.autoShadowsOff,
        qualityUserSet: s.qualityUserSet,
        softwareRenderer: s.softwareRenderer,
        qualityOverrides: s.qualityOverrides,
        pixelRatio: gl3?.getPixelRatio?.() ?? null,
        devicePixelRatio: window.devicePixelRatio,
        canvasPx: c ? `${c.width}x${c.height}` : null,
        cssPx: c ? `${c.clientWidth}x${c.clientHeight}` : null,
        contextLost: gl3?.getContext?.()?.isContextLost?.() ?? null,
        resolved,
        degrade,
      }
    })
    .catch((e) => ({ error: String(e) }))
  console.log(`STATE[${label}] ${JSON.stringify(d)}`)
  return d
}

const { browser, page, prefsForced } = await launchWithFallback()
console.log(`prefsForced: ${prefsForced}`)

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error' || t === 'warning') errors.push(`console.${t}: ${msg.text()}`)
})

await page.setViewportSize({ width: 1280, height: 800 })
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

let sceneReady = false
try {
  await page.waitForFunction(() => !!window.__store, { timeout: 30000 })
  await page
    .waitForFunction(
      () =>
        !document.querySelector('#boot-loader') ||
        getComputedStyle(document.querySelector('#boot-loader')).display === 'none',
      { timeout: 60000 },
    )
    .catch(() => {})
  // Same eval as scripts/scenarios/photo-gtao-ab.json's "dismiss-overlays" step.
  await page.evaluate(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
    const s = window.__store.getState()
    s.endTour?.()
    s.setOnboardingOpen?.(false)
    s.dismissLocationPrompt?.()
  })
  await page.waitForFunction(() => window.__store.getState().sceneReady === true, {
    timeout: 90000,
  })
  sceneReady = true
} catch (e) {
  errors.push(`readiness: ${e.message}`)
}

await page.evaluate(() => window.__store.getState().setManualHour?.(13))
await new Promise((r) => setTimeout(r, 1000))

const results = {}
if (sceneReady) {
  await mkdir('/tmp/photoreal/firefox', { recursive: true })
  let step = 0
  for (const mode of MODES) {
    step += 1
    console.log(`switching to ${mode}...`)
    await dumpState(page, `${step}-before-${mode}`)
    await page.evaluate((m) => window.__store.getState().setQualityTier(m), mode)
    await new Promise((r) => setTimeout(r, 3000))
    await dumpState(page, `${step}-after-${mode}`)

    const info = await page.evaluate(() => {
      const s = window.__store.getState()
      const gl3 = window.__three?.gl
      const ctx = gl3?.getContext?.()
      let renderer = 'unavailable'
      let vendor = 'unavailable'
      try {
        const dbg = ctx?.getExtension('WEBGL_debug_renderer_info')
        if (dbg) {
          renderer = ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
          vendor = ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
        }
      } catch {
        // Firefox deprecates/blocks this extension — report unavailable, don't throw.
      }
      const glVersion = ctx?.getParameter?.(ctx.VERSION) ?? 'unavailable'
      return {
        deviceClass: s.deviceClass,
        qualityTier: s.qualityTier,
        shadowMapEnabled: gl3?.shadowMap?.enabled ?? null,
        renderer,
        vendor,
        glVersion,
      }
    })

    // Render-cost sample: wrap gl.render (frame-time.mjs's method) and drive frames
    // with r3f's own advance() so the post stack is actually exercised.
    const cost = await page.evaluate(async (n) => {
      const three = window.__three
      if (!three?.gl || typeof three.advance !== 'function') return { p50: null, p90: null }
      const times = []
      const gl = three.gl
      const orig = gl.render.bind(gl)
      gl.render = (...args) => {
        const t0 = performance.now()
        const out = orig(...args)
        times.push(performance.now() - t0)
        return out
      }
      for (let i = 0; i < n; i++) {
        three.advance(performance.now(), true)
        await new Promise((r) => setTimeout(r, 0))
      }
      gl.render = orig
      times.sort((a, b) => a - b)
      const pick = (p) =>
        times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))] : null
      return { p50: pick(0.5), p90: pick(0.9), n: times.length }
    }, FRAMES)

    results[`${step}-${mode}`] = { ...info, cost }
    console.log(`[${step}-${mode}] ${JSON.stringify(results[`${step}-${mode}`])}`)
    await dumpState(page, `${step}-post-frames-${mode}`)
    // SHOT_PREFIX + step index so a repeated mode in MODES (e.g.
    // `performance,realistic,performance`) does not overwrite its own earlier shot.
    await page.screenshot({ path: `/tmp/photoreal/firefox/${SHOT_PREFIX}${step}-${mode}.png` })
  }
}

console.log(`sceneReady: ${sceneReady}`)
console.log(`errors (${errors.length}):`)
for (const e of errors) console.log(`  ${e}`)

await browser.close()

const pageErrorCount = errors.filter((e) => e.startsWith('pageerror')).length
if (!sceneReady || pageErrorCount > 0) {
  console.error('FAIL: scene never became ready or a pageerror occurred')
  process.exit(1)
}
