// R7-AB — Stage 1 of docs/research/lights-gpu-bound-2026-09-25.md: the three in-session A/Bs.
//
//   SSG_URL=http://localhost:5371/ node scripts/dev-probes/lights-gpu-ab.mjs \
//     --arm desktop --mode ladder --poses living,kitchen --out /tmp/r7ab/desktop-ladder.json
//
// Modes: explore | ladder | dpr | post | pool.  ONE boot per invocation; every arm of an A/B is
// flipped in place inside that boot (a two-boot A/B of this app is not attributable).
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
    (tier, device) => {
      const s = window.__store
      const st = s.getState()
      st.setFeatureFlag('interactiveDegrade', false)
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
      st.setLightsMode('on')
    },
    arm.tier,
    arm.device,
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

  for (const name of mode === 'explore' ? [] : poseNames) {
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
