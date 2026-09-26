// R7-AF — dynamic render resolution, measured LIVE on a real GPU.
//
//   SSG_URL=http://localhost:5411/ node scripts/dev-probes/dynamic-resolution-live.mjs \
//     --arm dpr2 --poses living,kitchen,bedroom,corridor --out /tmp/r7af/dpr2.json
//
// Method (same pins as lights-gpu-ab.mjs, R7-AB): realistic/capable, every adaptive setter
// replaced by a no-op so the device-class ladder cannot move, clock manual 21:00, walk mode,
// 229 baked lightmaps settled. `interactiveDegrade` stays ON — dynamic resolution is a MODE of
// it — and each cell is run with `dynamicResolution` ON and then OFF (the control: the shipped
// legacy degrade) inside ONE boot, because a two-boot A/B of this app is not attributable.
//
// Per pose x lights on/off x arm:
//  - still:  pose, 1.5 s idle, read the pixel ratio AND the drawing-buffer size (the brief's
//            "confirm the backing store actually changed" — R7-AB's DPR A/B was void once).
//  - motion: begin a camera gesture through the app's OWN `cameraMotionSignal` module (dynamic
//            import of the same Vite URL = the same module instance), then drive a scripted
//            walk (translate + yaw sweep) every rAF for `--motion` ms. Per rAF tick: interval,
//            pixel ratio, buffer, rendered-frame delta. Reports the rAF Hz over the last 4 s,
//            the settled ratio (mode of the last 3 s), every ratio change, and `thru` (40 x
//            `__three.advance()` + one 1-px readPixels drain, / 40) at the settled ratio with
//            the gesture still held.
//  - rest:   release the gesture, wait, read the ratio + buffer again (must return to the top).
//
// R7-AG additions (Retina re-measure with the light pool + dynamic resolution combined):
//  --arms a,b,c[,a]   named flag sets instead of --flags on,off (see ARM_FLAGS). Every cell first
//                     turns `dynamicResolution` OFF, so each dyn-on arm starts from a fresh
//                     controller state (the effect re-runs), not the previous arm's learned level.
//  --off-hour 13      the lights-OFF cells run at this hour (default 21, R7-AF's setting).
//  restThru           `thru` at REST (native ratio) before the motion, per cell.
//  full-run stats     rAF median / p90 / p99 / max over the whole motion, not only the tail.
//  --mode visual      screenshots at rest + mid-motion per cell, and a CDP screencast of the
//                     motion (compositor frames = what the user would see, blank or flashed frames
//                     included) with per-frame luminance aligned to the ratio trace.
//  --mode doorway     every door open, a gesture-held walk corridor -> main bedroom -> bedroom 2 at
//                     1.4 m/s, screencast frames kept on disk for the contact sheet.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive, centerBox, frameStats, isBlank, waitForBakedGi } from './lib.mjs'

const argv = process.argv.slice(2)
const argOf = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : d
}
const armName = argOf('--arm', 'dpr2')
const out = argOf('--out', `/tmp/r7af/${armName}.json`)
const poseNames = argOf('--poses', 'living,kitchen,bedroom,corridor').split(',')
const lightsList = argOf('--lights', 'on,off').split(',')
const motionMs = Number(argOf('--motion', '9000'))
const flagArms = argOf('--arms', argOf('--flags', 'on,off')).split(',')
const mode = argOf('--mode', 'measure')
const onHour = Number(argOf('--on-hour', '21'))
const offHour = Number(argOf('--off-hour', '21'))
// Flag sets per arm. `on`/`off` are R7-AF's original arms (dynamic resolution only).
const ARM_FLAGS = {
  on: { dynamicResolution: true },
  off: { dynamicResolution: false },
  a: {
    dynamicResolution: true,
    dynamicResolutionSteady: true,
    roomScopedLights: true,
    aoGlazingOpaque: true,
  },
  // a0: arm (a) with R7-AG's steady judging OFF — the R7-AF controller as it shipped.
  a0: {
    dynamicResolution: true,
    dynamicResolutionSteady: false,
    roomScopedLights: true,
    aoGlazingOpaque: true,
  },
  b: { dynamicResolution: false, roomScopedLights: true, aoGlazingOpaque: true },
  c: { dynamicResolution: true, roomScopedLights: false, aoGlazingOpaque: false },
}
for (const f of flagArms) if (!ARM_FLAGS[f]) throw new Error(`unknown arm ${f}`)
// --shots <dir>: a screenshot at rest and one mid-motion per cell (visual check of a change).
const shotsDir = argOf('--shots', null)

