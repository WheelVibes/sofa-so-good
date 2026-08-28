/**
 * SURFACE-COVERAGE — what does a user actually SEE in walk mode, ranked by screen area?
 *
 * The loop has carried "the DEFAULT-SURFACE SURVEY IS COMPLETE" for ten rounds without ever
 * testing it, which is exactly what meta-rule (xvii) warns about — a settled-list claim is not
 * evidence, including one I wrote. This builds the list from the APP instead of from memory:
 * stand at each room centre, sweep four yaws, raycast a screen grid, and attribute every hit
 * to the material actually drawn, so the census is of what RENDERS rather than what exists.
 *
 * Each class is described by what identifies it in a frame — material type, base colour, which
 * PBR maps are bound, and the hit geometry's size — because r3f meshes carry no names, so a
 * name-based classifier reports everything as "other" (the MATERIAL-AUDIT lesson).
 *
 * Coverage is the point: a surface nobody has photographed matters in proportion to how much of
 * the view it occupies. Ceilings, skirting, door leaves, window frames, worktops and
 * sanitaryware are the specific suspects — none has ever been aimed at.
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

const TIER = process.env.TIER || 'medium'

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

const OUTDIR = process.env.OUT || '/tmp/surface-coverage'
fs.mkdirSync(OUTDIR, { recursive: true })

const rooms = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const out = []
  for (const id of Object.keys(ROOMS)) {
    const shell = getRoomEditorShell(plan, id)?.shell
    if (!shell?.center || (shell.radius ?? 0) < 0.9) continue
    out.push({ id, pos: [shell.center[0], 1.6, shell.center[1]] })
  }
  return out
})

const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
const totals = new Map()
let samples = 0

for (const room of rooms) {
  for (let i = 0; i < YAWS.length; i++) {
    await page.evaluate(
      async (q) => {
        const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
        requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
      },
      { ...room, yaw: YAWS[i] },
    )
    await new Promise((r) => setTimeout(r, 700))
    const hits = await page.evaluate(() => {
      const { scene, camera } = window.__three
      const THREE = window.__three
      const rc = new THREE.raycaster.constructor()
      const n = new camera.position.constructor()
      const acc = new Map()
      const N = 40
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < N; k++) {
          rc.setFromCamera({ x: ((k + 0.5) / N) * 2 - 1, y: 1 - ((j + 0.5) / N) * 2 }, camera)
          const r = rc.intersectObjects(scene.children, true)
          const h = r.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
          if (!h) continue
          const m = h.object.material
          if (!m) continue
          n.copy(h.face?.normal ?? { x: 0, y: 1, z: 0 }).transformDirection(h.object.matrixWorld)
          const maps =
            ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']
              .filter((s) => m[s])
              .join('+') || 'none'
          const g = h.object.geometry
          g?.computeBoundingBox?.()
          const bb = g?.boundingBox
          const sz = bb
            ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]
                .map((v) => v.toFixed(1))
                .join('x')
            : '?'
          const orient = Math.abs(n.y) > 0.7 ? (h.point.y > 1.9 ? 'ceil' : 'floor') : 'vert'
          const key = `${orient}|${m.type}|#${m.color?.getHexString?.() ?? '??'}|${maps}|${sz}`
          acc.set(key, (acc.get(key) ?? 0) + 1)
        }
      }
      return [...acc.entries()]
    })
    for (const [k, v] of hits) totals.set(k, (totals.get(k) ?? 0) + v)
    samples += 1600
    if (i === 0) {
      fs.writeFileSync(`${OUTDIR}/${room.id}.png`, await page.screenshot({ type: 'png' }))
    }
  }
}

const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])
console.log(`${rooms.length} rooms x ${YAWS.length} yaws = ${samples} rays\n`)
console.log('cover%  orient material            colour    maps                        size')
for (const [k, v] of rows.slice(0, 26)) {
  const [orient, type, col, maps, sz] = k.split('|')
  const pct = ((100 * v) / samples).toFixed(2)
  console.log(
    `${pct.padStart(6)}  ${orient.padEnd(5)} ${type.replace('Mesh', '').replace('Material', '').padEnd(10)} ${col.padEnd(9)} ${maps.padEnd(27)} ${sz}`,
  )
}
console.log(`\n${rows.length} distinct surface classes; frames -> ${OUTDIR}`)
await browser.close()
