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
 *
 * `SYNC=1` adds the OTHER half of the frame — it drives one `advance()` per
 * animation frame and forces GPU completion before stopping the clock, so the
 * reported cost includes rasterisation the wrapper cannot see. Required for any
 * claim about a software rasteriser. See the knob's own note below.
 *
 * FRAME-COST-FENCE (`v0.33.2.6`): the completion mechanism is now pluggable and
 * defaults to a **WebGL2 fence** (`SYNCMODE=fence|readPixels|finish` forces one).
 *
 * **Why a third mode was needed.** Decision `(af)` stalled on the instrument, not
 * on the graphics. With `postprocessing` + N8AO mounted on SwiftShader (option
 * (3)/arm E) the console shows `GL_INVALID_OPERATION: glBlitFramebuffer:
 * Depth/stencil buffer format combination not allowed for blit` as the composer
 * comes up. GL errors are STICKY — they queue until someone calls `getError()`.
 * The old one-shot mode detection ran the 1x1 `readPixels` and then `getError()`,
 * collected the COMPOSER's pending error, concluded the read had failed, and fell
 * back to `gl.finish()` for the whole run. `finish()` is not a hard sync in
 * Chromium's command-buffer implementation, so arm E read 774 ms against the flat
 * `performance` control's 865 ms — a strictly heavier arm coming out faster,
 * which is what exposed it. Two arms measured in different sync modes are not
 * comparable, so no conclusion could be drawn.
 *
 * Forcing `SYNCMODE=readPixels` on arm E settles what actually broke: the READ IS
 * FINE (855.6 ms p50, zero GL errors, within 1.2 % of the fence's 866.2 ms in the
 * same session). The mechanism was never broken, the DETECTION was — so the
 * detection now drains pending errors before it probes anything, and the fence
 * below is preferred regardless, because it needs no framebuffer round trip at
 * all and so cannot be confused by whatever the composer left attached.
 *
 * **The fence.** After `advance()` the probe inserts
 * `gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)` and calls `gl.flush()`, then
 * waits for the fence to signal. A *blocking* wait is not available on the web:
 * `clientWaitSync`'s timeout may not exceed `MAX_CLIENT_WAIT_TIMEOUT_WEBGL`,
 * which is **0** in Chromium (the probe prints the value it read, so the claim
 * is checked per run, not remembered). The documented pattern is therefore to
 * poll with a zero timeout and YIELD between polls — the graphics pipeline
 * cannot progress while the event handler is still on the stack. Each poll takes
 * `clientWaitSync(s, 0, 0)` (`ALREADY_SIGNALED`/`CONDITION_SATISFIED` = done)
 * and, belt and braces, `getSyncParameter(s, SYNC_STATUS) === SIGNALED`; the
 * frame's sync cost is `t_signaled − t0` and the sync object is deleted.
 * Sources:
 *   https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/fenceSync
 *   https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/clientWaitSync
 *   https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/getSyncParameter
 *   https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
 *   https://github.com/gfxfundamentals/webgl-fundamentals/discussions/363  (greggman: poll
 *     `clientWaitSync(…, 0, 0)` and re-schedule with `setTimeout`, never spin — you must exit
 *     the event handler for the pipeline to progress)
 *   https://github.com/KhronosGroup/WebGL/blob/main/sdk/tests/conformance2/sync/sync-webgl-specific.html
 *     (the WebGL2 conformance test for the `MAX_CLIENT_WAIT_TIMEOUT_WEBGL` clamp; spec §3.7.14)
 *   https://chromium.googlesource.com/chromium/src/+/lkgr/docs/design/gpu_synchronization.md
 *     ("A GL Fence … becomes signaled when the GPU reaches this point in the command stream,
 *     implying that all previous commands have completed")
 *
 * **Validation.** SwiftShader headless, `WARMUP=8 SECONDS=45/90 DSF=2`, hour 13,
 * default 4-room flat, `realistic`, `deviceClass weak`, orbit.
 *   (a) AGREES WITH THE MODE IT REPLACES, both modes back to back in ONE session
 *       via `SYNCMODE=fence,readPixels`. Arm B (`softwareRasterFallback` on, no
 *       overrides): fence p50 1984.7 / p90 2125.6 ms against readPixels p50
 *       1925.4 / p90 2097.2 ms — +3.1 % / +1.4 %, inside the ~10 % bar. Arm E
 *       (option (3)): readPixels 855.6, fence 866.2 ms — +1.2 %.
 *   (b) IS ACTUALLY WAITING. Under SwiftShader arm B's fence p50 is 1984.7 ms
 *       against a `cpu` p50 of 10.2 ms — 195x — so it is timing raster the
 *       `gl.render` wrapper never sees. (For contrast, ANGLE Metal on the same
 *       machine: fence p50 37.2 ms against cpu 15.1 ms.)
 *   (c) SURVIVES THE COMPOSER. Arm E with `ao=true,postprocessing=true,
 *       envResolution=192` runs `[fence]` with **zero** GL errors, zero fence
 *       failures, in five independent runs (auto-detected AND forced), landing at
 *       850.0-866.2 ms p50 — against the discredited `finish` mode's 774 ms.
 *
 * **Poll granularity is this mode's error term, and it is measured, not assumed.**
 * A `setTimeout(0)` poll cannot resolve finer than one timer tick, so the cost
 * overshoots by at most the interval between the last poll that saw UNSIGNALLED
 * and the one that saw the signal. `pollGap p50/max` prints exactly that. On a
 * real GPU (ANGLE Metal, 37 ms frames) it is p50 5.1 ms — the `setTimeout` clamp,
 * i.e. the intrinsic granularity, and ~4 % of a frame that this instrument is not
 * needed for anyway. Under SwiftShader it is much larger (p50 ~750-2050 ms) for a
 * reason worth stating rather than hiding: the polls are nearly free (`queryMs`
 * totals ~2 ms across ~1500 polls, so `clientWaitSync` is NOT blocking), they run
 * at the 4 ms clamp for the first ~100 ms of the frame, and then the renderer's
 * main thread is starved for the rest of it while the software rasteriser works —
 * so the last observable moment before the signal is early in the frame. That
 * makes the formal bound useless there, which is precisely why validation (a)
 * exists: `readPixels` blocks and returns the instant the pixel lands, so its
 * agreement with the fence to 1-3 % is the empirical proof that the poll is not
 * inflating the number.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 12)