const ARMS = {
  dpr2: { w: 1200, h: 900, dsf: 2 },
  dpr1: { w: 1200, h: 900, dsf: 1 },
}
const arm = ARMS[armName]
if (!arm) throw new Error(`unknown --arm ${armName}`)
const POSES = {
  living: { xz: [11, 7.0], yaw: 0.07 },
  kitchen: { xz: [9.3, 8.0], yaw: 1.5708 },
  bedroom: { xz: [1.9, 3.4], yaw: 0.25 },
  corridor: { xz: [8.8, 4.3], yaw: 1.5708 },
  // R7-AG: bedroom 2 (x=[3.38,6.14] z=[0.2,3.725]), looking north at its window. Kept north of
  // the panel at z~3.06-3.09 (a z=3.2 pose stood 0.12 m behind it and saw only its back).
  bedroom2: { xz: [4.7, 2.7], yaw: 0.25 },
}

// ── lock + browser budget (sofa-probe-hygiene: never match our own grep) ─────
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
  console.log(`[r7af] ${n} top-level Chrome instances, waiting for <=1`)
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
fs.mkdirSync(path.dirname(out), { recursive: true })
const result = { arm: armName, url: appUrl(), started: new Date().toISOString(), cells: [] }
try {
  const page = await browser.newPage()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport({ width: arm.w, height: arm.h, deviceScaleFactor: arm.dsf })
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
  console.log(`[r7af] arm=${armName} renderer=${result.renderer}`)

  await page.evaluate(() => {
    const s = window.__store
    const st = s.getState()
    st.setFeatureFlag('interactiveDegrade', true)
    st.setFeatureFlag('dynamicResolution', true)
    st.setQualityTier('realistic')
    st.setDeviceClass('capable')
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
    st.dismissCallout?.('walk-mode')
    st.setCameraMode('firstPerson')
    st.setTimeMode('manual')
    st.setManualHour(21)
    st.setLightsMode('on')
  })
  await page.waitForFunction(
    () => {
      const st = window.__store.getState()
      return st.sceneReady && !st.loading?.active && !!window.__walkLook
    },
    { timeout: 180000, polling: 250 },
  )
  result.bakedGi = await waitForBakedGi(page)
  await sleep(4000)
  await assertSceneAlive(page, 'boot')

  await page.evaluate(async () => {
    const th = window.__three
    const gl = th.gl
    const ctx = gl.getContext()
    const px = new Uint8Array(4)
    const drain = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    const r2 = (v) => Math.round(v * 100) / 100
    const q = (a, p) => {
      const s = [...a].sort((x, y) => x - y)
      return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : Number.NaN
    }
    const signal = await import('/src/scene/cameraMotionSignal.ts')
    const buf = () => `${ctx.drawingBufferWidth}x${ctx.drawingBufferHeight}`
    window.__af = {
      read() {
        const st = window.__store.getState()
        return {
          ratio: gl.getPixelRatio(),
          buffer: buf(),
          device: st.deviceClass,
          dprHalved: st.dprHalved,
          lights: st.lightsMode,
          flag: st.featureFlags?.dynamicResolution,
          dyn: window.__dynamicResolution?.() ?? null,
        }
      },
      pose(p) {
        window.__walkLook.setPosition(p.xz[0], p.xz[1])
        window.__walkLook.setYaw(p.yaw)
        window.__walkLook.setPitch(0)
        th.invalidate()
      },
      // Scripted walk: 0.6 m out and back along the view axis + a ±0.5 rad yaw sweep.
      motion(p, ms) {
        return new Promise((resolve) => {
          signal.beginCameraGesture()
          const t0 = performance.now()
          let last = t0
          let lastFrame = gl.info.render.frame
          const ticks = []
          const step = (now) => {
            const e = now - t0
            const ph = (e / 3000) * Math.PI * 2
            const d = 0.3 * Math.sin(ph)
            window.__walkLook.setPosition(
              p.xz[0] + d * Math.sin(p.yaw) * -1,
              p.xz[1] + d * Math.cos(p.yaw) * -1,
            )
            window.__walkLook.setYaw(p.yaw + 0.5 * Math.sin(ph * 0.5))
            th.invalidate()
            const f = gl.info.render.frame
            ticks.push({
              t: e,
              dt: now - last,
              ratio: gl.getPixelRatio(),
              buf: buf(),
              r: f - lastFrame,
            })
            lastFrame = f
            last = now
            if (e < ms) requestAnimationFrame(step)
            else resolve(ticks)
          }
          requestAnimationFrame(step)
        })
      },
      end() {
        signal.endCameraGesture()
      },
      thru(n) {
        for (let i = 0; i < 5; i++) th.advance(performance.now())
        drain()
        const tt = performance.now()
        for (let i = 0; i < n; i++) th.advance(performance.now())
        drain()
        return r2((performance.now() - tt) / n)
      },
      summarise(ticks, ms) {
        const tail4 = ticks.filter((k) => k.t > ms - 4000)
        const tail3 = ticks.filter((k) => k.t > ms - 3000)
        const span = tail4.length ? tail4[tail4.length - 1].t - tail4[0].t : 1
        const counts = {}
        for (const k of tail3) counts[k.ratio] = (counts[k.ratio] ?? 0) + 1
        const settled = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0])
        const changes = []
        for (let i = 1; i < ticks.length; i++)
          if (ticks[i].ratio !== ticks[i - 1].ratio)
            changes.push({
              t: Math.round(ticks[i].t),
              from: ticks[i - 1].ratio,
              to: ticks[i].ratio,
              // The resize + same-task repaint stall lands on the tick that observes it or the next.
              hitch: r2(Math.max(ticks[i].dt, ticks[i + 1]?.dt ?? 0)),
            })
        const dts = tail4.map((k) => k.dt)
        // R7-AG: the whole run, first 2 ticks dropped (the first measures across the idle gap).
        const all = ticks.slice(2)
        const allDts = all.map((k) => k.dt)
        const allSpan = all.length > 1 ? all[all.length - 1].t - all[0].t : 1
        const ratioShare = {}
        for (const k of all) ratioShare[k.ratio] = (ratioShare[k.ratio] ?? 0) + 1
        for (const k of Object.keys(ratioShare)) ratioShare[k] = r2(ratioShare[k] / all.length)
        return {
          all: {
            rafHz: r2((all.length - 1) / (allSpan / 1000)),
            p50: r2(q(allDts, 0.5)),
            p90: r2(q(allDts, 0.9)),
            p99: r2(q(allDts, 0.99)),
            over20: r2(allDts.filter((d) => d > 20).length / Math.max(1, allDts.length)),
            ratioShare,
          },
          intP99: r2(q(dts, 0.99)),
          rafHz: r2((tail4.length - 1) / (span / 1000)),
          renderHz: r2(tail4.reduce((a, k) => a + (k.r > 0 ? 1 : 0), 0) / (span / 1000)),
          intP50: r2(q(dts, 0.5)),
          intP90: r2(q(dts, 0.9)),
          settledRatio: settled,
          settledBuffer: tail3.find((k) => k.ratio === settled)?.buf,
          tailShare: r2((counts[settled] ?? 0) / Math.max(1, tail3.length)),
          changes,
          firstChangeMs: changes[0]?.t ?? null,
          maxDt: r2(Math.max(...ticks.map((k) => k.dt))),
        }
      },
    }
  })

  // Apply one arm: dynamic resolution OFF first (a fresh controller state for every dyn-on arm —
  // the controller's effect re-runs on the flag), then the arm's flags.
  // R7-AG: GPU contention guard. A Cycles render (Blender on the GPU) or a second agent browser
  // running alongside turns every number here into noise (measured: 170-240 ms rest frames and
  // 43-51 ms at DPR 1 while a 1024-sample Cycles render ran). Each cell waits for a quiet
  // machine first, and records what else was running when it finished.
  const others = () => {
    const comms = execSync('ps -axo comm', { encoding: 'utf8' }).split('\n')
    return {
      blender: comms.some((l) => /\/Blender$/.test(l)),
      chromes: comms.filter(
        (l) => /Chrome|Chromium|chrome-headless-shell/.test(l) && !/Helper|crashpad/i.test(l),
      ).length,
    }
  }
  const waitQuiet = async () => {
    for (let o = others(); o.blender || o.chromes > 2; o = others()) {
      console.log(`[r7ag] contention ${JSON.stringify(o)}, waiting`)
      await sleep(10000)
    }
  }
  const setArm = async (armKey) => {
    await waitQuiet()
    // Two separate evaluates with a pause between: toggled inside ONE task, React batches the
    // off->on into no change at all and the controller keeps its learned state (measured: the
    // R7-AG first run's dyn-on arms carried state from the previous dyn-on cell).
    await page.evaluate(() => window.__store.getState().setFeatureFlag('dynamicResolution', false))
    await sleep(300)
    await page.evaluate((flags) => {
      const st = window.__store.getState()
      for (const [k, v] of Object.entries(flags)) st.setFeatureFlag(k, v)
    }, ARM_FLAGS[armKey])
    await sleep(600)
  }
  const setLights = async (lights) => {
    await page.evaluate(
      (l, h) => {
        const st = window.__store.getState()
        st.setManualHour(h)
        st.setLightsMode(l)
      },
      lights,
      lights === 'on' ? onHour : offHour,
    )
    await sleep(3000)
  }
  // CDP screencast: compositor frames, i.e. what reaches the screen (a blank or flashed frame
  // included). Each frame carries a wall-clock timestamp to align with the ratio trace.
  const cdp = await page.createCDPSession()
  const startCast = async (keep) => {
    const frames = []
    const pending = []
    const onFrame = (f) => {
      const rec = { ts: f.metadata.timestamp * 1000, data: keep ? f.data : null, stats: null }
      frames.push(rec)
      pending.push(
        frameStats(Buffer.from(f.data, 'base64'), centerBox(arm.w, arm.h))
          .then((st) => {
            rec.stats = st
          })
          .catch(() => {}),
      )
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    }
    cdp.on('Page.screencastFrame', onFrame)
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 85,
      maxWidth: 1200,
      maxHeight: 900,
      everyNthFrame: 1,
    })
    return async () => {
      await cdp.send('Page.stopScreencast').catch(() => {})
      cdp.off('Page.screencastFrame', onFrame)
      await sleep(300)
      await Promise.all(pending)
      return frames
    }
  }
  // Flash / blank / pop detection over a screencast: a blank is a featureless frame (lib.isBlank);
  // a spike is a frame whose mean luminance departs from BOTH neighbours by > 12 counts in the
  // same direction (a real pan changes the mean smoothly; a flashed frame is a one-frame spike).
  const castVerdict = (frames) => {
    const fs2 = frames.filter((f) => f.stats)
    const blanks = fs2.filter((f) => isBlank(f.stats)).length
    const spikes = []
    for (let i = 1; i < fs2.length - 1; i++) {
      const a = fs2[i - 1].stats.mean
      const b = fs2[i].stats.mean
      const c = fs2[i + 1].stats.mean
      if ((b - a > 12 && b - c > 12) || (a - b > 12 && c - b > 12))
        spikes.push({ ts: Math.round(fs2[i].ts), mean: b, prev: a, next: c })
    }
    const means = fs2.map((f) => f.stats.mean)
    return {
      frames: fs2.length,
      blanks,
      spikes,
      meanMin: Math.min(...means),
      meanMax: Math.max(...means),
    }
  }

  if (mode === 'steps') {
    // Investigation mode: `--steps file.json`, an array of { eval?, wait?, shot?, read? } run in
    // order after the pins. `eval` is a function body string, awaited in the page; its return
    // value is logged. `shot` names a PNG in --shots.
    const dir = shotsDir ?? '/tmp/r7ag/steps'
    fs.mkdirSync(dir, { recursive: true })
    const steps = JSON.parse(fs.readFileSync(argOf('--steps'), 'utf8'))
    for (const st of steps) {
      if (st.eval) {
        const v = await page.evaluate(`(async () => { ${st.eval} })()`)
        console.log(`[r7ag] eval ${st.eval.slice(0, 60)} -> ${JSON.stringify(v)}`)
        result.cells.push({ eval: st.eval, v })
      }
      if (st.wait) await sleep(st.wait)
      if (st.shot) {
        await page.screenshot({
          path: path.join(dir, `${st.shot}.png`),
          captureBeyondViewport: false,
        })
        const r = await page.evaluate(() => window.__af.read())
        console.log(`[r7ag] shot ${st.shot} ${r.ratio} ${r.buffer}`)
      }
    }
  } else if (mode === 'visual') {
    const dir = shotsDir ?? '/tmp/r7ag/shots'
    fs.mkdirSync(dir, { recursive: true })
    for (const lights of lightsList) {
      await setLights(lights)
      for (const name of poseNames) {
        const p = POSES[name]
        for (const flag of flagArms) {
          await setArm(flag)
          await page.evaluate((pp) => window.__af.pose(pp), p)
          await sleep(1500)
          // warm-up (compile + learned level), discarded
          await page.evaluate((pp) => window.__af.motion(pp, 2500), p)
          await page.evaluate(() => window.__af.end())
          await sleep(1500)
          await page.evaluate((pp) => window.__af.pose(pp), p)
          await sleep(1200)
          const restRead = await page.evaluate(() => window.__af.read())
          const tag = `${name}-${lights}-${flag}`
          await page.screenshot({
            path: path.join(dir, `${tag}-rest.png`),
            captureBeyondViewport: false,
          })
          const stop = await startCast(false)
          const motionP = page.evaluate(
            (pp, ms) =>
              window.__af.motion(pp, ms).then((t) => ({ t, wall0: Date.now() - t.at(-1).t })),
            p,
            motionMs,
          )
          await sleep(Math.min(motionMs - 800, 6000))
          const midRead = await page.evaluate(() => window.__af.read())
          await page.screenshot({
            path: path.join(dir, `${tag}-motion.png`),
            captureBeyondViewport: false,
          })
          const { t: ticks, wall0 } = await motionP
          await page.evaluate(() => window.__af.end())
          await sleep(1500)
          const frames = await stop()
          const changes = []
          for (let i = 1; i < ticks.length; i++)
            if (ticks[i].ratio !== ticks[i - 1].ratio)
              changes.push({ wall: Math.round(wall0 + ticks[i].t), to: ticks[i].ratio })
          const verdict = castVerdict(frames)
          // Frames within ±100 ms of each ratio change: their luminance, for the pop check.
          const around = changes.map((c) => ({
            ...c,
            means: frames
              .filter((f) => f.stats && Math.abs(f.ts - c.wall) < 100)
              .map((f) => f.stats.mean),
          }))
          const cell = { pose: name, lights, flag, restRead, midRead, verdict, changes, around }
          result.cells.push(cell)
          console.log(
            `[r7ag] visual ${tag} rest ${restRead.ratio} ${restRead.buffer} | mid ${midRead.ratio} ` +
              `${midRead.buffer} | cast ${verdict.frames} frames, ${verdict.blanks} blank, ` +
              `${verdict.spikes.length} spikes, ratio changes ${changes.length}`,
          )
        }
      }
    }
  } else if (mode === 'doorway') {
    // Every door open (the over-subscribed corridor case R7-AE documented), a gesture-held walk
    // at 1.4 m/s facing the direction of travel. Screencast frames kept for a contact sheet.
    const dir = shotsDir ?? '/tmp/r7ag/doorway'
    fs.mkdirSync(dir, { recursive: true })
    if (argOf('--doors', 'open') === 'open')
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
    const walkPath = JSON.parse(
      argOf(
        '--path',
        '[[9.6,4.3],[4.0,4.3],[3.48,4.33],[2.2,3.2],[3.3,4.2],[5.39,4.3],[5.39,3.3],[4.8,1.6]]',
      ),
    )
    await page.evaluate(() => {
      window.__af.walk = async (pts, speed) => {
        const signal = await import('/src/scene/cameraMotionSignal.ts')
        const gl = window.__three.gl
        const segs = []
        let total = 0
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0]
          const dz = pts[i][1] - pts[i - 1][1]
          const len = Math.hypot(dx, dz)
          segs.push({ a: pts[i - 1], dx, dz, len, s0: total })
          total += len
        }
        return new Promise((resolve) => {
          signal.beginCameraGesture()
          const t0 = performance.now()
          const w0 = Date.now()
          const ticks = []
          let yawNow = null
          const step = (now) => {
            const s = ((now - t0) / 1000) * speed
            const seg = segs.find((g) => s <= g.s0 + g.len) ?? segs[segs.length - 1]
            const u = Math.min(1, (s - seg.s0) / seg.len)
            window.__walkLook.setPosition(seg.a[0] + seg.dx * u, seg.a[1] + seg.dz * u)
            // yaw 0 looks toward -z; forward = (-sin yaw, -cos yaw). Ease toward the heading.
            const want = Math.atan2(-seg.dx, -seg.dz)
            if (yawNow === null) yawNow = want
            let d = want - yawNow
            while (d > Math.PI) d -= 2 * Math.PI
            while (d < -Math.PI) d += 2 * Math.PI
            yawNow += d * 0.12
            window.__walkLook.setYaw(yawNow)
            window.__walkLook.setPitch(0)
            window.__three.invalidate()
            ticks.push({
              wall: w0 + (now - t0),
              s: Math.round(s * 100) / 100,
              ratio: gl.getPixelRatio(),
            })
            if (s < total) requestAnimationFrame(step)
            else {
              signal.endCameraGesture()
              resolve({ ticks, total })
            }
          }
          requestAnimationFrame(step)
        })
      }
    })
    for (const lights of lightsList) {
      await setLights(lights)
      for (const flag of flagArms) {
        await setArm(flag)
        await page.evaluate((pp) => window.__af.pose({ xz: pp, yaw: 1.5708 }), walkPath[0])
        await sleep(2500)
        // warm-up pass (compile), discarded
        await page.evaluate((pts) => window.__af.walk(pts, 3), walkPath)
        await page.evaluate((pp) => window.__af.pose({ xz: pp, yaw: 1.5708 }), walkPath[0])
        await sleep(2500)
        const stop = await startCast(true)
        const w = await page.evaluate((pts) => window.__af.walk(pts, 1.4), walkPath)
        await sleep(600)
        const frames = await stop()
        const tag = `walk-${lights}-${flag}`
        const sub = path.join(dir, tag)
        fs.mkdirSync(sub, { recursive: true })
        const kept = []
        for (const [i, f] of frames.entries()) {
          const tick = w.ticks.reduce(
            (best, k) => (Math.abs(k.wall - f.ts) < Math.abs(best.wall - f.ts) ? k : best),
            w.ticks[0],
          )
          const file = path.join(sub, `${String(i).padStart(4, '0')}.jpg`)
          fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
          kept.push({
            i,
            file,
            ts: Math.round(f.ts),
            s: tick.s,
            ratio: tick.ratio,
            mean: f.stats?.mean,
          })
        }
        const verdict = castVerdict(frames)
        const changes = []
        for (let i = 1; i < w.ticks.length; i++)
          if (w.ticks[i].ratio !== w.ticks[i - 1].ratio)
            changes.push({ s: w.ticks[i].s, to: w.ticks[i].ratio })
        const dts = w.ticks.slice(2).map((k, i) => k.wall - w.ticks[i + 1].wall)
        const sd = [...dts].sort((a, b) => a - b)
        const cell = {
          lights,
          flag,
          total: w.total,
          frames: kept,
          verdict,
          changes,
          rafP50: sd[Math.floor(sd.length * 0.5)],
          rafP90: sd[Math.floor(sd.length * 0.9)],
          rafP99: sd[Math.floor(sd.length * 0.99)],
        }
        result.cells.push(cell)
        console.log(
          `[r7ag] ${tag} ${kept.length} frames, ${verdict.blanks} blank, ${verdict.spikes.length} ` +
            `spikes, ratio changes ${changes.length}, rAF p50/p90/p99 ${cell.rafP50?.toFixed(1)}/` +
            `${cell.rafP90?.toFixed(1)}/${cell.rafP99?.toFixed(1)}`,
        )
      }
    }
  } else
    for (const lights of lightsList) {
      await setLights(lights)
      for (const name of poseNames) {
        const p = POSES[name]
        // A cell that saw contention (Blender or another browser at ANY point) is recorded as
        // `contended` and re-run in the same boot, up to 4 more times.
        for (const flag of flagArms)
          for (let attempt = 0; attempt < 5; attempt++) {
            await setArm(flag)
            let contended = false
            const poll = setInterval(() => {
              const o = others()
              if (o.blender || o.chromes > 2) contended = true
            }, 1000)
            await page.evaluate((pp) => window.__af.pose(pp), p)
            await sleep(1500)
            const still = await page.evaluate(() => window.__af.read())
            // R7-AG: the at-rest frame cost at the native ratio, before any motion.
            const restThru = await page.evaluate(() => window.__af.thru(40))
            const restCheck = await page.evaluate(() => window.__af.read())
            // Warm-up motion (first visit to a pose compiles / streams), discarded but summarised.
            const warmTicks = await page.evaluate((pp) => window.__af.motion(pp, 2500), p)
            const warm = {
              endRatio: warmTicks.at(-1).ratio,
              changes: warmTicks.filter((k, i) => i > 0 && k.ratio !== warmTicks[i - 1].ratio)
                .length,
            }
            await page.evaluate(() => window.__af.end())
            await sleep(1500)
            const motionP = page.evaluate((pp, ms) => window.__af.motion(pp, ms), p, motionMs)
            if (shotsDir) {
              fs.mkdirSync(shotsDir, { recursive: true })
              await sleep(Math.min(motionMs - 500, 5000))
              await page.screenshot({
                path: path.join(shotsDir, `${name}-${lights}-${flag}-motion.png`),
              })
            }
            const ticks = await motionP
            const sum = await page.evaluate(
              (t, ms) => window.__af.summarise(t, ms),
              ticks,
              motionMs,
            )
            const during = await page.evaluate(() => window.__af.read())
            const thru = await page.evaluate(() => window.__af.thru(40))
            await page.evaluate(() => window.__af.end())
            await sleep(1200)
            const rest = await page.evaluate(() => window.__af.read())
            if (shotsDir)
              await page.screenshot({
                path: path.join(shotsDir, `${name}-${lights}-${flag}-rest.png`),
              })
            const cell = {
              pose: name,
              lights,
              flag,
              flags: ARM_FLAGS[flag],
              still,
              restThru,
              restCheck,
              warm,
              motion: sum,
              during,
              thru,
              rest,
              contention: others(),
              attempt,
              // --ticks: keep the raw per-rAF trace (interval, ratio) for offline analysis.
              ticks: argv.includes('--ticks')
                ? ticks.map((k) => [Math.round(k.t), Math.round(k.dt * 10) / 10, k.ratio])
                : undefined,
            }
            clearInterval(poll)
            if (cell.contention.blender || cell.contention.chromes > 2) contended = true
            cell.contended = contended
            result.cells.push(cell)
            console.log(
              `[r7ag] ${armName} ${name.padEnd(8)} lights ${lights.padEnd(3)} arm ${flag.padEnd(3)} | ` +
                `rest ${restCheck.ratio} ${restCheck.buffer} restThru ${restThru} | warm ->${warm.endRatio} ` +
                `(${warm.changes}ch) | settled ${sum.settledRatio} ${sum.settledBuffer} ` +
                `(${Math.round(sum.tailShare * 100)}%) tail ${sum.rafHz}Hz ${sum.intP50}/${sum.intP90}/` +
                `${sum.intP99} | all ${sum.all.rafHz}Hz p50/90/99 ${sum.all.p50}/${sum.all.p90}/` +
                `${sum.all.p99} >20ms ${sum.all.over20} share ${JSON.stringify(sum.all.ratioShare)} ` +
                `changes ${sum.changes.length} maxDt ${sum.maxDt} thru ${thru} | back ${rest.ratio} ${rest.buffer} | ${JSON.stringify(cell.contention)}${contended ? ' CONTENDED, retrying' : ''}`,
            )
            if (!contended) break
          }
      }
    }
  result.errors = errors
  fs.writeFileSync(out, JSON.stringify(result, null, 2))
  console.log(`[r7af] wrote ${out}`)
} finally {
  await browser.close().catch(() => {})
  releaseLock()
}
