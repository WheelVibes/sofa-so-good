// INTERACTION-SWEEP — record short interaction clips with REAL input + CDP screencast.
//
//   node scripts/dev-probes/sweep/record.mjs \
//     --catalogue scripts/scenarios/sweep/orbit.json \
//     --arm desktop-metal \
//     --out /tmp/sweep/desktop-metal \
//     [--only clipA,clipB] [--limit N]
//
// Arms (see ARMS below): desktop-metal | phone-metal | desktop-swiftshader.
// Every clip drives the app through page.mouse / page.keyboard / touch CDP
// events — never by writing camera state — except the per-clip INITIAL pose,
// which is set through `window.__walkLook` / `__three.controls` so each clip
// starts from a known framing.
//
// Outputs per clip, under <out>/<clip>/ :
//   0000.png…      screencast frames (PNG, everyNthFrame 1)
//   clip.json      { arm, clip, frames:[{i,file,tMs}], samples:[…], console:[…], ops:[…] }
//   clip.webm      only when ffmpeg is on PATH
//
// Read docs/interaction-sweep.md before changing this.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

const args = process.argv.slice(2)
const argOf = (name, dflt = null) => {
  const i = args.indexOf(name)
  return i === -1 ? dflt : args[i + 1]
}

const catalogueFile = argOf('--catalogue')
const armName = argOf('--arm', 'desktop-metal')
const outRoot = argOf('--out', '/tmp/sweep/out')
const only = argOf('--only')
  ? argOf('--only')
      .split(',')
      .map((s) => s.trim())
  : null
const limit = Number(argOf('--limit', '0')) || 0
const url = process.env.SWEEP_URL || 'http://localhost:5200/'

if (!catalogueFile) {
  console.error('record.mjs: --catalogue <file.json> is required')
  process.exit(2)
}

const ARMS = {
  'desktop-metal': {
    gpu: true,
    width: 1200,
    height: 900,
    dsf: 1,
    touch: false,
    deviceClass: 'capable',
  },
  'phone-metal': { gpu: true, width: 390, height: 844, dsf: 3, touch: true, deviceClass: 'weak' },
  'desktop-swiftshader': {
    gpu: false,
    width: 1200,
    height: 900,
    dsf: 1,
    touch: false,
    deviceClass: 'capable',
  },
}
const arm = ARMS[armName]
if (!arm) {
  console.error(`record.mjs: unknown --arm ${armName} (have ${Object.keys(ARMS).join(', ')})`)
  process.exit(2)
}

