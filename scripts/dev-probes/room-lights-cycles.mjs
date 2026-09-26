// R7-AH — is the room-scoped light pool's darkening physically correct? App half of the
// Cycles comparison in docs/research/room-scoped-lights-cycles-2026-09-26.md.
//
//   SSG_URL=http://localhost:5431/ node scripts/dev-probes/room-lights-cycles.mjs --out /tmp/r7ah/app
//
// ONE boot. Per pose, four captures of the real pipeline's drawing buffer, with ONE thing changed
// between them: `pool` (roomScopedLights on), `legacy` (off), `pool2` (on again: the noise-floor
// control) and `dark` (lights switch off). `ssg_linear_view` is set before the first frame, so the
// frame inverts exactly: linear = srgb_to_linear(byte) / toneMappingExposure (linearView.ts).
// `ceilingExposure`, `windowBlowoutAdaptive` and `interactiveDegrade` are pinned off before any
// capture; both exposure flags ease over time and have produced false "leak" readings.
//
// Then, still in the same boot and in WALK mode (an orbit export drops faded walls), the flag is
// turned off so all fixture lights are ordinary scene lights, and the scene is exported with the
// app's own buildExportRoot + exportGlb. The manifest records every fixture light (world
// position, three intensity in candela, colour, distance, decay), which of them the pool carried
// at each pose (matched by position from the live slots), the camera matrix / fov / aspect of each
// pose, and the exposure of every capture.
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
const OUT = argOf('--out', '/tmp/r7ah/app')
const W = Number(argOf('--w', '1200'))
const H = Number(argOf('--h', '900'))
const NO_GLB = argv.includes('--no-glb')
// R7-AE's `--mode visual` poses (lights-gpu-ab.mjs POSES + its bedroom2 --pose-json), pitch 0.
const POSES = {
  bedroom2: { xz: [4.9, 3.4], yaw: 0.2 },
  corridor: { xz: [8.8, 4.3], yaw: 1.5708 },
  kitchen: { xz: [9.3, 8.0], yaw: 1.5708 },
  living: { xz: [11, 7.0], yaw: 0.07 },
  bedroom: { xz: [1.9, 3.4], yaw: 0.25 },
}
const poseNames = argOf('--poses', Object.keys(POSES).join(',')).split(',')
fs.mkdirSync(OUT, { recursive: true })

