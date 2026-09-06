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
 * animation frame and forces GPU completion with a 1x1 `readPixels` before
 * stopping the clock, so the reported cost includes rasterisation the wrapper
 * cannot see. Required for any claim about a software rasteriser. See the knob's
 * own note below.
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
const OVERRIDE = process.env.OVERRIDE || null
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
  if (OVERRIDE) {
    // LOCAL (uncommitted) EXTENSION: accept several entries, comma-separated, so a
    // multi-axis ablation (shadows+post+ao+dpr) can be measured as one arm.
    for (const entry of OVERRIDE.split(',').filter(Boolean)) {
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
    ({ warmupMs, sync }) => {
      const gl = window.__three.gl
      if (gl.__ftRestore) gl.__ftRestore()
      const orig = gl.render.bind(gl)
      window.__ft = { ms: [], sync: [], raf: 0, zeros: 0, glErrors: 0, t0: performance.now() }
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
      const ctx = sync ? gl.getContext() : null
      const px = new Uint8Array(4)
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
      // Fall back to finish()+getError() if the read cannot be issued at all.
      let mode = 'off'
      if (sync) {
        try {
          drain()
          mode = window.__ft.glErrors > 0 ? 'finish' : 'readPixels'
        } catch {
          mode = 'finish'
        }
        window.__ft.glErrors = 0
        window.__ft.zeros = 0
      }
      const forceComplete =
        mode === 'readPixels'
          ? drain
          : () => {
              ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
              ctx.finish()
              if (ctx.getError() !== 0) window.__ft.glErrors++
            }

      const tick = (now) => {
        window.__ft.raf++
        if (sync) {
          // Discard anything r3f queued before this callback so `cpu` and `sync`
          // describe the SAME single pass.
          bucket = 0
          const t0 = performance.now()
          driving = true
          try {
            window.__three.advance(now)
            forceComplete()
          } finally {
            driving = false
          }
          const dt = performance.now() - t0
          if (bucket > 0) {
            window.__ft.ms.push(bucket)
            window.__ft.sync.push(dt)
          }
          bucket = 0
        } else if (bucket > 0) {
          window.__ft.ms.push(bucket)
          bucket = 0
        }
        window.__ft.rafId = requestAnimationFrame(tick)
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
          window.__ft.raf = 0
          window.__ft.zeros = 0
          window.__ft.glErrors = 0
          window.__ft.t0 = performance.now()
          window.__ft.warmedUp = true
        }, warmupMs)
      }
      return mode
    },
    { warmupMs: WARMUP * 1000, sync: SYNC },
  )
  await drive()
  const r = await page.evaluate(() => {
    const f = window.__ft
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
  console.log(
    `${tier.padEnd(12)} n=${String(r.n).padStart(3)} cpu p50=${String(r.p50).padStart(6)}ms p90=${String(r.p90).padStart(6)}ms max=${String(r.max).padStart(6)}ms` +
      (SYNC
        ? `   sync p50=${String(r.syncP50).padStart(7)}ms p90=${String(r.syncP90).padStart(7)}ms max=${String(r.syncMax).padStart(7)}ms [${syncMode}${r.glErrors ? ` glErrors=${r.glErrors}` : ''}${r.zeros ? ` blackReads=${r.zeros}/${r.n}` : ''}]`
        : '') +
      `   drawnFrames/s=${String(r.renderHz).padStart(5)}  (rAF/s=${r.rafHz})`,
  )
}
await browser.close()
