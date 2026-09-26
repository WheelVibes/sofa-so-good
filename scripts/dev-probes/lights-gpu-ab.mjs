// R7-AB — Stage 1 of docs/research/lights-gpu-bound-2026-09-25.md: the three in-session A/Bs.
//
//   SSG_URL=http://localhost:5371/ node scripts/dev-probes/lights-gpu-ab.mjs \
//     --arm desktop --mode ladder --poses living,kitchen --out /tmp/r7ab/desktop-ladder.json
//
// Modes: explore | ladder | dpr | post | pool | passes | census, and R7-AE's Stage 2 acceptance
// modes: flagab (a feature flag off/on/off/on per pose — `--flag roomScopedLights`), toggle (the
// lights-switch compile stall per arm, from a boot with the lights OFF — `--lights-boot off`),
// visual (flag off vs on frames + linear-light diff per pose and hour) and walk (per-step linear
// luminance along a doorway path, both arms, to catch a pool popping).  ONE boot per invocation;
// every arm of an A/B is flipped in place inside that boot (a two-boot A/B of this app is not
// attributable).  `--flags k:v,…` pins extra feature flags before the first measurement.
//
// Instruments (all per arm, after the arm has settled; compile frames are measured separately):
//  - raf:   passive window on the app's OWN loop — rAF Hz, rendered-frame Hz (gl.info.render.frame
//           delta), interval p50/p90 between rendered frames, and the summed CPU time of the
//           gl.render calls inside each rendered frame (the "submit" the trace quoted).
//  - adv:   active: `__three.advance()` (the REAL pipeline, composer included — never bare
//           gl.render) followed by a 1-px readPixels that blocks until the GPU has drained.
//           `cpu` = the advance() call alone, `total` = advance + drain, so total ≈ CPU submit +
//           GPU execution with no vsync quantisation. `thru` = N advances then ONE drain, / N:
//           the pipelined throughput cost of a frame.
//  - gpu:   EXT_disjoint_timer_query_webgl2 around advance(), when the context exposes it.
//
// Pins: realistic|performance tier, device class pinned and every adaptive setter replaced by a
// no-op (setDeviceClass / setAutoMaxDevice / setDprHalved / setAutoShadowsOff), the
// `interactiveDegrade` flag off, clock manual 21:00, walk mode, lights on.
//
// Light count is changed by toggling `.visible` on the fixture PointLights (three skips invisible
// lights in projectObject, so NUM_POINT_LIGHTS genuinely changes and programs recompile — exactly
// what an unmount does, without a src seam). The K kept are the K nearest the camera.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive, waitForBakedGi } from './lib.mjs'

const argv = process.argv.slice(2)
const argOf = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : d
}
const armName = argOf('--arm', 'desktop')
const mode = argOf('--mode', 'explore')
const out = argOf('--out', `/tmp/r7ab/${armName}-${mode}.json`)
const poseNames = argOf('--poses', 'living').split(',')
const ladder = argOf('--ladder', '19,12,8,4,1,0').split(',').map(Number)
const winMs = Number(argOf('--win', '4000'))
const advN = Number(argOf('--adv', '40'))
const abFlag = argOf('--flag', 'roomScopedLights')
const lightsAtBoot = argOf('--lights-boot', 'on')
const pinFlags = Object.fromEntries(
  (argOf('--flags', '') || '')
    .split(',')
    .filter(Boolean)
    .map((kv) => {
      const [k, v] = kv.split(':')
      return [k, v !== 'off' && v !== 'false']
    }),
)

const ARMS = {
  desktop: { w: 1200, h: 900, dsf: 1, touch: false, tier: 'realistic', device: 'capable' },
  'desktop-dpr2': { w: 1200, h: 900, dsf: 2, touch: false, tier: 'realistic', device: 'capable' },
  phone: { w: 390, h: 844, dsf: 3, touch: true, tier: 'performance', device: 'weak' },
}
const arm = ARMS[armName]
if (!arm) throw new Error(`unknown --arm ${armName}`)

// Plan (x, z) + yaw. Filled from --mode explore against the default 4-room plan.
const POSES = {
  living: { xz: [11, 7.0], yaw: 0.07 },
  kitchen: { xz: [9.3, 8.0], yaw: 1.5708 },
  bedroom: { xz: [1.9, 3.4], yaw: 0.25 },
  corridor: { xz: [8.8, 4.3], yaw: 1.5708 },
}
const extraPoses = argOf('--pose-json', null)
if (extraPoses) Object.assign(POSES, JSON.parse(extraPoses))

// ── lock + browser budget ─────────────────────────────────────────────────────
const LOCK = path.join(os.tmpdir(), 'sofa-shot-harness.lock')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
async function acquireLock() {
  for (;;) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' })
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const holder = Number.parseInt(fs.readFileSync(LOCK, 'utf8'), 10)
      if (!pidAlive(holder)) fs.rmSync(LOCK, { force: true })
      await sleep(500)
    }
  }
}
const releaseLock = () => {
  try {
    if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK)
  } catch {}
}
process.on('exit', releaseLock)
const topLevelChromes = () =>
  execSync('ps -axo comm', { encoding: 'utf8' })
    .split('\n')
    .filter((l) => /Chrome|Chromium|chrome-headless-shell/.test(l) && !/Helper|crashpad/i.test(l))
    .length