// ── lock + browser budget (same rules as lights-gpu-ab.mjs) ─────────────────────
const LOCK = path.join(os.tmpdir(), 'sofa-shot-harness.lock')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pidAlive = (pid) => {
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
      await sleep(1000)
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
    .filter((l) => /(Google Chrome|Google Chrome for Testing|chrome-headless-shell)$/.test(l))
    .length
await acquireLock()
for (;;) {
  const n = topLevelChromes()
  if (n <= 1) break
  console.log(`[r7ah] ${n} top-level Chrome instances, waiting for <=1`)
  await sleep(5000)
}

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 600_000,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${W},${H}`,
  ],
})
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, async () => {
    await browser.close().catch(() => {})
    releaseLock()
    process.exit(1)
  })
}
const manifest = { url: appUrl(), started: new Date().toISOString(), w: W, h: H, poses: {} }
try {
  const page = await browser.newPage()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hdb_onboarded', '1')
    localStorage.setItem('sofa.helpHint.dismissed', '1')
    localStorage.setItem('ssg_linear_view', '1')
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => {})
  await page.waitForFunction(() => !!window.__store, { timeout: 120000 })
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await page.waitForFunction(() => !document.querySelector('#boot-loader'), { timeout: 180000 })
  await page.waitForFunction(() => !!window.__three?.gl, { timeout: 120000 })
  manifest.renderer = await page.evaluate(() => {
    const g = window.__three.gl.getContext()
    const d = g.getExtension('WEBGL_debug_renderer_info')
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  await page.evaluate(() => {
    const s = window.__store
    const st = s.getState()
    for (const f of ['interactiveDegrade', 'ceilingExposure', 'windowBlowoutAdaptive'])
      st.setFeatureFlag(f, false)
    st.setFeatureFlag('roomScopedLights', true)
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
    st.dismissCallout?.('walk-mode')
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
  manifest.bakedGi = await waitForBakedGi(page)
  await sleep(4000)
  await assertSceneAlive(page, 'boot')

  await page.evaluate(() => {
    const th = window.__three
    const gl = th.gl
    const ctx = gl.getContext()
    const lights = () => {
      const a = []
      th.scene.traverse((o) => {
        if (o.isPointLight || o.isSpotLight) a.push(o)
      })
      return a
    }
    const V3 = th.camera.position.constructor
    window.__ah = {
      state() {
        const st = window.__store.getState()
        const f = st.featureFlags ?? {}
        return {
          tier: st.qualityTier,
          hour: st.manualHour,
          lights: st.lightsMode,
          cameraMode: st.cameraMode,
          exposure: gl.toneMappingExposure,
          toneMapping: gl.toneMapping,
          pixelRatio: gl.getPixelRatio(),
          buffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
          flags: {
            roomScopedLights: f.roomScopedLights,
            ceilingExposure: f.ceilingExposure,
            windowBlowoutAdaptive: f.windowBlowoutAdaptive,
            interactiveDegrade: f.interactiveDegrade,
          },
        }
      },
      pose(p) {
        window.__walkLook.setPosition(p.xz[0], p.xz[1])
        window.__walkLook.setYaw(p.yaw)
        window.__walkLook.setPitch(p.pitch ?? 0)
        th.invalidate()
      },
      camera() {
        const c = th.camera
        c.updateMatrixWorld()
        return {
          matrixWorld: [...c.matrixWorld.elements],
          fov: c.fov,
          aspect: c.aspect,
          near: c.near,
          far: c.far,
        }
      },
      lightList() {
        return lights().map((l) => {
          l.updateMatrixWorld()
          const w = l.getWorldPosition(new V3())
          return {
            type: l.type,
            name: l.name,
            position: [w.x, w.y, w.z],
            intensity: l.intensity,
            color: [l.color.r, l.color.g, l.color.b],
            distance: l.distance,
            decay: l.decay,
            castShadow: l.castShadow,
            visible: l.visible,
          }
        })
      },
      // The frame the real pipeline just drew (8-bit sRGB), as a top-down PNG data URL.
      capture() {
        th.advance(performance.now())
        gl.setRenderTarget(null)
        const w = ctx.drawingBufferWidth
        const h = ctx.drawingBufferHeight
        const b = new Uint8Array(w * h * 4)
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, b)
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const c2 = cv.getContext('2d')
        const img = c2.createImageData(w, h)
        for (let y = 0; y < h; y++) {
          const src = (h - 1 - y) * w * 4
          img.data.set(b.subarray(src, src + w * 4), y * w * 4)
        }
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255
        c2.putImageData(img, 0, 0)
        return cv.toDataURL('image/png')
      },
    }
  })

  const set = async (fn, ...args) => {
    await page.evaluate(fn, ...args)
    await sleep(600)
  }
  const settle = async (ms = 3000) => {
    await page.evaluate(() => window.__three.invalidate())
    await sleep(ms)
  }
  const flag = (v) =>
    set((vv) => window.__store.getState().setFeatureFlag('roomScopedLights', vv), v)
  const lightsMode = (m) => set((mm) => window.__store.getState().setLightsMode(mm), m)
  const grab = async (file) => {
    const url = await page.evaluate(() => window.__ah.capture())
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    return page.evaluate(() => window.__ah.state())
  }

  for (const name of poseNames) {
    const p = POSES[name]
    if (!p) throw new Error(`unknown pose ${name}`)
    await lightsMode('on')
    await flag(true)
    await page.evaluate((q) => window.__ah.pose(q), p)
    await settle(3000)
    const rec = { pose: p, camera: await page.evaluate(() => window.__ah.camera()), shots: {} }
    // Pool membership at this pose: the live slots (flag on), after the fade has settled.
    rec.poolSlots = (await page.evaluate(() => window.__ah.lightList())).filter(
      (l) => l.intensity > 0,
    )
    for (const [key, fn] of [
      ['pool', () => flag(true)],
      ['legacy', () => flag(false)],
      ['pool2', () => flag(true)],
      ['dark', () => lightsMode('off')],
    ]) {
      await fn()
      await settle(3000)
      const file = path.join(OUT, `${name}-${key}.png`)
      rec.shots[key] = { file, state: await grab(file) }
    }
    const cam2 = await page.evaluate(() => window.__ah.camera())
    rec.cameraDrift = Math.max(
      ...cam2.matrixWorld.map((v, i) => Math.abs(v - rec.camera.matrixWorld[i])),
    )
    console.log(
      `[r7ah] ${name}: pool slots ${rec.poolSlots.length}, exposure ${Object.values(rec.shots)
        .map((s) => s.state.exposure)
        .join(
          '/',
        )}, fov ${rec.camera.fov.toFixed(3)} aspect ${rec.camera.aspect.toFixed(4)}, drift ${rec.cameraDrift}`,
    )
    manifest.poses[name] = rec
  }

  // Every fixture light, as ordinary scene lights (flag off), lights on, walk mode.
  await lightsMode('on')
  await flag(false)
  await settle(3000)
  manifest.lights = (await page.evaluate(() => window.__ah.lightList())).filter(
    (l) => l.intensity > 0,
  )
  manifest.exportState = await page.evaluate(() => window.__ah.state())
  manifest.rooms = await page.evaluate(() => {
    const fp = window.__store.getState().floorPlan
    const rs = fp?.rooms ?? fp?.levels?.flatMap((l) => l.rooms ?? []) ?? []
    return rs.map((r) => ({
      id: r.id,
      name: r.name,
      origin: r.origin,
      width: r.width,
      depth: r.depth,
      polygon: r.polygon,
    }))
  })
  manifest.doors = await page.evaluate(() => window.__store.getState().doors)
  console.log(`[r7ah] ${manifest.lights.length} fixture lights lit with the flag off`)
  if (!NO_GLB) {
    const client = await page.createCDPSession()
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT })
    const bytes = await page.evaluate(async () => {
      const [{ buildExportRoot }, { exportGlb }] = await Promise.all([
        import('/src/export/sceneGltf.ts'),
        import('/src/furniture/convert/toGlb.ts'),
      ])
      const buf = await exportGlb(buildExportRoot(window.__three.scene))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }))
      a.download = 'scene.glb'
      document.body.appendChild(a)
      a.click()
      return buf.byteLength
    })
    for (let i = 0; i < 240; i++) {
      try {
        if (fs.statSync(path.join(OUT, 'scene.glb')).size >= bytes) break
      } catch {}
      await sleep(500)
    }
    manifest.glbBytes = bytes
    console.log(`[r7ah] export ${(bytes / 1e6).toFixed(1)} MB -> ${OUT}/scene.glb`)
  }
  manifest.errors = errors
} finally {
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
  await browser.close().catch(() => {})
  releaseLock()
}