// Seconds of motion to DISCARD before sampling, so shader compiles are not counted as frame cost
// and both arms of a comparison are measured in the same steady state. See the note at the
// warm-up timer. 0 keeps the historic behaviour, which is what every earlier number used.
const WARMUP = Number(process.env.WARMUP || 0)
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
// TRANSSCALE=<n> pins `gl.transmissionResolutionScale`, ablating the cost of
// three's transmission pass without touching the scene or the materials.
//
// `realistic` is the ONLY mode with real transmission (`transmissionTiers`), and
// it is the mode measured at 10.9 fps in walk against 58.9 in orbit
// (`v0.31.7.83`) — with p50 inside `gl.render` at just 6.4 ms, so ~85 ms/frame is
// unattributed. A transmissive mesh forces a scene re-render into a transmission
// target when it is in frustum, and walk mode faces the window while orbit often
// does not. Setting the scale to ~0.05 makes that pass nearly free; if the frame
// rate recovers, this is the cost.
const TRANSSCALE = process.env.TRANSSCALE == null ? null : Number(process.env.TRANSSCALE)
// OVERRIDE=key=value sets one `qualityOverrides` entry, so a single axis of a mode
// can be ablated without inventing a new mode. Values are JSON-parsed, so
// `postprocessing=false`, `dprMax=1` and `shadowMapSize=1024` all work.
// OVERRIDE accepts SEVERAL comma-separated entries, so a multi-axis ablation
// (shadows + post + AO + DPR, i.e. the REALISTIC-SOFTWARE-FALLBACK arm) can be
// measured as one arm rather than needing a bespoke mode.
// OVERRIDE also accepts a PER-ARM list, SEMICOLON-separated, indexed by position
// in `TIERS` — `TIERS=realistic,realistic,performance` with
// `OVERRIDE=';ao=true,postprocessing=true,envResolution=192;'` measures arm B
// (no overrides), arm E (option (3)) and the flat `performance` control as three
// arms of ONE session, on one instrument. Nothing needs to clear the previous
// arm's overrides: `setQualityTier`, which the loop calls first for every arm,
// already sets `qualityOverrides: {}` and `qualityUserSet: true`
// (`uiSlice.ts`) — so every arm starts clean AND with the adaptive ladder pinned,
// including the ones that set no override at all.
const OVERRIDE = process.env.OVERRIDE || null
const OVERRIDES = OVERRIDE == null ? [] : OVERRIDE.split(';')
// ANGLE=<backend> picks the ANGLE backend. The default `metal` is a REAL GPU;
// `ANGLE=swiftshader` is the CPU rasteriser path, which is the only way to price
// anything gated on `isSoftwareRenderer` (REALISTIC-SOFTWARE-FALLBACK). Note the
// instrument's blind spot there: this times CPU work inside `gl.render`, and under
// SwiftShader that is well under 1% of the frame -- the rasterisation happens in
// the GPU process. Trust the p50 as a CPU-submit cost, not as a frame rate.
// (SYNC=1, below, is the fix for exactly that blind spot.)
//
// SYNC=1 measures the WHOLE frame, not just the CPU submit (FRAME-COST-SYNC).
//
// **Why this knob exists.** The `gl.render` wrapper above times CPU work on the
// main thread. Every GL call it contains is asynchronous: the command is queued
// and the rasterisation happens later, elsewhere -- in the GPU process for a
// hardware backend, and in SwiftShader's CPU raster threads for the software one.
// So the wrapper's p50 is a submit cost, and under SwiftShader it is a tiny and
// possibly misleading fraction of the frame. That is not hypothetical: the
// REALISTIC-SOFTWARE-FALLBACK measurement (`v0.33.2.0`) reported a 21-42% p50 win
// while the achieved render RATE was identical (0.5/s) in both arms, because the
// rate was set by raster work the instrument could not see. A perf change that
// only moves the invisible part is unfalsifiable with the CPU number alone.
//
// **What it does.** In SYNC mode the probe DRIVES the frames instead of watching
// them: r3f's own demand-mode render is dropped (harmless -- we re-render in the
// same animation frame), and one `window.__three.advance(now)` runs per rAF, so
// there is exactly one full pipeline pass per displayed frame. `t0` is taken
// before `advance`; then the default framebuffer is bound and a 1x1
// `readPixels` is issued; `t1` after it returns. `readPixels` on the default
// framebuffer is the reliable pipeline sync in Chromium -- `gl.finish()` is NOT
// a hard sync there (the command-buffer implementation may return before the
// service side has drained), whereas a pixel read cannot be satisfied without
// the pixel. `preserveDrawingBuffer` is false, so the read must land in the SAME
// JS task as the render, before the compositor swaps: it does, because it is
// issued synchronously on the line after `advance` returns.
//
// Both numbers are reported per tier: `cpu p50/p90` (the historic wrapper, so
// old numbers stay comparable) and `sync p50/p90` (end to end). `sync` >> `cpu`
// under SwiftShader is the evidence the read is actually waiting.
//
// **Blind spot.** `sync` is a SERIALISED frame: forcing completion inside the
// frame removes the CPU/GPU overlap a real pipelined frame gets, so it is an
// upper bound on cost and a lower bound on the achievable rate. It is a valid
// A/B (both arms pay the same serialisation) and a valid attribution of where
// the frame goes; it is not the frame rate a user sees. It also cannot separate
// raster from present/composite. Achieved frames/s in SYNC mode is the probe's
// own driven rate, which is capped by the serialisation, not by demand-mode
// invalidation cadence.
const SYNC = process.env.SYNC === '1'
// SYNCMODE=fence|readPixels|finish FORCES one completion mechanism instead of
// letting the probe choose (FRAME-COST-FENCE). The auto choice is `fence` when
// `fenceSync` exists (i.e. WebGL2), else the historic `readPixels`, else
// `finish`. Forcing exists for one reason: two arms measured in DIFFERENT sync
// modes are not comparable, and the cross-check that certifies the fence
// (fence p50 ≈ readPixels p50 on an arm where readPixels works) has to run both
// modes back to back inside a single session.
//
// It also accepts a PER-ARM list, `SYNCMODE=fence,readPixels`, indexed by
// position in `TIERS` (the last entry covers any remaining arms). That is what
// makes the certification runnable at all: validation (a) — fence p50 must agree
// with readPixels p50 on an arm where readPixels works — is only meaningful if
// both modes see the same machine, the same warm-up and the same drift, i.e.
// `TIERS=realistic,realistic SYNCMODE=fence,readPixels` in ONE browser session.
const SYNCMODE = process.env.SYNCMODE || null
const SYNCMODES = (SYNCMODE || '').split(',').filter(Boolean)
for (const m of SYNCMODES) {
  if (!['fence', 'readPixels', 'finish'].includes(m)) {
    console.error(`SYNCMODE must be fence, readPixels or finish, got ${m}`)
    process.exit(1)
  }
}
// IDLE=1 drives NOTHING and measures how many frames the scene draws at rest.
// This is the regression guard for `RenderPump`'s `invalidate(2)`: incrementing the
// frame counter instead of setting it is what un-capped walk mode, but a counter
// that saturates at 60 could in principle keep the scene drawing forever. It must
// still reach 0 frames when nothing is happening.
const IDLE = process.env.IDLE === '1'
if (MODE !== 'orbit' && MODE !== 'walk') {
  console.error(`MODE must be orbit or walk, got ${MODE}`)
  process.exit(1)
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    `--use-angle=${process.env.ANGLE || 'metal'}`,
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
// FLAGS_OFF=a,b turns feature flags off for an A/B (dev builds only — `setFeatureFlag`
// is inert in prod). Added for PHOTOREAL-HERO so the hero-model cost can be priced
// against the primitives it replaces at the same pose and tier.
const FLAGS_OFF = (process.env.FLAGS_OFF || '').split(',').filter(Boolean)
if (FLAGS_OFF.length) {
  await page.evaluate((flags) => {
    for (const f of flags) window.__store.getState().setFeatureFlag?.(f, false)
  }, FLAGS_OFF)
  console.log(`flags off: ${FLAGS_OFF.join(', ')}`)
}
await page.evaluate(
  (h) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)

// PLAN=<template id> swaps a shipped template in (auto-furnished) and LEVEL=<id> walks that
// storey — the only way to price an UPPER-storey walk, which since item `(g)` also draws every
// storey below it.
const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
if (PLAN) {
  const swapped = await page.evaluate(async (id) => {
    const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
    const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
    if (!tpl) return null
    const st = window.__store.getState()
    st.replaceFloorPlan(structuredClone(tpl), { furniture: 'clear' })
    st.applyLayoutPreset('move-in')
    return tpl.name
  }, PLAN)
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await new Promise((r) => setTimeout(r, 2500))
  console.log(`plan swapped -> ${swapped} (${PLAN})`)
}
if (LEVEL) {
  await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
  await new Promise((r) => setTimeout(r, 1500))
  console.log(`walked level -> ${LEVEL}`)
}

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
    `${WARMUP ? `${WARMUP}s warm-up DISCARDED + ` : ''}${SECONDS}s ${IDLE ? 'IDLE (no input at all -- expect ~0 drawn frames)' : MODE === 'walk' ? `WALK (translate${WALKPITCH ? ' + pitch' : ', pitch OFF = instrument control'}; no yaw)` : 'orbit drag'} per tier`,
)