await acquireLock()
for (;;) {
  const n = topLevelChromes()
  if (n <= 1) break
  console.log(`[r7ab] ${n} top-level Chrome instances, waiting for <=1`)
  await sleep(5000)
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
    `--window-size=${arm.w},${arm.h}`,
  ],
})
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, async () => {
    await browser.close().catch(() => {})
    releaseLock()
    process.exit(1)
  })
}
const result = { arm: armName, mode, url: appUrl(), started: new Date().toISOString(), poses: {} }
try {
  const page = await browser.newPage()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport({
    width: arm.w,
    height: arm.h,
    deviceScaleFactor: arm.dsf,
    isMobile: arm.touch,
    hasTouch: arm.touch,
  })
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hdb_onboarded', '1')
    localStorage.setItem('sofa.helpHint.dismissed', '1')
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => {})
  await page.waitForFunction(() => !!window.__store, { timeout: 120000 })
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await page.waitForFunction(() => !document.querySelector('#boot-loader'), { timeout: 180000 })
  await page.waitForFunction(() => !!window.__three?.gl, { timeout: 120000 })

  result.renderer = await page.evaluate(() => {
    const g = window.__three.gl.getContext()
    const d = g.getExtension('WEBGL_debug_renderer_info')
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log(`[r7ab] arm=${armName} mode=${mode} renderer=${result.renderer}`)

  // ── pins ──
  await page.evaluate(
    (tier, device, flags, lightsOn) => {
      const s = window.__store
      const st = s.getState()
      st.setFeatureFlag('interactiveDegrade', false)
      for (const [k, v] of Object.entries(flags)) st.setFeatureFlag(k, v)
      st.setQualityTier(tier)
      st.setDeviceClass(device)
      st.setDprHalved(false)
      st.setAutoShadowsOff(false)
      st.setAutoMaxDevice(null)
      const noop = () => {}
      s.setState({
        setDeviceClass: noop,
        setAutoMaxDevice: noop,
        setDprHalved: noop,
        setAutoShadowsOff: noop,
      })
      st.setCameraMode('firstPerson')
      st.setTimeMode('manual')
      st.setManualHour(21)
      st.setLightsMode(lightsOn ? 'on' : 'off')
    },
    arm.tier,
    arm.device,
    pinFlags,
    lightsAtBoot !== 'off',
  )
  await page.waitForFunction(
    () => {
      const st = window.__store.getState()
      return st.sceneReady && !st.loading?.active && !!window.__walkLook
    },
    { timeout: 180000, polling: 250 },
  )
  if (arm.tier === 'realistic') result.bakedGi = await waitForBakedGi(page)
  await sleep(4000)
  await assertSceneAlive(page, 'boot')

  // ── page-side toolkit ──
  await page.evaluate(() => {
    const th = window.__three
    const gl = th.gl
    const ctx = gl.getContext()
    const px = new Uint8Array(4)
    const drain = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    const tq = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
    const q = (a, p) => {
      const s = [...a].sort((x, y) => x - y)
      return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : Number.NaN
    }
    const r2 = (v) => Math.round(v * 100) / 100
    const lights = () => {
      const a = []
      th.scene.traverse((o) => {
        if (o.isPointLight) a.push(o)
      })
      return a
    }
    // Wrap gl.render: count calls + CPU ms, bucketed by rendered frame.
    const rec = { on: false, calls: 0, ms: 0 }
    const origRender = gl.render.bind(gl)
    gl.render = (...args) => {
      if (rec.passes) {
        // Per-pass census: drain before and after each call, so each row is that pass's
        // serialized GPU+CPU cost (the sum over-states the pipelined frame, the SHARES hold).
        drain()
        const t = performance.now()
        const r = origRender(...args)
        drain()
        const sc = args[0]
        const m = sc?.children?.[0]?.material
        const rt = gl.getRenderTarget()
        rec.passes.push({
          what: sc === th.scene ? 'SCENE' : m?.name || m?.constructor?.name || m?.type || '?',
          ov: sc?.overrideMaterial?.type ?? null,
          rt: rt ? `${rt.width}x${rt.height}${rt.samples ? `x${rt.samples}` : ''}` : 'canvas',
          ms: r2(performance.now() - t),
          cam: args[1]?.type,
          from:
            sc === th.scene
              ? (new Error().stack || '')
                  .split('\n')
                  .slice(2, 5)
                  .map((l) =>
                    l
                      .replace(/https?:\/\/[^/]+\//, '')
                      .replace(/\?[^:]*/, '')
                      .trim(),
                  )
                  .join(' < ')
              : undefined,
        })
        return r
      }
      if (!rec.on) return origRender(...args)
      const t = performance.now()
      const r = origRender(...args)
      rec.ms += performance.now() - t
      rec.calls += 1
      return r
    }
    window.__ab = {
      hasTimer: !!tq,
      state() {
        const st = window.__store.getState()
        return {
          tier: st.qualityTier,
          device: st.deviceClass,
          dprHalved: st.dprHalved,
          autoShadowsOff: st.autoShadowsOff,
          cameraMode: st.cameraMode,
          timeMode: st.timeMode,
          hour: st.manualHour,
          lights: st.lightsMode,
          overrides: st.qualityOverrides,
          pixelRatio: gl.getPixelRatio(),
          buffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
          programs: gl.info.programs?.length ?? -1,
          pointLights: lights().length,
          visiblePointLights: lights().filter((l) => l.visible).length,
          pos: window.__walkLook?.getPosition?.(),
          yaw: window.__walkLook?.getYaw?.(),
        }
      },
      pose(p) {
        window.__walkLook.setPosition(p.xz[0], p.xz[1])
        window.__walkLook.setYaw(p.yaw)
        window.__walkLook.setPitch(p.pitch ?? 0)
        th.invalidate()
      },
      lightList() {
        const c = th.camera.getWorldPosition(th.camera.position.clone())
        return lights().map((l) => {
          const w = l.getWorldPosition(l.position.clone())
          return {
            pos: [r2(w.x), r2(w.y), r2(w.z)],
            d: r2(w.distanceTo(c)),
            i: r2(l.intensity),
            dist: l.distance,
            vis: l.visible,
          }
        })
      },
      // Keep the K nearest (to the camera) point lights visible. Returns the first-frame cost:
      // the synchronous advance+drain immediately after the change, which is where three
      // compiles/links every program whose NUM_POINT_LIGHTS changed.
      setActive(k) {
        const c = th.camera.getWorldPosition(th.camera.position.clone())
        const ls = lights()
          .map((l) => [l, l.getWorldPosition(l.position.clone()).distanceTo(c)])
          .sort((a, b) => a[1] - b[1])
        ls.forEach(([l], i) => {
          l.visible = i < k
        })
        return window.__ab.firstFrame()
      },
      // Every point light visible, but at intensity 0 above index k (the "padded pool").
      setPool(k) {
        const c = th.camera.getWorldPosition(th.camera.position.clone())
        const ls = lights()
          .map((l) => [l, l.getWorldPosition(l.position.clone()).distanceTo(c)])
          .sort((a, b) => a[1] - b[1])
        ls.forEach(([l], i) => {
          l.visible = true
          if (l.userData.__abI === undefined) l.userData.__abI = l.intensity
          l.intensity = i < k ? l.userData.__abI : 0
        })
        return window.__ab.firstFrame()
      },
      restoreIntensity() {
        for (const l of lights()) {
          if (l.userData.__abI !== undefined) l.intensity = l.userData.__abI
          delete l.userData.__abI
        }
      },
      firstFrame() {
        drain()
        const p0 = gl.info.programs?.length ?? 0
        const t0 = performance.now()
        th.advance(performance.now())
        const t1 = performance.now()
        drain()
        const t2 = performance.now()
        const t3 = performance.now()
        th.advance(performance.now())
        drain()
        const t4 = performance.now()
        return {
          firstCpu: r2(t1 - t0),
          firstTotal: r2(t2 - t0),
          secondTotal: r2(t4 - t3),
          programsBefore: p0,
          programsAfter: gl.info.programs?.length ?? 0,
        }
      },
      // Active instrument. Warm-up frames discarded.
      adv(n) {
        for (let i = 0; i < 5; i++) th.advance(performance.now())
        drain()
        const cpu = []
        const total = []
        for (let i = 0; i < n; i++) {
          const t0 = performance.now()
          th.advance(performance.now())
          const t1 = performance.now()
          drain()
          const t2 = performance.now()
          cpu.push(t1 - t0)
          total.push(t2 - t0)
        }
        drain()
        const tt = performance.now()
        for (let i = 0; i < n; i++) th.advance(performance.now())
        drain()
        const thru = (performance.now() - tt) / n
        return {
          n,
          cpuP50: r2(q(cpu, 0.5)),
          cpuP90: r2(q(cpu, 0.9)),
          totalP50: r2(q(total, 0.5)),
          totalP90: r2(q(total, 0.9)),
          totalMin: r2(Math.min(...total)),
          thru: r2(thru),
        }
      },
      // GPU time via timer queries (async results). Resolves to null when unsupported.
      async gpu(n) {
        if (!tq) return null
        const qs = []
        for (let i = 0; i < n; i++) {
          const qq = ctx.createQuery()
          ctx.beginQuery(tq.TIME_ELAPSED_EXT, qq)
          th.advance(performance.now())
          ctx.endQuery(tq.TIME_ELAPSED_EXT)
          qs.push(qq)
          await new Promise((r) => requestAnimationFrame(r))
        }
        const ms = []
        for (let tries = 0; tries < 200 && ms.length < qs.length; tries++) {
          await new Promise((r) => setTimeout(r, 20))
          if (ctx.getParameter(tq.GPU_DISJOINT_EXT)) return { disjoint: true }
          for (const qq of qs) {
            if (qq.__done) continue
            if (ctx.getQueryParameter(qq, ctx.QUERY_RESULT_AVAILABLE)) {
              ms.push(ctx.getQueryParameter(qq, ctx.QUERY_RESULT) / 1e6)
              qq.__done = true
            }
          }
        }
        for (const qq of qs) ctx.deleteQuery(qq)
        return { n: ms.length, p50: r2(q(ms, 0.5)), p90: r2(q(ms, 0.9)) }
      },
      // One frame through advance(), every gl.render call drained + timed; median of n frames.
      passes(n) {
        const frames = []
        for (let i = 0; i < n; i++) {
          rec.passes = []
          th.advance(performance.now())
          frames.push(rec.passes)
          rec.passes = null
        }
        const out = frames[0].map((p, j) => ({
          ...p,
          ms: r2(
            q(
              frames.map((f) => f[j]?.ms ?? 0),
              0.5,
            ),
          ),
        }))
        return { calls: out.length, sum: r2(out.reduce((a, p) => a + p.ms, 0)), passes: out }
      },
      // R7-AE: grab the frame the real pipeline just drew (sRGB 8-bit, bottom-up rows).
      capture(key) {
        th.advance(performance.now())
        gl.setRenderTarget(null)
        const w = ctx.drawingBufferWidth
        const h = ctx.drawingBufferHeight
        const b = new Uint8Array(w * h * 4)
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, b)
        window.__caps = window.__caps || {}
        window.__caps[key] = { w, h, b }
        return { w, h }
      },
      // Linear-light comparison of two captures (sRGB decoded, Rec.709 luminance), plus a diff
      // heatmap: red = B darker than A, green = B brighter, full scale at a 50 % relative change.
      compare(ka, kb) {
        const A = window.__caps[ka]
        const B = window.__caps[kb]
        const lut = new Float32Array(256)
        for (let i = 0; i < 256; i++) {
          const c = i / 255
          lut[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }
        const Y = (b, i) => 0.2126 * lut[b[i]] + 0.7152 * lut[b[i + 1]] + 0.0722 * lut[b[i + 2]]
        const { w, h } = A
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const c2 = cv.getContext('2d')
        const img = c2.createImageData(w, h)
        let sa = 0
        let sb = 0
        let sd = 0
        let changed = 0
        let darker = 0
        let brighter = 0
        const n = w * h
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const ya = Y(A.b, i)
            const yb = Y(B.b, i)
            sa += ya
            sb += yb
            const d = yb - ya
            sd += Math.abs(d)
            const rel = d / Math.max(ya, 0.02)
            if (Math.abs(rel) > 0.05) {
              changed++
              if (rel < 0) darker++
              else brighter++
            }
            const o = ((h - 1 - y) * w + x) * 4
            const k = Math.min(255, Math.round((Math.abs(rel) / 0.5) * 255))
            img.data[o] = rel < 0 ? k : 0
            img.data[o + 1] = rel > 0 ? k : 0
            img.data[o + 2] = 0
            img.data[o + 3] = 255
          }
        }
        c2.putImageData(img, 0, 0)
        return {
          meanA: r2((sa / n) * 1000) / 1000,
          meanB: r2((sb / n) * 1000) / 1000,
          ratio: r2((sb / Math.max(sa, 1e-9)) * 1000) / 1000,
          meanAbsDiff: r2((sd / n) * 10000) / 10000,
          changedPct: r2((changed / n) * 100),
          darkerPct: r2((darker / n) * 100),
          brighterPct: r2((brighter / n) * 100),
          heatmap: cv.toDataURL('image/png'),
        }
      },
      // The lights-switch stall as the USER meets it: the app's own frames around the toggle.
      async stall(lightsMode) {
        const p0 = gl.info.programs?.length ?? 0
        const iv = []
        let last = performance.now()
        let run = true
        const tick = (t) => {
          iv.push(t - last)
          last = t
          if (run) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        await new Promise((r) => setTimeout(r, 300))
        const before = iv.length
        const tStart = performance.now()
        window.__store.getState().setLightsMode(lightsMode)
        await new Promise((r) => setTimeout(r, 3000))
        run = false
        const after = iv.slice(before)
        return {
          lightsMode,
          programsBefore: p0,
          programsDelta: (gl.info.programs?.length ?? 0) - p0,
          maxFrameMs: r2(Math.max(...after)),
          framesOver50ms: after.filter((x) => x > 50).length,
          sumOver50ms: r2(after.filter((x) => x > 50).reduce((a, b) => a + b, 0)),
          windowMs: r2(performance.now() - tStart),
        }
      },
      // Walk a polyline at walking pace, one step per rendered frame, and record the frame's mean
      // linear luminance (every 4th pixel) — a pool slot popping shows as a spike in |ΔY|.
      async walk(path, speed) {
        const lut = new Float32Array(256)
        for (let i = 0; i < 256; i++) {
          const c = i / 255
          lut[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }
        const w = ctx.drawingBufferWidth
        const h = ctx.drawingBufferHeight
        const b = new Uint8Array(w * h * 4)
        const pts = []
        for (let s = 0; s + 1 < path.length; s++) {
          const [x0, z0] = path[s]
          const [x1, z1] = path[s + 1]
          const len = Math.hypot(x1 - x0, z1 - z0)
          const n = Math.max(1, Math.round(len / (speed / 60)))
          // Walk-look yaw 0 looks down -z (plan north); face the direction of travel.
          const yaw = Math.atan2(-(x1 - x0), -(z1 - z0))
          for (let i = 0; i < n; i++)
            pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, yaw])
        }
        const out = []
        for (const [x, z, yaw] of pts) {
          window.__walkLook.setPosition(x, z)
          window.__walkLook.setYaw(yaw)
          th.invalidate()
          await new Promise((r) => requestAnimationFrame(r))
          th.advance(performance.now())
          gl.setRenderTarget(null)
          ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, b)
          let s = 0
          let n = 0
          for (let i = 0; i < b.length; i += 16) {
            s += 0.2126 * lut[b[i]] + 0.7152 * lut[b[i + 1]] + 0.0722 * lut[b[i + 2]]
            n++
          }
          out.push({ x: r2(x), z: r2(z), y: s / n })
        }
        return out
      },
      // Passive instrument: the app's own loop.
      raf(ms) {
        return new Promise((resolve) => {
          const deltas = []
          const frameT = []
          const submit = []
          const calls = []
          let last = 0
          let lastFrame = gl.info.render.frame
          const t0 = performance.now()
          rec.on = true
          rec.ms = 0
          rec.calls = 0
          const tick = (t) => {
            if (last) deltas.push(t - last)
            last = t
            const f = gl.info.render.frame
            if (f !== lastFrame) {
              frameT.push(t)
              submit.push(rec.ms)
              calls.push(rec.calls)
              rec.ms = 0
              rec.calls = 0
              lastFrame = f
            }
            if (t - t0 < ms) requestAnimationFrame(tick)
            else {
              rec.on = false
              const iv = frameT.slice(1).map((v, i) => v - frameT[i])
              const secs = (t - t0) / 1000
              resolve({
                rafHz: r2(deltas.length / secs),
                renderHz: r2(frameT.length / secs),
                intP50: r2(q(iv, 0.5)),
                intP90: r2(q(iv, 0.9)),
                intMax: r2(Math.max(...iv)),
                submitP50: r2(q(submit, 0.5)),
                submitP90: r2(q(submit, 0.9)),
                callsPerFrame: r2(q(calls, 0.5)),
              })
            }
          }
          requestAnimationFrame(tick)
        })
      },
    }
  })

  const S = () => page.evaluate(() => window.__ab.state())
  async function settle(ms = 2500) {
    await page.evaluate(() => window.__three.invalidate())
    await sleep(ms)
  }
  async function measure(label) {
    await settle()
    const raf = await page.evaluate((w) => window.__ab.raf(w), winMs)
    const adv = await page.evaluate((n) => window.__ab.adv(n), advN)
    const gpu = await page.evaluate((n) => window.__ab.gpu(n), 30)
    const st = await S()
    const row = { label, raf, adv, gpu, state: st }
    console.log(
      `[r7ab] ${label.padEnd(28)} raf ${raf.rafHz}Hz render ${raf.renderHz}Hz int ${raf.intP50}/${raf.intP90} ` +
        `submit ${raf.submitP50}/${raf.submitP90} calls ${raf.callsPerFrame} | adv cpu ${adv.cpuP50} ` +
        `total ${adv.totalP50}/${adv.totalP90} thru ${adv.thru}` +
        (gpu ? ` | gpu ${gpu.p50}/${gpu.p90}` : '') +
        ` | pl ${st.visiblePointLights}/${st.pointLights} buf ${st.buffer} pr ${st.pixelRatio} dev ${st.device}`,
    )
    return row
  }
  async function setOverride(key, value) {
    await page.evaluate((k, v) => window.__store.getState().setQualityOverride(k, v), key, value)
    await page.waitForFunction(() => !window.__store.getState().loading?.active, {
      timeout: 60000,
    })
    await sleep(1500)
    // first frame after the change (programs for the new composer / pass set)
    return page.evaluate(() => window.__ab.firstFrame())
  }

  result.hasTimer = await page.evaluate(() => window.__ab.hasTimer)
  result.boot = await S()
  console.log('[r7ab] boot state', JSON.stringify(result.boot))

  if (mode === 'explore') {
    result.plan = await page.evaluate(() => {
      const st = window.__store.getState()
      const fp = st.floorPlan
      return {
        rooms: (fp?.rooms ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          origin: r.origin,
          width: r.width,
          depth: r.depth,
        })),
        keys: Object.keys(fp ?? {}),
        roomKeys: Object.keys(fp?.rooms?.[0] ?? {}),
      }
    })
    result.lights = await page.evaluate(() => window.__ab.lightList())
    for (const name of poseNames) {
      await page.evaluate((p) => window.__ab.pose(p), POSES[name])
      await sleep(1500)
      await page.screenshot({ path: `/tmp/r7ab/pose-${armName}-${name}.png` })
      result.poses[name] = { state: await S() }
    }
  }

  // `--flag a,b` flips several flags together (the whole Stage 2 against the pre-Stage-2 build).
  const setFlag = async (k, v) => {
    await page.evaluate(
      (kk, vv) => {
        for (const f of kk.split(',')) window.__store.getState().setFeatureFlag(f, vv)
      },
      k,
      v,
    )
    await sleep(600)
  }

  if (mode === 'toggle') {
    // One boot, lights OFF at boot (`--lights-boot off`), at the first pose. Flag OFF first, so the
    // legacy arm meets its light counts for the first time in this boot (the cold z16 case).
    await page.evaluate((p) => window.__ab.pose(p), POSES[poseNames[0]])
    await sleep(2500)
    result.toggle = []
    for (const v of [false, true, false, true]) {
      await setFlag(abFlag, v)
      await settle(3000)
      for (const lm of ['on', 'off', 'on', 'off']) {
        const r = await page.evaluate((m) => window.__ab.stall(m), lm)
        r.flag = v
        const st = await S()
        r.pointLights = st.pointLights
        console.log(`[r7ab] toggle ${abFlag}=${v} ${JSON.stringify(r)}`)
        result.toggle.push(r)
      }
    }
  }

  if (mode === 'walk' || argOf('--doors', 'shipped') === 'open') {
    // Every door open, so the path can pass through them and the pool sees the most rooms.
    await page.evaluate(() => {
      const st = window.__store.getState()
      for (const id of [
        'door-mainBedroom',
        'door-bedroom2',
        'door-bedroom3',
        'door-bath1',
        'door-bath2',
        'door-householdShelter',
      ])
        st.setDoorOpen(id, true)
    })
    const path = JSON.parse(
      argOf(
        '--path',
        '[[11,6.5],[9.6,4.3],[4.0,4.3],[3.48,4.33],[2.2,3.2],[3.3,4.2],[5.39,4.3],[5.39,3.3],[4.8,1.6]]',
      ),
    )
    result.walk = {}
    for (const v of [false, true, false, true]) {
      await setFlag(abFlag, v)
      await page.evaluate((p) => window.__ab.pose({ xz: p, yaw: 0 }), path[0])
      await settle(3000)
      const rows = await page.evaluate((pp) => window.__ab.walk(pp, 1.4), path)
      const steps = rows
        .slice(1)
        .map((r, i) => Math.abs(r.y - rows[i].y) / Math.max(rows[i].y, 1e-4))
      const sorted = [...steps].sort((a, b) => a - b)
      const summary = {
        frames: rows.length,
        maxStepPct: Math.round(sorted[sorted.length - 1] * 10000) / 100,
        p99StepPct: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 10000) / 100,
        at: rows[steps.indexOf(sorted[sorted.length - 1]) + 1],
      }
      console.log(`[r7ab] walk ${abFlag}=${v} ${JSON.stringify(summary)}`)
      const key = `${v ? 'on' : 'off'}${result.walk[v ? 'on' : 'off'] ? '2' : ''}`
      result.walk[key] = { summary, rows }
    }
    // Geometry (a door jamb filling the view) moves both arms alike; a pool pop moves only the
    // flag-on arm. So the pop metric is the frame-to-frame change of on/off, frame by frame.
    for (const k of ['on', 'on2', 'off2']) {
      const a = result.walk.off.rows
      const b = result.walk[k].rows
      const ratio = b.map((r, i) => r.y / Math.max(a[i].y, 1e-4))
      let worst = { d: 0, i: 0 }
      for (let i = 1; i < ratio.length; i++) {
        const d = Math.abs(ratio[i] - ratio[i - 1])
        if (d > worst.d) worst = { d, i }
      }
      let lo = { r: Number.POSITIVE_INFINITY, i: 0 }
      for (let i = 0; i < ratio.length; i++) if (ratio[i] < lo.r) lo = { r: ratio[i], i }
      result.walk[k].vsOff = {
        maxFrameStepOfRatio: Math.round(worst.d * 1000) / 1000,
        at: b[worst.i],
        minRatio: Math.round(lo.r * 1000) / 1000,
        minAt: b[lo.i],
      }
      console.log(`[r7ab] walk ${k} vs off ${JSON.stringify(result.walk[k].vsOff)}`)
    }
  }

  for (const name of mode === 'explore' || mode === 'toggle' || mode === 'walk' ? [] : poseNames) {
    const pose = POSES[name]
    await page.evaluate((p) => window.__ab.pose(p), pose)
    await sleep(2000)
    await page.screenshot({ path: `/tmp/r7ab/pose-${armName}-${mode}-${name}.png` })
    const rows = []
    const P = { pose, rows, lights: await page.evaluate(() => window.__ab.lightList()) }
    result.poses[name] = P
    if (mode === 'ladder') {
      // Descend then re-ascend: the return leg is the drift control (same boot, same pose).
      const seq = [...ladder, ...ladder.slice(0, -1).reverse()]
      for (const k of seq) {
        const compile = await page.evaluate((kk) => window.__ab.setActive(kk), k)
        const row = await measure(`${name} lights=${k}`)
        row.k = k
        row.compile = compile
        console.log(`[r7ab]    compile ${JSON.stringify(compile)}`)
        rows.push(row)
      }
      await page.evaluate(() => window.__ab.setActive(99))
    } else if (mode === 'pool') {
      // Constant count (19 visible), K at full intensity, the rest at 0: does intensity-0 cost?
      for (const k of [19, 8, 0]) {
        const compile = await page.evaluate((kk) => window.__ab.setPool(kk), k)
        const row = await measure(`${name} pool19 live=${k}`)
        row.k = k
        row.compile = compile
        rows.push(row)
      }
      await page.evaluate(() => window.__ab.restoreIntensity())
      for (const k of [8, 0]) {
        const compile = await page.evaluate((kk) => window.__ab.setActive(kk), k)
        const row = await measure(`${name} visible=${k}`)
        row.k = k
        row.compile = compile
        rows.push(row)
      }
      await page.evaluate(() => window.__ab.setActive(99))
    } else if (mode === 'dpr') {
      // 2x2 (x ladder): the store's own DPR path (qualityOverrides.dprMax → Canvas `dpr` prop →
      // r3f setDpr), crossed with the light count. Backing-store size is read back per row.
      const dprs = argOf('--dprs', arm.dsf >= 2 ? '2,1.5,1,0.5' : '1,0.75,0.5')
        .split(',')
        .map(Number)
      const seq = [...dprs, ...dprs.slice(0, -1).reverse()]
      for (const d of seq) {
        const compileD = await setOverride('dprMax', d)
        for (const k of [19, 0]) {
          const compile = await page.evaluate((kk) => window.__ab.setActive(kk), k)
          const row = await measure(`${name} dpr=${d} lights=${k}`)
          row.dpr = d
          row.k = k
          row.compile = compile
          row.compileDpr = compileD
          rows.push(row)
        }
        await page.evaluate(() => window.__ab.setActive(99))
      }
    } else if (mode === 'flagab') {
      // One variable: the flag. Off → on → off → on; the second pair is the drift control.
      for (const v of [false, true, false, true]) {
        await setFlag(abFlag, v)
        const compile = await page.evaluate(() => window.__ab.firstFrame())
        const row = await measure(`${name} ${abFlag}=${v}`)
        row.flag = v
        row.compile = compile
        rows.push(row)
      }
    } else if (mode === 'visual') {
      // Flag off vs on, same boot, same pose, per (hour, lights) state; then off again as the
      // noise-floor control. Frames + heatmaps to /tmp/r7ae/visual/.
      const dir = path.join(path.dirname(out), 'visual')
      fs.mkdirSync(dir, { recursive: true })
      const states = argOf('--states', '13:off,13:on,21:on').split(',')
      P.visual = []
      for (const stSpec of states) {
        const [hh, lm] = stSpec.split(':')
        await page.evaluate(
          (h, l) => {
            const st = window.__store.getState()
            st.setManualHour(Number(h))
            st.setLightsMode(l)
          },
          hh,
          lm,
        )
        const tag = `${name}-${hh}-${lm}`
        const shots = {}
        for (const [key, v] of [
          ['off', false],
          ['on', true],
          ['off2', false],
        ]) {
          await setFlag(abFlag, v)
          await settle(3000)
          await page.evaluate((k) => window.__ab.capture(k), key)
          const file = path.join(dir, `${tag}-${key}.png`)
          await page.screenshot({ path: file })
          shots[key] = file
        }
        const cmp = await page.evaluate(() => window.__ab.compare('off', 'on'))
        const ctl = await page.evaluate(() => window.__ab.compare('off', 'off2'))
        const heat = path.join(dir, `${tag}-heat.png`)
        fs.writeFileSync(heat, Buffer.from(cmp.heatmap.split(',')[1], 'base64'))
        delete cmp.heatmap
        delete ctl.heatmap
        console.log(
          `[r7ab] visual ${tag} off→on ${JSON.stringify(cmp)} | control ${JSON.stringify(ctl)}`,
        )
        P.visual.push({ state: stSpec, cmp, control: ctl, shots, heat })
      }
    } else if (mode === 'aoopts') {
      // R7-AE part 2: N8AO transparency options against the stock redraw (`base`), same boot:
      // glazing `treatAsOpaque` set by hand, `transparencyAware = false`, and `shipped` (the
      // `aoGlazingOpaque` flag). Cost (`thru`) AND the AO left on/around the glass (frame diff vs
      // base). The unlit-stand-in option was a prototype, measured and removed (§10.4).
      // `--states 21:on:clear,13:on:clear,13:on:rain` (hour:lights:weather).
      const dir = path.join(path.dirname(out), 'aoopts')
      fs.mkdirSync(dir, { recursive: true })
      const states = argOf('--states', '21:on:clear').split(',')
      P.aoopts = []
      const arm = async (key) => {
        await page.evaluate((k) => {
          const st = window.__store.getState()
          const pass = window.__n8aoPass
          window.__three.scene.traverse((o) => {
            if (o.userData?.glazing) o.userData.treatAsOpaque = k === 'treatAsOpaque'
          })
          if (pass) pass.configuration.transparencyAware = k !== 'transparencyAwareOff'
          st.setFeatureFlag('aoGlazingOpaque', k === 'shipped')
        }, key)
        await sleep(800)
        await page.evaluate(() => window.__ab.firstFrame())
      }
      for (const stSpec of states) {
        const [hh, lm, wx] = stSpec.split(':')
        await page.evaluate(
          (h, l, w) => {
            const st = window.__store.getState()
            st.setManualHour(Number(h))
            st.setLightsMode(l)
            st.setWeather(w || 'clear')
          },
          hh,
          lm,
          wx,
        )
        const tag = `${name}-${hh}-${lm}-${wx || 'clear'}`
        const rowsOut = {}
        for (const key of ['base', 'treatAsOpaque', 'transparencyAwareOff', 'shipped', 'base2']) {
          await arm(key === 'base2' ? 'base' : key)
          const row = await measure(`${tag} ao=${key}`)
          await page.evaluate((k) => window.__ab.capture(k), key)
          await page.screenshot({ path: path.join(dir, `${tag}-${key}.png`) })
          rowsOut[key] = { thru: row.adv.thru, rafHz: row.raf.rafHz }
          rows.push({ ...row, ao: key, state: stSpec })
        }
        for (const key of ['treatAsOpaque', 'transparencyAwareOff', 'shipped', 'base2']) {
          const cmp = await page.evaluate((k) => window.__ab.compare('base', k), key)
          fs.writeFileSync(
            path.join(dir, `${tag}-${key}-heat.png`),
            Buffer.from(cmp.heatmap.split(',')[1], 'base64'),
          )
          delete cmp.heatmap
          rowsOut[key].vsBase = cmp
          console.log(`[r7ab] aoopts ${tag} ${key} vs base ${JSON.stringify(cmp)}`)
        }
        P.aoopts.push({ state: stSpec, arms: rowsOut })
      }
      await arm('base')
    } else if (mode === 'census') {
      // Every transparent mesh N8AO's `renderTransparency` would redraw, by material.
      P.transparent = await page.evaluate(() => {
        const rows = new Map()
        window.__three.scene.traverse((o) => {
          if (!o.isMesh || !o.material) return
          const ms = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of ms) {
            if (!m.transparent) continue
            const chain = []
            for (let p = o; p && chain.length < 4; p = p.parent) if (p.name) chain.push(p.name)
            const k = `${m.type}|${m.name}|dw=${m.depthWrite}|op=${m.opacity}|tr=${m.transmission ?? '-'}|${chain.join('<')}|opq=${!!o.userData.treatAsOpaque}`
            const r = rows.get(k) ?? { k, n: 0, visible: 0 }
            r.n += 1
            if (o.visible) r.visible += 1
            rows.set(k, r)
          }
        })
        return [...rows.values()].sort((a, b) => b.n - a.n)
      })
      for (const r of P.transparent) console.log(`[r7ab]    ${r.n} (${r.visible} vis) ${r.k}`)
    } else if (mode === 'passes') {
      const dump = async (label) => {
        await settle()
        const p = await page.evaluate(() => window.__ab.passes(9))
        const thru = (await page.evaluate((n) => window.__ab.adv(n), advN)).thru
        console.log(`[r7ab] ${label} calls ${p.calls} sum ${p.sum} thru ${thru}`)
        for (const x of p.passes)
          console.log(
            `[r7ab]    ${x.what.padEnd(28)} ${x.rt.padEnd(14)} ${x.ov ?? ''} ${x.ms} ${x.cam ?? ''} ${x.from ?? ''}`,
          )
        rows.push({ label, thru, ...p })
      }
      for (const k of [19, 0]) {
        await page.evaluate((kk) => window.__ab.setActive(kk), k)
        await dump(`${name} boot-composer lights=${k}`)
      }
      // --via postoff: remount through the minimal composer (postprocessing false → true), the
      // path after which the post A/B's closing `full` rows came back cheaper than its opening ones.
      if (argOf('--via', 'ao') === 'postoff') {
        await setOverride('postprocessing', false)
        await setOverride('postprocessing', true)
      } else {
        await setOverride('ao', false)
        await setOverride('ao', true)
      }
      for (const k of [19, 0]) {
        await page.evaluate((kk) => window.__ab.setActive(kk), k)
        await dump(`${name} remounted-composer lights=${k}`)
      }
      await page.evaluate(() => window.__ab.setActive(99))
    } else if (mode === 'post') {
      const arms = [
        ['full', { postprocessing: true, ao: true }],
        ['aoOff', { postprocessing: true, ao: false }],
        ['postOff', { postprocessing: false, ao: false }],
        ['aoOnly', { postprocessing: false, ao: true }],
        ['full', { postprocessing: true, ao: true }],
      ]
      for (const [lab, ov] of arms) {
        let compile = null
        for (const [k, v] of Object.entries(ov)) compile = await setOverride(k, v)
        for (const k of [19, 0]) {
          const c2 = await page.evaluate((kk) => window.__ab.setActive(kk), k)
          const row = await measure(`${name} post=${lab} lights=${k}`)
          row.post = lab
          row.k = k
          row.compile = compile
          row.compileLights = c2
          rows.push(row)
        }
        await page.evaluate(() => window.__ab.setActive(99))
        await assertSceneAlive(page, lab)
      }
    }
    await assertSceneAlive(page, name)
  }
  result.errors = errors.slice(0, 20)
  result.final = await S()
} finally {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(result, null, 2))
  console.log(`[r7ab] wrote ${out}`)
  await browser.close().catch(() => {})
  releaseLock()
}