const catalogue = JSON.parse(fs.readFileSync(path.resolve(catalogueFile), 'utf8'))
let clips = catalogue.clips.filter((c) => !c.arms || c.arms.includes(armName))
if (only) clips = clips.filter((c) => only.includes(c.name))
if (limit) clips = clips.slice(0, limit)
if (clips.length === 0) {
  console.error('record.mjs: no clips selected')
  process.exit(2)
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

// ── launch (mirrors scripts/shot.mjs' GPU flag logic) ─────────────────────────
const angleBackend =
  process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'gl-egl'
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    arm.gpu ? `--use-angle=${angleBackend}` : '--use-angle=swiftshader',
    ...(arm.gpu ? ['--enable-gpu'] : []),
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${arm.width},${arm.height}`,
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({
  width: arm.width,
  height: arm.height,
  deviceScaleFactor: arm.dsf,
  isMobile: arm.touch,
  hasTouch: arm.touch,
})
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
    localStorage.setItem('sofa.helpHint.dismissed', '1')
  } catch {
    /* ignore */
  }
})

const consoleLog = []
page.on('console', (m) => {
  const t = m.type()
  if (t === 'error' || t === 'warning') consoleLog.push({ t: Date.now(), type: t, text: m.text() })
})
page.on('pageerror', (e) => consoleLog.push({ t: Date.now(), type: 'pageerror', text: e.message }))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }).catch((err) => {
  if (!String(err).includes('Navigation timeout')) throw err
})
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate(() => {
  window.__store?.getState?.().dismissLocationPrompt?.()
})
await page.waitForFunction(() => !document.querySelector('#boot-loader'), { timeout: 120000 })
await page.waitForFunction(() => !!window.__three?.gl, { timeout: 60000 })

const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2')
  const d = c?.getExtension('WEBGL_debug_renderer_info')
  return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(`[sweep] arm=${armName} renderer=${renderer}`)

// Setup: realistic tier, PINNED device class (the adaptive ladder demotes to
// `weak` within seconds headless — playbook "adaptive ladder pinning" gotcha),
// `interactiveDegrade` deliberately left ON: seeing it act is the point.
await page.evaluate((deviceClass) => {
  const s = window.__store
  s.getState().setQualityTier('realistic')
  s.getState().setFeatureFlag?.('interactiveDegrade', true)
  s.getState().setDeviceClass(deviceClass)
  s.setState({ setDeviceClass: () => {} })
}, arm.deviceClass)

/**
 * Wait until the app is genuinely showing the SCENE — `sceneReady`, no
 * `loading` overlay (`setQualityTier` raises "Applying <tier> quality…",
 * `uiSlice.ts:565`), no `#boot-loader` — then let the quality controller's
 * warm-up settle. Without this the first ~40 frames of a clip are the splash on
 * a slow renderer (seen on SwiftShader, where boot is ~1 fps). Returns the ms
 * spent waiting so `clip.json` records it instead of burying it in frames.
 */
async function waitForSceneSettled(settleMs = 5000) {
  const t = Date.now()
  await page
    .waitForFunction(
      () => {
        const st = window.__store?.getState?.()
        if (!st?.sceneReady) return false
        if (st.loading?.active) return false
        return !document.querySelector('#boot-loader')
      },
      { timeout: 180000, polling: 200 },
    )
    .catch(() => {})
  await sleep(settleMs)
  return Date.now() - t
}

const bootWaitMs = await waitForSceneSettled()

// ── page-side rAF recorder ────────────────────────────────────────────────────
const RAF_HOOK = `(() => {
  window.__sweepRaf = { deltas: [], last: 0, on: true }
  const tick = (t) => {
    const r = window.__sweepRaf
    if (!r || !r.on) return
    // [rAF timestamp, delta ms, gl.info.render.frame] — the third column tells a
    // demand-loop cadence (counter flat across two rAFs) apart from a screencast
    // frame drop (counter advanced but no frame delivered).
    const gf = window.__three?.gl?.info?.render?.frame ?? -1
    if (r.last) r.deltas.push([Math.round(t), Math.round((t - r.last) * 100) / 100, gf])
    r.last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const SAMPLE = `(() => {
  const th = window.__three || {}
  const st = window.__store?.getState?.() || {}
  const gl = th.gl
  const cam = th.camera
  const ctl = th.controls
  const r = window.__sweepRaf
  const deltas = r ? r.deltas.splice(0, r.deltas.length) : []
  return {
    now: Math.round(performance.now()),
    dpr: gl ? gl.getPixelRatio() : null,
    frame: gl ? gl.info.render.frame : null,
    calls: gl ? gl.info.render.calls : null,
    tris: gl ? gl.info.render.triangles : null,
    programs: gl?.info?.programs ? gl.info.programs.length : null,
    cameraMode: st.cameraMode ?? null,
    tier: st.qualityTier ?? null,
    deviceClass: st.deviceClass ?? null,
    lights: st.lightsMode ?? null,
    hour: st.manualHour ?? null,
    pos: cam ? [ +cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3) ] : null,
    target: ctl?.target ? [ +ctl.target.x.toFixed(3), +ctl.target.y.toFixed(3), +ctl.target.z.toFixed(3) ] : null,
    yaw: window.__walkLook ? +window.__walkLook.getYaw().toFixed(4) : null,
    pitch: window.__walkLook ? +window.__walkLook.getPitch().toFixed(4) : null,
    raf: deltas,
  }
})()`

// ── input ops ─────────────────────────────────────────────────────────────────
const client = await page.createCDPSession()

async function touchPoints(points, type) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({
      x: p[0],
      y: p[1],
      id: i + 1,
      radiusX: 8,
      radiusY: 8,
      force: 1,
    })),
  })
}

// A `hold: true` drag leaves the button (or the finger) down so the NEXT op
// continues the SAME gesture — so the next drag must not press again.
let mouseIsDown = false
let touchIsDown = false

/** Every op's start/end, clip-relative — so a wheel tick can be located in the
 *  frame series rather than inferred from it. Reset per clip. */
let opLog = []
let opClockT0 = 0

async function runOp(op) {
  const entry = { op: op.op, start: Date.now() - opClockT0 }
  opLog.push(entry)
  try {
    return await runOpInner(op)
  } finally {
    entry.end = Date.now() - opClockT0
  }
}

async function runOpInner(op) {
  const st = op.steps ?? 18
  const gap = op.stepMs ?? 12
  switch (op.op) {
    case 'wait':
      await sleep(op.ms ?? 300)
      break
    case 'mouseMove':
      await page.mouse.move(op.at[0], op.at[1])
      break
    case 'drag': {
      const [x0, y0] = op.from
      const [x1, y1] = op.to
      await page.mouse.move(x0, y0)
      if (!mouseIsDown) {
        await page.mouse.down({ button: op.button || 'left' })
        mouseIsDown = true
      }
      for (let i = 1; i <= st; i++) {
        const k = op.ease === 'out' ? 1 - (1 - i / st) ** 3 : i / st
        await page.mouse.move(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
        await sleep(gap)
      }
      if (!op.hold) {
        await page.mouse.up({ button: op.button || 'left' })
        mouseIsDown = false
      }
      break
    }
    case 'mouseUp':
      if (mouseIsDown) {
        await page.mouse.up({ button: op.button || 'left' })
        mouseIsDown = false
      }
      break
    case 'click':
      await page.mouse.click(op.at[0], op.at[1])
      break
    case 'clickSelector': {
      const el = await page.$(op.selector)
      if (el) await el.click().catch(() => {})
      else console.log(`[sweep]   (clickSelector miss: ${op.selector})`)
      break
    }
    case 'wheel': {
      await page.mouse.move(op.at[0], op.at[1])
      for (let i = 0; i < (op.times ?? 1); i++) {
        await page.mouse.wheel({ deltaY: op.dy })
        await sleep(op.gapMs ?? 60)
      }
      break
    }
    case 'key': {
      await page.keyboard.down(op.key)
      await sleep(op.ms ?? 500)
      await page.keyboard.up(op.key)
      break
    }
    case 'keys': {
      for (const k of op.keys) await page.keyboard.down(k)
      await sleep(op.ms ?? 500)
      for (const k of op.keys) await page.keyboard.up(k)
      break
    }
    case 'press':
      await page.keyboard.press(op.key)
      break
    case 'tap':
      await touchPoints([op.at], 'touchStart')
      await sleep(op.ms ?? 60)
      await touchPoints([op.at], 'touchEnd')
      break
    case 'doubleTap':
      for (let n = 0; n < 2; n++) {
        await touchPoints([op.at], 'touchStart')
        await sleep(40)
        await touchPoints([op.at], 'touchEnd')
        await sleep(80)
      }
      break
    case 'touchDrag': {
      const [x0, y0] = op.from
      const [x1, y1] = op.to
      await touchPoints([[x0, y0]], touchIsDown ? 'touchMove' : 'touchStart')
      touchIsDown = true
      for (let i = 1; i <= st; i++) {
        const k = i / st
        await touchPoints([[x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]], 'touchMove')
        await sleep(gap)
      }
      if (!op.hold) {
        await touchPoints([[x1, y1]], 'touchEnd')
        touchIsDown = false
      }
      break
    }
    case 'pinch': {
      const [cx, cy] = op.center
      const pair = (d) => [
        [cx - d / 2, cy],
        [cx + d / 2, cy],
      ]
      await touchPoints(pair(op.from), 'touchStart')
      for (let i = 1; i <= st; i++) {
        const k = i / st
        await touchPoints(pair(op.from + (op.to - op.from) * k), 'touchMove')
        await sleep(gap)
      }
      await touchPoints(pair(op.to), 'touchEnd')
      break
    }
    case 'twoFingerRotate': {
      const [cx, cy] = op.center
      const r = op.radius ?? 90
      const at = (deg) => {
        const a = (deg * Math.PI) / 180
        return [
          [cx + r * Math.cos(a), cy + r * Math.sin(a)],
          [cx - r * Math.cos(a), cy - r * Math.sin(a)],
        ]
      }
      await touchPoints(at(op.fromDeg), 'touchStart')
      for (let i = 1; i <= st; i++) {
        const k = i / st
        await touchPoints(at(op.fromDeg + (op.toDeg - op.fromDeg) * k), 'touchMove')
        await sleep(gap)
      }
      await touchPoints(at(op.toDeg), 'touchEnd')
      break
    }
    case 'twoFingerDrag': {
      // Simultaneous joystick thumb + look drag (phone): two independent paths.
      const [a0, b0] = [op.a.from, op.b.from]
      const [a1, b1] = [op.a.to, op.b.to]
      const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
      await touchPoints([a0, b0], 'touchStart')
      for (let i = 1; i <= st; i++) {
        const k = i / st
        await touchPoints([lerp(a0, a1, k), lerp(b0, b1, k)], 'touchMove')
        await sleep(gap)
      }
      await touchPoints([a1, b1], 'touchEnd')
      break
    }
    case 'viewport':
      await page.setViewport({
        width: op.width,
        height: op.height,
        deviceScaleFactor: arm.dsf,
        isMobile: arm.touch,
        hasTouch: arm.touch,
      })
      break
    case 'store':
      await page.evaluate(
        (fn, a) => {
          window.__store.getState()[fn]?.(...a)
        },
        op.fn,
        op.args ?? [],
      )
      break
    case 'ramp': {
      const n = op.steps ?? 14
      for (let i = 0; i <= n; i++) {
        const v = op.from + ((op.to - op.from) * i) / n
        await page.evaluate(
          (fn, val) => {
            window.__store.getState()[fn]?.(val)
          },
          op.fn,
          v,
        )
        await sleep(op.stepMs ?? 150)
      }
      break
    }
    case 'eval':
      await page.evaluate(op.js)
      break
    case 'parallel':
      // Genuinely simultaneous streams — a key held WHILE the store changes, a
      // drag held WHILE the hour ramps, a joystick thumb WHILE a look drag.
      await Promise.all(op.ops.map((o) => runOp(o)))
      break
    case 'wheelTicks':
      // Same as `wheel` but each tick is timestamped in `opLog`.
      await page.mouse.move(op.at[0], op.at[1])
      for (let i = 0; i < (op.times ?? 1); i++) {
        await runOp({ op: 'wheel', at: op.at, dy: op.dy, times: 1, gapMs: op.gapMs ?? 60 })
      }
      break
    default:
      throw new Error(`unknown op ${op.op}`)
  }
}

// ── per-clip driver ───────────────────────────────────────────────────────────
async function applyPose(clip) {
  await page.evaluate((mode) => {
    const s = window.__store.getState()
    if (s.cameraMode !== mode) s.setCameraMode(mode)
  }, clip.mode)
  await new Promise((r) => setTimeout(r, 1200))
  if (clip.pose) {
    await page.evaluate(
      (mode, pose) => {
        if (mode === 'walk' && window.__walkLook) {
          if (pose.xz) window.__walkLook.setPosition(pose.xz[0], pose.xz[1])
          if (typeof pose.yaw === 'number') window.__walkLook.setYaw(pose.yaw)
          if (typeof pose.pitch === 'number') window.__walkLook.setPitch(pose.pitch)
        } else if (window.__three?.camera) {
          const th = window.__three
          if (pose.cam) th.camera.position.set(...pose.cam)
          if (pose.target && th.controls?.target) th.controls.target.set(...pose.target)
          th.controls?.update?.()
          th.invalidate?.()
        }
      },
      clip.mode,
      clip.pose,
    )
  }
  if (clip.setup) for (const op of clip.setup) await runOp(op)
  await new Promise((r) => setTimeout(r, 900))
}

fs.mkdirSync(outRoot, { recursive: true })
const summary = []

for (const clip of clips) {
  const dir = path.join(outRoot, clip.name)
  fs.mkdirSync(dir, { recursive: true })
  console.log(`[sweep] clip ${clip.name} (${clip.mode})`)

  mouseIsDown = false
  touchIsDown = false
  await applyPose(clip)
  const clipWaitMs = await waitForSceneSettled(clip.settleMs ?? 1200)
  opLog = []
  opClockT0 = Date.now()
  await page.evaluate(RAF_HOOK)

  const frames = []
  const consoleMark = consoleLog.length
  const onFrame = async (ev) => {
    const i = frames.length
    const file = `${String(i).padStart(4, '0')}.png`
    frames.push({ i, file, tMs: ev.metadata.timestamp * 1000 })
    fs.writeFileSync(path.join(dir, file), Buffer.from(ev.data, 'base64'))
    try {
      await client.send('Page.screencastFrameAck', { sessionId: ev.sessionId })
    } catch {
      /* screencast already stopped */
    }
  }
  client.on('Page.screencastFrame', onFrame)
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })

  const samples = []
  const t0 = Date.now()
  const sampler = setInterval(async () => {
    try {
      const s = await page.evaluate(SAMPLE)
      s.wall = Date.now() - t0
      samples.push(s)
    } catch {
      /* navigation/teardown */
    }
  }, 100)

  const started = Date.now()
  opLog = []
  opClockT0 = started
  try {
    for (const op of clip.ops) await runOp(op)
  } catch (err) {
    console.log(`[sweep]   op failed: ${err.message}`)
  }
  await sleep(clip.tailMs ?? 500)

  clearInterval(sampler)
  await client.send('Page.stopScreencast')
  client.off('Page.screencastFrame', onFrame)
  await page.evaluate(() => {
    if (window.__sweepRaf) window.__sweepRaf.on = false
  })

  const durationMs = Date.now() - started
  const t0Frame = frames.length ? frames[0].tMs : 0
  for (const f of frames) f.relMs = Math.round(f.tMs - t0Frame)

  const clipJson = {
    arm: armName,
    renderer,
    clip: clip.name,
    mode: clip.mode,
    note: clip.note ?? '',
    viewport: { width: arm.width, height: arm.height, dsf: arm.dsf, touch: arm.touch },
    durationMs,
    bootWaitMs,
    clipWaitMs,
    opLog,
    frameCount: frames.length,
    frames,
    samples,
    console: consoleLog.slice(consoleMark),
    ops: clip.ops,
  }
  fs.writeFileSync(path.join(dir, 'clip.json'), JSON.stringify(clipJson, null, 2))

  let webm = false
  if (hasFfmpeg && frames.length > 2) {
    const res = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '12',
        '-i',
        path.join(dir, '%04d.png'),
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '38',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8',
        '-pix_fmt',
        'yuv420p',
        path.join(dir, 'clip.webm'),
      ],
      { stdio: 'ignore' },
    )
    webm = res.status === 0
  }
  summary.push({
    clip: clip.name,
    frames: frames.length,
    durationMs,
    webm,
    consoleErrors: clipJson.console.length,
  })
  console.log(
    `[sweep]   ${frames.length} frames / ${durationMs} ms / console ${clipJson.console.length}${webm ? ' / webm' : ''}`,
  )
}

fs.writeFileSync(
  path.join(outRoot, 'run.json'),
  JSON.stringify({ arm: armName, renderer, url, hasFfmpeg, clips: summary }, null, 2),
)
console.log(`[sweep] done → ${outRoot}/run.json`)
if (!hasFfmpeg) console.log('[sweep] ffmpeg not on PATH — webm assembly skipped')
await browser.close()
