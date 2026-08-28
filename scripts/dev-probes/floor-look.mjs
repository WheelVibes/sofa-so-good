/**
 * FLOOR-LOOK — the floor finish at the pose where a floor is actually judged.
 *
 * PROCEDURAL-BAKE-STALE left the four floor finishes bound to the `@256` generation
 * built during the adaptive ladder's transient `performance` pass, while the tile they
 * should match sat at `@512`. A texture-size census proves the binding changed; it does
 * not prove the FLOOR looks different, so this stands in each room, pitches the eye down
 * at the floor, and saves a frame — plus the raycast size of the material three is
 * actually drawing with (meta-rule xl), so the number and the picture come from one run.
 *
 * The size is fixed at MOUNT, so a before/after needs a cross-run A/B (meta-rule i):
 * run it, stash the fix, run it again, and compare the same pose across the two runs.
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

fs.mkdirSync(OUT, { recursive: true })

fs.mkdirSync(OUT, { recursive: true })

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

for (const room of rooms) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], 0)
  }, room)
  await new Promise((r) => setTimeout(r, 600))
  // Pitch the eye DOWN at the floor — the whole point of this probe. A 1.6 m eye at
  // yaw-only looks straight ahead and never hits a floor at all.
  await page.evaluate(() => window.__walkLook?.setPitch?.(-0.75))
  await new Promise((r) => setTimeout(r, 900))

  const hit = await page.evaluate(async () => {
    const [cache, cat, gen] = await Promise.all([
      import('/src/materials/cache.ts'),
      import('/src/materials/builtinCatalog.ts'),
      import('/src/materials/procedural/generators.ts'),
    ])
    const catalog = cat.BUILTIN_MATERIALS ?? cat.default ?? {}
    const label = new Map()
    const base = gen.getProceduralBaseSize()
    for (const px of [512, 256]) {
      gen.setProceduralBaseSize(px)
      for (const [id, def] of Object.entries(catalog)) {
        if (def?.kind !== 'procedural') continue
        let m
        try {
          m = cache.buildMaterial(def)
        } catch {
          continue
        }
        if (m?.map) label.set(m.map.uuid, `${id}@${m.map.image?.width ?? '?'}`)
      }
    }
    gen.setProceduralBaseSize(base)

    const { scene, camera } = window.__three
    const THREE = window.__three
    const rc = new THREE.raycaster.constructor()
    const n = new camera.position.constructor()
    const acc = new Map()
    for (let j = 0; j < 10; j++) {
      for (let k = 0; k < 10; k++) {
        rc.setFromCamera({ x: ((k + 0.5) / 10) * 2 - 1, y: 1 - ((j + 0.5) / 10) * 2 }, camera)
        const r = rc.intersectObjects(scene.children, true)
        const h = r.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
        if (!h?.face) continue
        const m = h.object.material
        if (!m?.map?.image) continue
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        if (Math.abs(n.y) < 0.7) continue // floors only
        const key = `${m.map.image.width}|${label.get(m.map.uuid) ?? 'OTHER'}`
        acc.set(key, (acc.get(key) ?? 0) + 1)
      }
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  })

  fs.writeFileSync(`${OUT}/${room.id}.png`, await page.screenshot({ type: 'png' }))
  console.log(
    `${room.id.padEnd(16)} ${hit.map(([k, c]) => `${k} x${c}`).join('   ') || '(no floor hit)'}`,
  )
}

console.log(`\nframes -> ${OUT}`)
await browser.close()
