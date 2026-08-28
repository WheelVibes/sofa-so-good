/**
 * PHONE-VIEW — what the app actually looks like at true phone widths.
 *
 * Every frame reviewed in this loop has been 1280x800 at deviceScaleFactor 2. The app
 * ships for phones (`docs/visual-verification-playbook.md` notes Chrome's
 * `resize_window` clamps at ~606 px, so 390/320 need real `viewport` steps and only the
 * headless harness can reach them), and the 44 px tap-target CSS is gated on
 * `@media (max-width: 960px)` — i.e. on WIDTH, so a narrow window changes layout while
 * only a true phone viewport changes layout AND pixel budget AND touch paths together.
 *
 * This captures the DEFAULT flat in orbit at the two widths that matter — 390 (iPhone
 * 14/15 class) and 320 (SE class, the narrowest still supported) — at deviceScaleFactor
 * 3 with `isMobile`/`hasTouch` set, so the render is judged the way a phone user sees
 * it. It reports the drawing-buffer size and DPR the app actually chose alongside each
 * frame, because a phone's pixel budget is the one place `dprMax` and the adaptive tier
 * are load-bearing: 390 x 844 at DPR 3 is 2.96 Mpx, MORE than the 1280x800 DPR 2 desktop
 * frame (2.05 Mpx) this suite has been measuring all along.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/ssg-phone'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  // `runCostBreakdown` is ONE long `evaluate` call, and the paired baseline
  // (PROFILER-PAIRED-BASELINE) roughly doubles its length — past puppeteer's
  // 180 s default `protocolTimeout`, which kills the run mid-sweep with a
  // ProtocolError that looks like a page crash but is only the CDP deadline.
  protocolTimeout: 900_000,
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
// BOOT AS THE DEVICE UNDER TEST. `quality.ts` reads device capabilities ONCE at boot,
// so anything emulated after `goto` is invisible to the veto: an earlier version of this
// probe booted at 1280x800 and only switched to phone viewports later, which showed the
// detector a desktop every time and made the phone veto look broken when it had simply
// never been asked. Set metrics, touch and the pointer media feature BEFORE load.
if (process.env.BOOT_PHONE !== '0') {
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
} else {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
}
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
// `quality.ts:readDeviceCapabilities` reads `matchMedia('(pointer: coarse)')`, and
// puppeteer's `setViewport({ isMobile, hasTouch })` does NOT set that media feature —
// so without this a "phone" probe reports a fine pointer and the phone veto in
// `capabilityCeilingTier` never fires, making the ladder look broken when it is the
// harness that is lying. Must be set BEFORE load: capabilities are read once at boot.
if (process.env.COARSE !== '0') {
  // Straight to CDP: puppeteer's `emulateMediaFeatures` allowlist rejects `pointer`
  // ("Unsupported media feature"), but the protocol itself supports it, and this is
  // real media emulation rather than a `matchMedia` shim. Sent AFTER the device-metrics
  // override above, which otherwise resets emulated media, and before `goto`.
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'any-pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  })
}
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

async function occupancy() {
  return page.evaluate(() => {
    const { scene, camera } = window.__three
    const Vec = camera.position.constructor
    const box = { minX: 1e9, minY: 1e9, minZ: 1e9, maxX: -1e9, maxY: -1e9, maxZ: -1e9 }
    scene.traverse((o) => {
      // Shell + furniture only: the sky dome would swallow the whole frame.
      if (!o.isMesh || o.material?.isMeshBasicMaterial) return
      const g = o.geometry
      if (!g) return
      g.computeBoundingBox?.()
      const bb = g.boundingBox
      if (!bb) return
      for (const cx of [bb.min.x, bb.max.x])
        for (const cy of [bb.min.y, bb.max.y])
          for (const cz of [bb.min.z, bb.max.z]) {
            const v = new Vec(cx, cy, cz).applyMatrix4(o.matrixWorld)
            box.minX = Math.min(box.minX, v.x)
            box.maxX = Math.max(box.maxX, v.x)
            box.minY = Math.min(box.minY, v.y)
            box.maxY = Math.max(box.maxY, v.y)
            box.minZ = Math.min(box.minZ, v.z)
            box.maxZ = Math.max(box.maxZ, v.z)
          }
    })
    let nx0 = 1e9
    let ny0 = 1e9
    let nx1 = -1e9
    let ny1 = -1e9
    for (const x of [box.minX, box.maxX])
      for (const y of [box.minY, box.maxY])
        for (const z of [box.minZ, box.maxZ]) {
          const v = new Vec(x, y, z).project(camera)
          nx0 = Math.min(nx0, v.x)
          nx1 = Math.max(nx1, v.x)
          ny0 = Math.min(ny0, v.y)
          ny1 = Math.max(ny1, v.y)
        }
    return {
      wPct: +(((nx1 - nx0) / 2) * 100).toFixed(1),
      hPct: +(((ny1 - ny0) / 2) * 100).toFixed(1),
      dist: +camera.position.distanceTo(camera.position.clone().set(0, 0, 0)).toFixed(1),
    }
  })
}

const VIEWPORTS = [
  // Desktop first, as a regression control: the re-fit must not disturb the
  // framing anyone already has on a stationary window.
  { label: 'desktop-1280', width: 1280, height: 800, deviceScaleFactor: 2, desktop: true },
  { label: 'phone-390', width: 390, height: 844, deviceScaleFactor: 3 },
  { label: 'phone-320', width: 320, height: 568, deviceScaleFactor: 2 },
]

// Prove the emulated signal actually reached the code that reads it before drawing any
// conclusion about the veto (meta-rule xxvii): report what the page sees AND what the
// app's own capability detection makes of it.
const caps = await page.evaluate(async () => {
  const q = await import('/src/scene/quality.ts')
  const gl = window.__three?.gl?.getContext?.()
  const read = gl ? q.readDeviceCapabilities?.(gl) : null
  const st = window.__store.getState()
  return {
    matchMediaCoarse: globalThis.matchMedia?.('(pointer: coarse)')?.matches === true,
    maxTouchPoints: navigator.maxTouchPoints,
    cores: navigator.hardwareConcurrency,
    uaMobile: navigator.userAgentData?.mobile ?? null,
    caps: read ?? null,
    ceiling: read ? q.capabilityCeilingTier(read) : null,
    initialAuto: read ? q.initialAutoTier?.(read) : null,
    liveTier: st.qualityTier,
    autoSettled: st.qualityAutoSettled ?? null,
  }
})
console.log('capability detection as the PAGE sees it:')
console.log(`  matchMedia('(pointer: coarse)') = ${caps.matchMediaCoarse}`)
console.log(
  `  maxTouchPoints=${caps.maxTouchPoints}  cores=${caps.cores}  uaData.mobile=${caps.uaMobile}`,
)
console.log(`  readDeviceCapabilities -> ${JSON.stringify(caps.caps)}`)
console.log(
  `  capabilityCeilingTier=${caps.ceiling}  initialAutoTier=${caps.initialAuto}  ` +
    `live tier=${caps.liveTier}  autoSettled=${caps.autoSettled}\n`,
)

console.log(`hour=${HOUR} — default flat, orbit, true phone viewports\n`)
console.log('viewport     css        buffer          dpr   tier         meshes  lit  p50')

for (const vp of VIEWPORTS) {
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: !vp.desktop,
    hasTouch: !vp.desktop,
  })
  // A viewport change resizes the drawing buffer; give the adaptive tier and the
  // DPR clamp time to settle before judging either the frame or the numbers.
  await new Promise((r) => setTimeout(r, 5000))
  await assertSceneAlive(page, vp.label)

  const info = await page.evaluate(() => {
    const { gl, scene } = window.__three
    const st = window.__store.getState()
    let meshes = 0
    let lit = 0
    scene.traverse((o) => {
      if (o.isMesh) meshes++
      if (o.isPointLight && o.intensity > 0) lit++
    })
    return {
      buffer: `${gl.domElement.width}x${gl.domElement.height}`,
      mpx: +((gl.domElement.width * gl.domElement.height) / 1e6).toFixed(2),
      dpr: +gl.getPixelRatio().toFixed(2),
      tier: st.qualityTier,
      meshes,
      lit,
    }
  })

  // How much of the viewport does the plan actually occupy? The orbit fit uses
  // `fitDistanceForFov`, which fits the plan's bounding SPHERE — for a wide, shallow
  // flat the sphere radius is the plan DIAGONAL, so the projected footprint can be far
  // smaller than the frame even when the fit is "correct". Projecting the shell's own
  // bounding box to NDC measures that slack directly instead of eyeballing the frame.
  const occ = await occupancy()

  fs.writeFileSync(`${OUT}/${vp.label}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `${vp.label.padEnd(12)} ${`${vp.width}x${vp.height}`.padEnd(10)} ` +
      `${info.buffer.padEnd(13)} ${String(info.dpr).padStart(4)}  ${info.tier.padEnd(12)} ` +
      `${String(info.meshes).padStart(6)} ${String(info.lit).padStart(4)}  ${info.mpx} Mpx  ` +
      `fills ${occ.wPct}% w x ${occ.hPct}% h`,
  )
}
// ROTATION. `OrbitCamera` frames once on first attach and treats the viewport size as
// a point-in-time read, never a dependency (see its useExhaustiveDependencies note), so
// nothing re-fits when the viewport changes. That is invisible going portrait -> landscape
// (the model just gets smaller) but should CLIP going landscape -> portrait: the landscape
// fit solves for the vertical FOV at ~2.6r, while portrait needs ~5.3r for the narrower
// horizontal FOV. A fill wider than 100% means the flat is cut off at the screen edges.
console.log('\nrotation: frame in landscape, then rotate to portrait without touching the camera')
await page.setViewport({
  width: 844,
  height: 390,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})
await new Promise((r) => setTimeout(r, 4000))
// Re-frame for landscape the way a fresh load would, so the rotation starts from a
// correctly-framed state rather than from the previous viewport's stale fit.
await page.evaluate(() => window.__store.getState().requestHomeView())
await new Promise((r) => setTimeout(r, 4000))
const land = await occupancy()
fs.writeFileSync(`${OUT}/rotate-1-landscape.png`, await page.screenshot({ type: 'png' }))

await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})
await new Promise((r) => setTimeout(r, 4000))
const port = await occupancy()
fs.writeFileSync(`${OUT}/rotate-2-portrait.png`, await page.screenshot({ type: 'png' }))

console.log(`  landscape 844x390   fills ${land.wPct}% w x ${land.hPct}% h`)
console.log(
  `  -> portrait 390x844 fills ${port.wPct}% w x ${port.hPct}% h` +
    `  ${port.wPct > 100 || port.hPct > 100 ? '<-- CLIPPED, the flat is cut off' : '(fits)'}`,
)

console.log(`\nframes -> ${OUT}`)
await browser.close()
