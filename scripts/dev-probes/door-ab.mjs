/**
 * DOOR-AB — why does the bedroom door leaf read as rippled plastic?
 *
 * `surface-coverage.mjs` showed door leaves + frames are ~13% of the walk view — more than
 * the bathroom tile three rounds went into — and nothing had ever photographed one. The
 * bedroom leaf turns out to render as a wavy, wet-looking panel rather than the flat flush
 * laminate an HDB bedroom door actually is.
 *
 * `Door.tsx` builds it with `getWoodMaterial(leafColor, 1, 0.45)`, which is suspicious twice:
 * roughness **0.45** against the `WOOD_BASE_ROUGHNESS` of 0.85 that WOOD-GLOSS (v0.31.5.31)
 * settled, and repeat **1** where the grain is authored for furniture's 2x tiling, so on a
 * 0.8 x 2.1 m panel it is stretched to ripple scale.
 *
 * Four arms at ONE fixed pose, each differing from the shipped state in exactly one variable
 * (meta-rule xvi), mutating the DRAWN material in the probe only:
 *   shipped · roughness 0.85 · grain repeat 2 · normalScale 0 (control: is it the normal map?)
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/bath-tile'
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
if (process.env.BOOT_PHONE === '1') {
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
if (process.env.COARSE === '1') {
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

const TIER = process.env.TIER || 'performance'

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))

fs.mkdirSync(OUT, { recursive: true })

// Face the main bedroom window, derived from the plan's own opening (not a guessed pose).

const OUTDIR = process.env.OUT || '/tmp/door-ab'
fs.mkdirSync(OUTDIR, { recursive: true })

// The main-bedroom door: a wood leaf in a room big enough for the standoff to fit.
const pose = await page.evaluate(async () => {
  const st = window.__store.getState()
  const plan = st.floorPlan
  const op = (plan.openings ?? []).find((o) => o.kind === 'door' && /mainBedroom/i.test(o.id))
  if (!op) return null
  const w = (plan.walls ?? []).find((x) => x.id === op.wallId)
  if (!w) return null
  const [x0, z0] = w.start
  const [x1, z1] = w.end
  const len = Math.hypot(x1 - x0, z1 - z0)
  const ux = (x1 - x0) / len
  const uz = (z1 - z0) / len
  const t = op.offset + op.width / 2
  const cx = x0 + ux * t
  const cz = z0 + uz * t
  const nx = -uz
  const nz = ux
  const inRoom = (px, pz) =>
    (plan.rooms ?? []).some(
      (r) =>
        px >= r.origin[0] &&
        px <= r.origin[0] + r.width &&
        pz >= r.origin[1] &&
        pz <= r.origin[1] + r.depth,
    )
  let px = cx + nx * 1.8
  let pz = cz + nz * 1.8
  if (!inRoom(px, pz)) {
    px = cx - nx * 1.8
    pz = cz - nz * 1.8
  }
  return { id: op.id, pos: [px, 1.6, pz], yaw: Math.atan2(-(cx - px), -(cz - pz)) }
})
if (!pose) throw new Error('no main-bedroom door opening found')

await page.evaluate(async (q) => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
}, pose)
await new Promise((r) => setTimeout(r, 1400))

/** Find the leaf material by raycasting the centre of the view, and remember its shipped state. */
const found = await page.evaluate(() => {
  const { scene, camera } = window.__three
  const THREE = window.__three
  const rc = new THREE.raycaster.constructor()
  rc.setFromCamera({ x: 0, y: 0 }, camera)
  const r = rc.intersectObjects(scene.children, true)
  const h = r.find((o) => o.object.visible && o.object.material?.map)
  if (!h) return null
  const m = h.object.material
  window.__leaf = m
  window.__leafShipped = {
    roughness: m.roughness,
    nsx: m.normalScale.x,
    nsy: m.normalScale.y,
    rx: m.map.repeat.x,
    ry: m.map.repeat.y,
  }
  return {
    colour: `#${m.color.getHexString()}`,
    roughness: +m.roughness.toFixed(2),
    normalScale: +m.normalScale.x.toFixed(2),
    repeat: [+m.map.repeat.x.toFixed(2), +m.map.repeat.y.toFixed(2)],
  }
})
if (!found) throw new Error('no textured leaf under the crosshair — pose suspect')
console.log(`leaf: ${JSON.stringify(found)}\n`)

