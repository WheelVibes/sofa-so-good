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
const armName = argOf('--arm', 'dpr2')
const out = argOf('--out', `/tmp/r7af/${armName}.json`)
const poseNames = argOf('--poses', 'living,kitchen,bedroom,corridor').split(',')
const lightsList = argOf('--lights', 'on,off').split(',')
const motionMs = Number(argOf('--motion', '9000'))
const flagArms = argOf('--flags', 'on,off').split(',')
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
        return {
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

  for (const lights of lightsList) {
    await page.evaluate((l) => window.__store.getState().setLightsMode(l), lights)
    await sleep(3000)
    for (const name of poseNames) {
      const p = POSES[name]
      for (const flag of flagArms) {
        await page.evaluate(
          (on) => window.__store.getState().setFeatureFlag('dynamicResolution', on === 'on'),
          flag,
        )
        await page.evaluate((pp) => window.__af.pose(pp), p)
        await sleep(1500)
        const still = await page.evaluate(() => window.__af.read())
        // Warm-up motion (first visit to a pose compiles / streams), discarded.
        await page.evaluate((pp) => window.__af.motion(pp, 2500), p)
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
        const sum = await page.evaluate((t, ms) => window.__af.summarise(t, ms), ticks, motionMs)
        const during = await page.evaluate(() => window.__af.read())
        const thru = await page.evaluate(() => window.__af.thru(40))
        await page.evaluate(() => window.__af.end())
        await sleep(1200)
        const rest = await page.evaluate(() => window.__af.read())
        if (shotsDir)
          await page.screenshot({ path: path.join(shotsDir, `${name}-${lights}-${flag}-rest.png`) })
        const cell = { pose: name, lights, flag, still, motion: sum, during, thru, rest }
        result.cells.push(cell)
        console.log(
          `[r7af] ${armName} ${name.padEnd(8)} lights ${lights.padEnd(3)} dyn ${flag.padEnd(3)} | ` +
            `still ${still.ratio} ${still.buffer} | motion settled ${sum.settledRatio} ` +
            `${sum.settledBuffer} (${Math.round(sum.tailShare * 100)}%) rAF ${sum.rafHz}Hz ` +
            `int ${sum.intP50}/${sum.intP90} changes ${sum.changes.length} first@${sum.firstChangeMs} ` +
            `maxDt ${sum.maxDt} thru ${thru} | rest ${rest.ratio} ${rest.buffer}`,
        )
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