/** Drive motion for SECONDS, in whichever mode was asked for. */
async function drive() {
  const t0 = Date.now()
  let i = 0
  if (IDLE) {
    // Report WHY the pump thinks a frame is wanted. "Idle draws 60 fps" is either a
    // stuck continuous flag or something genuinely animating, and the two have
    // opposite fixes.
    const why = await page.evaluate(() => {
      const s = window.__store.getState()
      return {
        cameraMode: s.cameraMode,
        autoRotate: s.autoRotate,
        touring: Boolean(s.touring),
        recording: s.recording,
        showcaseAccumulating: s.showcaseAccumulating,
        dragging: s.draggingItemId != null,
        loadingActive: Boolean(s.loading?.active),
        sceneReady: s.sceneReady,
        renderingContinuously: window.__renderingContinuously ?? null,
      }
    })
    console.log(`  pump inputs at idle: ${JSON.stringify(why)}`)
    await new Promise((r) => setTimeout(r, SECONDS * 1000))
    return
  }
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
for (const [armIndex, tier] of TIERS.entries()) {
  const armOverride = OVERRIDE == null ? null : (OVERRIDES[armIndex] ?? OVERRIDES.at(-1))
  const armSyncMode = SYNCMODES.length ? (SYNCMODES[armIndex] ?? SYNCMODES.at(-1)) : null
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
  if (armOverride) {
    // LOCAL (uncommitted) EXTENSION: accept several entries, comma-separated, so a
    // multi-axis ablation (shadows+post+ao+dpr) can be measured as one arm.
    for (const entry of armOverride.split(',').filter(Boolean)) {
      const [k, ...rest] = entry.split('=')
      const raw = rest.join('=')
      let value
      try {
        value = JSON.parse(raw)
      } catch {
        value = raw
      }
      const got = await page.evaluate(
        ({ key, v }) => {
          window.__store.getState().setQualityOverride(key, v)
          return window.__store.getState().qualityOverrides[key]
        },
        { key: k, v: value },
      )
      if (got !== value) throw new Error(`OVERRIDE ${entry}: store has ${JSON.stringify(got)}`)
    }
    // setQualityOverride marks qualityUserSet, which stops the adaptive ladder --
    // wanted here, so the measurement is not chasing a moving device class.
    await new Promise((r) => setTimeout(r, 1200))
  }
  if (TRANSSCALE != null) {
    const got = await page.evaluate((k) => {
      const gl = window.__three.gl
      // Pin it: `RendererTierController` writes this from the tier, and a plain
      // assignment would be reverted the next time that effect runs.
      Object.defineProperty(gl, 'transmissionResolutionScale', {
        get: () => k,
        set: () => {},
        configurable: true,
      })
      return gl.transmissionResolutionScale
    }, TRANSSCALE)
    if (got !== TRANSSCALE) throw new Error(`TRANSSCALE: asked ${TRANSSCALE}, gl has ${got}`)
    await new Promise((r) => setTimeout(r, 800))
  }
  const syncMode = await page.evaluate(
    ({ warmupMs, sync, forcedMode }) => {
      const gl = window.__three.gl
      if (gl.__ftRestore) gl.__ftRestore()
      const orig = gl.render.bind(gl)
      window.__ft = {
        ms: [],
        sync: [],
        gaps: [],
        raf: 0,
        zeros: 0,
        glErrors: 0,
        fenceFails: 0,
        // The DRAWING-BUFFER SIZE is sampled every driven frame, not read once at
        // the end. `InteractiveDprController` halves the pixel ratio while frames
        // are long, and `shouldDegradeDpr` returns false without `postprocessing`
        // — so two arms of the same comparison can be rasterising different
        // NUMBERS OF PIXELS, which would silently dominate any ms figure. An arm
        // that never states its buffer size is not a measurement.
        dprMin: Number.POSITIVE_INFINITY,
        dprMax: 0,
        bufPx: '',
        polls: 0,
        queryMs: 0,
        driveFails: 0,
        stopped: false,
        t0: performance.now(),
      }
      // Sum every render() inside ONE displayed frame. Nesting depth cannot
      // identify "a frame" here: at the post tiers the composer issues ~18
      // SIBLING render() calls per frame (plus a mirror's full extra scene pass),
      // so timing each one separately reports the parts and inflates the render
      // rate to ~1000/s. Bucket by animation frame and flush on the rAF boundary.
      let bucket = 0
      // SYNC mode drives the pipeline itself (see the SYNC note in the header), so
      // r3f's own demand-mode pass is dropped: without this there would be TWO
      // full passes in the frames where motion invalidated the root, and `sync`
      // would be timing our pass plus the drain of a pass `cpu` never counted.
      // Dropping is safe in `frameloop="demand"` — the `advance()` below renders
      // the same frame, in the same animation frame, before the compositor swaps.
      let driving = !sync
      gl.render = (sc, cam) => {
        if (!driving) return undefined
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

      // Force GPU completion. `readPixels` of the DEFAULT framebuffer is the
      // dependable sync in Chromium; `gl.finish()` is not (it can return before
      // the service side has drained). Read the CENTRE pixel, not (0,0): the
      // corner can legitimately be the clear colour, so an all-zero read there
      // could not distinguish "the sync worked" from "nothing was drawn", and
      // that distinction is the whole validation of this knob.
      const ctx = gl.getContext()
      const px = new Uint8Array(4)
      /** readPixels sync. Blocking; returns nothing, the caller times it. */
      const drain = () => {
        ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
        const cw = ctx.drawingBufferWidth
        const ch = ctx.drawingBufferHeight
        ctx.readPixels(
          Math.floor(cw / 2),
          Math.floor(ch / 2),
          1,
          1,
          ctx.RGBA,
          ctx.UNSIGNED_BYTE,
          px,
        )
        const err = ctx.getError()
        if (err !== 0) window.__ft.glErrors++
        if (px[0] === 0 && px[1] === 0 && px[2] === 0) window.__ft.zeros++
      }
      // WebGL2 FENCE sync (FRAME-COST-FENCE). Preferred, because it is the only
      // one of the three that survives the post composer under SwiftShader — see
      // the file header for the `glBlitFramebuffer` error `readPixels` hits
      // there, and for the sources behind this polling pattern.
      //
      // The wait is a POLL, not a block: `clientWaitSync`'s timeout is capped at
      // `MAX_CLIENT_WAIT_TIMEOUT_WEBGL`, which Chromium reports as 0, so there is
      // no blocking form to call. Each poll re-schedules itself with
      // `setTimeout(0)`; yielding is mandatory, since the pipeline cannot advance
      // while this handler is on the stack. Returns a promise of the elapsed ms.
      const fenceWait = (t0) =>
        new Promise((resolve) => {
          let s = null
          try {
            s = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0)
            ctx.flush()
          } catch {
            s = null
          }
          if (!s) {
            window.__ft.fenceFails++
            resolve(performance.now() - t0)
            return
          }
          // `lastEnd` is when the PREVIOUS poll returned "not yet". The signal can
          // only have landed after that, so the interval between it and the start
          // of the poll that observes the signal is this mode's entire error term:
          // the sleep during which we were not looking. That is what `gaps` holds.
          //
          // It is deliberately NOT the whole inter-poll interval. `clientWaitSync`
          // and `getSyncParameter` are synchronous round trips to the GPU process,
          // and under SwiftShader that process is busy rasterising — so a poll can
          // itself block for most of a frame. Time spent INSIDE the query is a
          // legitimate wait on the GPU, not instrument error; counting it as
          // granularity would have reported an ~800 ms "error term" on a ~900 ms
          // frame, which is how this was caught.
          let lastEnd = performance.now()
          const check = () => {
            const started = performance.now()
            const st = ctx.clientWaitSync(s, 0, 0)
            const done =
              st === ctx.ALREADY_SIGNALED ||
              st === ctx.CONDITION_SATISFIED ||
              st === ctx.WAIT_FAILED ||
              ctx.getSyncParameter(s, ctx.SYNC_STATUS) === ctx.SIGNALED
            window.__ft.polls++
            window.__ft.queryMs += performance.now() - started
            if (!done) {
              lastEnd = performance.now()
              setTimeout(check, 0)
              return
            }
            const dt = performance.now() - t0
            window.__ft.gaps.push(started - lastEnd)
            ctx.deleteSync(s)
            if (ctx.getError() !== 0) window.__ft.glErrors++
            resolve(dt)
          }
          check()
        })
      const finishWait = (t0) => {
        ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
        ctx.finish()
        if (ctx.getError() !== 0) window.__ft.glErrors++
        return Promise.resolve(performance.now() - t0)
      }
      const readPixelsWait = (t0) => {
        try {
          drain()
        } catch {
          window.__ft.glErrors++
        }
        return Promise.resolve(performance.now() - t0)
      }

      // Mode selection. `fence` whenever WebGL2 offers it; otherwise the historic
      // one-shot probe decides between `readPixels` and `finish` exactly as
      // before (kept intact, and still reachable via `SYNCMODE=readPixels`).
      // Drain any error the RENDER left pending before probing a sync mode.
      //
      // This is the bug that stalled decision (af). Under SwiftShader the post
      // composer + N8AO raise `GL_INVALID_OPERATION: glBlitFramebuffer:
      // Depth/stencil buffer format combination not allowed for blit` when they
      // mount. GL errors are STICKY — they sit in the queue until someone calls
      // `getError()`. The old one-shot detection ran `drain()` and then
      // `getError()`, so it collected the COMPOSER's pending error, concluded
      // that the 1x1 `readPixels` had failed, and fell back to `gl.finish()` for
      // the entire run. `finish()` is not a hard sync in Chromium, so arm E then
      // read 774 ms against the flat `performance` control's 865 ms — faster than
      // a strictly cheaper arm, which is what exposed it. Forcing
      // `SYNCMODE=readPixels` on arm E shows the read itself is fine (855.6 ms
      // p50, zero GL errors, within 1.2% of the fence's 866.2 ms in the same
      // session): the mechanism was never broken, the DETECTION was.
      const clearErrors = () => {
        for (let i = 0; i < 32 && ctx.getError() !== 0; i++);
      }
      let mode = 'off'
      if (sync) {
        clearErrors()
        window.__ft.maxClientWaitTimeout =
          typeof ctx.getParameter === 'function' && ctx.MAX_CLIENT_WAIT_TIMEOUT_WEBGL != null
            ? ctx.getParameter(ctx.MAX_CLIENT_WAIT_TIMEOUT_WEBGL)
            : null
        const fenceOk = (() => {
          if (typeof ctx.fenceSync !== 'function') return false
          try {
            clearErrors()
            const s = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0)
            if (!s) return false
            ctx.flush()
            ctx.deleteSync(s)
            return ctx.getError() === 0
          } catch {
            return false
          }
        })()
        if (forcedMode) {
          mode = forcedMode
        } else if (fenceOk) {
          mode = 'fence'
        } else {
          clearErrors()
          try {
            drain()
            mode = window.__ft.glErrors > 0 ? 'finish' : 'readPixels'
          } catch {
            mode = 'finish'
          }
        }
        window.__ft.fenceAvailable = fenceOk
        window.__ft.glErrors = 0
        window.__ft.zeros = 0
      }
      const forceComplete =
        mode === 'fence' ? fenceWait : mode === 'readPixels' ? readPixelsWait : finishWait

      const tick = (now) => {
        window.__ft.raf++
        {
          const pr = gl.getPixelRatio()
          if (pr < window.__ft.dprMin) window.__ft.dprMin = pr
          if (pr > window.__ft.dprMax) window.__ft.dprMax = pr
          window.__ft.bufPx = `${ctx.drawingBufferWidth}x${ctx.drawingBufferHeight}`
        }
        if (!sync) {
          if (bucket > 0) {
            window.__ft.ms.push(bucket)
            bucket = 0
          }
          window.__ft.rafId = requestAnimationFrame(tick)
          return
        }
        // Discard anything r3f queued before this callback so `cpu` and `sync`
        // describe the SAME single pass.
        bucket = 0
        const t0 = performance.now()
        driving = true
        let waited
        try {
          window.__three.advance(now)
          waited = forceComplete(t0)
        } catch {
          window.__ft.driveFails++
          waited = Promise.resolve(performance.now() - t0)
        } finally {
          driving = false
        }
        // The completion may be ASYNC now (the fence polls across timer ticks),
        // so the next animation frame is requested when this one has landed —
        // which is what the blocking modes did implicitly, and what keeps the
        // "exactly one full pipeline pass per driven frame" invariant true.
        waited.then((dt) => {
          if (window.__ft.stopped) return
          if (bucket > 0) {
            window.__ft.ms.push(bucket)
            window.__ft.sync.push(dt)
          }
          bucket = 0
          window.__ft.rafId = requestAnimationFrame(tick)
        })
      }
      requestAnimationFrame(tick)

      // WARMUP: throw away the first N seconds of samples.
      //
      // `v0.31.7.271`. Sampling starts the instant the drag does, so a run that compiles shaders
      // during it measures the COMPILES as frame cost -- and, worse, the stall blocks rAF and so
      // shifts WHICH part of the orbit the remaining samples cover. That is not a hypothetical: the
      // `(z9)` A/B showed p50 10.3 ms with a 1.1 s stall against 11.9 ms with none, which is the
      // wrong way round for a change that REMOVES ~194 program compiles, and the two p50s covering
      // different frames is the obvious suspect. With a warm-up both arms are measured in the same
      // steady state, so the comparison is of frame cost rather than of when the stall landed.
      if (warmupMs > 0) {
        setTimeout(() => {
          window.__ft.ms.length = 0
          window.__ft.sync.length = 0
          window.__ft.gaps.length = 0
          window.__ft.raf = 0
          window.__ft.zeros = 0
          window.__ft.glErrors = 0
          window.__ft.t0 = performance.now()
          window.__ft.warmedUp = true
        }, warmupMs)
      }
      window.__ft.mode = mode
      return {
        mode,
        fenceAvailable: window.__ft.fenceAvailable ?? null,
        maxClientWaitTimeout: window.__ft.maxClientWaitTimeout ?? null,
      }
    },
    { warmupMs: WARMUP * 1000, sync: SYNC, forcedMode: armSyncMode },
  )
  await drive()
  const r = await page.evaluate(() => {
    const f = window.__ft
    f.stopped = true
    cancelAnimationFrame(f.rafId)
    const secs = (performance.now() - f.t0) / 1000
    const pct = (arr) => {
      const a = arr.slice().sort((x, y) => x - y)
      const q = (p) =>
        a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : -1
      return { p50: q(0.5), p90: q(0.9), max: +(a[a.length - 1] ?? -1).toFixed(1) }
    }
    const cpu = pct(f.ms)
    const sync = pct(f.sync)
    return {
      n: f.ms.length,
      p50: cpu.p50,
      p90: cpu.p90,
      max: cpu.max,
      syncP50: sync.p50,
      syncP90: sync.p90,
      syncMax: sync.max,
      zeros: f.zeros,
      glErrors: f.glErrors,
      fenceFails: f.fenceFails,
      dpr: f.dprMin === f.dprMax ? f.dprMin : `${f.dprMin}-${f.dprMax}`,
      bufPx: f.bufPx,
      polls: f.polls,
      queryMs: +f.queryMs.toFixed(1),
      driveFails: f.driveFails,
      gapP50: pct(f.gaps).p50,
      gapMax: pct(f.gaps).max,
      renderHz: +(f.ms.length / secs).toFixed(1),
      rafHz: +(f.raf / secs).toFixed(1),
    }
  })
  const resolved = await page.evaluate(async () => {
    const { resolveQuality } = await import('/src/scene/quality.ts')
    const st = window.__store.getState()
    return {
      deviceClass: st.deviceClass,
      tier: st.qualityTier,
      overrides: st.qualityOverrides,
      // MUST pass `softwareRenderer` — it is the 4th argument of `resolveQuality`
      // (REALISTIC-SOFTWARE-FALLBACK) and omitting it reports the UN-floored preset
      // while the app renders the floored one, which reads as "the flag did nothing".
      softwareRenderer: st.softwareRenderer,
      settings: resolveQuality(
        st.qualityTier,
        st.qualityOverrides,
        st.deviceClass,
        st.softwareRenderer,
      ),
    }
  })
  console.log(`  resolved: ${JSON.stringify(resolved)}`)
  // Always printed: an arm's ms figure is meaningless without the pixel count it
  // was rasterising (see the `dprMin/dprMax` note in the instrument).
  console.log(`  raster: pixelRatio=${r.dpr} drawingBuffer=${r.bufPx}`)
  if (SYNC) {
    // The sync MODE is the first thing to read on any SYNC run: two arms measured
    // in different modes are not comparable (FRAME-COST-FENCE).
    console.log(
      `  sync instrument: mode=${syncMode.mode}${armSyncMode ? ' (FORCED)' : ''}` +
        ` fenceAvailable=${syncMode.fenceAvailable}` +
        ` MAX_CLIENT_WAIT_TIMEOUT_WEBGL=${syncMode.maxClientWaitTimeout}` +
        (syncMode.mode === 'fence'
          ? `  pollGap p50=${r.gapP50}ms max=${r.gapMax}ms (upper bound on the mode's own error)` +
            ` polls=${r.polls} queryMs=${r.queryMs}`
          : ''),
    )
  }
  console.log(
    `${`${tier}${armOverride ? `+ovr[${armIndex}]` : ''}`.padEnd(12)} n=${String(r.n).padStart(3)} cpu p50=${String(r.p50).padStart(6)}ms p90=${String(r.p90).padStart(6)}ms max=${String(r.max).padStart(6)}ms` +
      (SYNC
        ? `   sync p50=${String(r.syncP50).padStart(7)}ms p90=${String(r.syncP90).padStart(7)}ms max=${String(r.syncMax).padStart(7)}ms [${syncMode.mode}${r.glErrors ? ` glErrors=${r.glErrors}` : ''}${r.zeros ? ` blackReads=${r.zeros}/${r.n}` : ''}${r.fenceFails ? ` fenceFails=${r.fenceFails}` : ''}${r.driveFails ? ` driveFails=${r.driveFails}` : ''}]`
        : '') +
      `   drawnFrames/s=${String(r.renderHz).padStart(5)}  (rAF/s=${r.rafHz})`,
  )
}
await browser.close()