// The shipped leaf is NOW roughness 0.85 (DOOR-GLOSS v0.31.5.49), so this sweeps the one
// thing that round could not conclude: how much grain relief a door should carry AT that
// gloss. The old `normal0` arm ran at 0.45, so its result cannot be reused (meta-rule xxiii).
const SCALES = (process.env.SCALES || '0,0.1,0.2,0.3,0.45').split(',').map(Number)
/** Grain TILING arms, swept at the same 0.85 gloss. v0.31.5.49 tested `repeat 2` only at the
 *  OLD 0.45 roughness, where specular exaggerated relief — so that verdict cannot be carried
 *  over either (the same mistake as the `normal0` arm). */
const REPEATS = (process.env.REPEATS || '').split(',').filter(Boolean).map(Number)
/** ANISOTROPIC tiling arms, `PAIRS="0.9x2.35,1.8x4.7"` (v0.31.5.151). The repeat-2
 *  verdict this file records was reached under an ISOTROPY CONSTRAINT it could not
 *  escape: a box face's UVs are 0→1 whatever the face's real size, so on a
 *  0.8 x 2.1 m leaf ANY single scalar leaves the grain stretched 2.6:1 (repeat 2 →
 *  0.40 m per tile across, 1.05 m up). These arms set u and v independently, so
 *  "how dense" and "how stretched" stop being the same knob. */
const PAIRS = (process.env.PAIRS || '')
  .split(',')
  .filter(Boolean)
  .map((p) => p.split('x').map(Number))

for (const ns of SCALES) {
  const state = await page.evaluate((v) => {
    const m = window.__leaf
    const s = window.__leafShipped
    // Restore shipped, then vary exactly one thing.
    m.roughness = s.roughness
    for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.repeat.set(s.rx, s.ry)
    m.normalScale.set(v, v)
    m.needsUpdate = true
    window.__store.getState().setManualHour(13)
    return { roughness: m.roughness, normalScale: m.normalScale.x }
  }, ns)
  await new Promise((r) => setTimeout(r, 1200))
  const name = `ns${String(ns).replace('.', '_')}`
  fs.writeFileSync(`${OUTDIR}/${name}.png`, await page.screenshot({ type: 'png' }))
  // Print the arm's OWN state beside its label — a sweep that silently failed to mutate
  // would otherwise look like "no value makes a difference" (meta-rule iv).
  console.log(`  ${name.padEnd(8)} roughness=${state.roughness} normalScale=${state.normalScale}`)
}

for (const rp of REPEATS) {
  const state = await page.evaluate((v) => {
    const m = window.__leaf
    const s = window.__leafShipped
    m.roughness = s.roughness
    m.normalScale.set(s.nsx, s.nsy)
    for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.repeat.set(v, v)
    m.needsUpdate = true
    window.__store.getState().setManualHour(13)
    return { roughness: m.roughness, repeat: m.map.repeat.x, normalScale: m.normalScale.x }
  }, rp)
  await new Promise((r) => setTimeout(r, 1200))
  const name = `rp${String(rp).replace('.', '_')}`
  fs.writeFileSync(`${OUTDIR}/${name}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `  ${name.padEnd(8)} roughness=${state.roughness} repeat=${state.repeat} normalScale=${state.normalScale}`,
  )
}

for (const [ru, rv] of PAIRS) {
  const state = await page.evaluate(
    (v) => {
      const m = window.__leaf
      const s = window.__leafShipped
      m.roughness = s.roughness
      m.normalScale.set(s.nsx, s.nsy)
      for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.repeat.set(v.ru, v.rv)
      m.needsUpdate = true
      window.__store.getState().setManualHour(13)
      return { roughness: m.roughness, repeat: [m.map.repeat.x, m.map.repeat.y] }
    },
    { ru, rv },
  )
  await new Promise((r) => setTimeout(r, 1200))
  const name = `pr${String(ru).replace('.', '_')}x${String(rv).replace('.', '_')}`
  fs.writeFileSync(`${OUTDIR}/${name}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `  ${name.padEnd(12)} roughness=${state.roughness} repeat=${JSON.stringify(state.repeat)}`,
  )
}

console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
