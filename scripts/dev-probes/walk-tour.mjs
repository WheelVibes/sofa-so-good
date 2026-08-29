/**
 * WALK-TOUR — stand in each room and look, which is where "does it look real" is decided.
 *
 * PERF-TIER-LOOKS-FINE (.30) closed the orbit dollhouse: at phone size every tier reads
 * crisp and competitive, and the missing-AO theory did not survive the frames. The note it
 * left behind is that a dollhouse view is mostly wall faces and floors seen at DISTANCE —
 * no surface fills the frame, so no surface can look wrong in the way the original
 * "looks like animation, not real" report described.
 *
 * This stands the walk camera in each room of the default flat and captures what a user
 * actually sees. Poses are DERIVED from the plan (room centre, aimed at the room's longest
 * wall, eye height 1.6 m) rather than hand-picked, so the tour is reproducible and covers
 * the defaults rather than a flattering angle (meta-rule xii).
 *
 * Walk mode discards `lookAt` — `FirstPersonCamera` re-asserts the camera quaternion from
 * its own yaw/pitch refs every frame — so the yaw is written through the app's own
 * teleport action and the pitch through the dev-only `window.__walkLook` lever, which is
 * the documented way to aim a headless walk camera (see the playbook).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/ssg-walk'
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
/** Look direction, radians. YXZ Euler Y: forward is (-sin, 0, -cos), so 0 looks -Z. */
const YAW = Number(process.env.YAW || 0)

// LIGHTS=on — at night the shipped `lightsMode: 'off'` default (DEFAULT-GLOOM,
// v0.31.5.54) gives a near-black frame, which is not the condition the emitter
// table and `fixtureGlow.ts` were tuned for. Each run prints its own resolved
// mode beside the tier (meta-rule iv).
const LIGHTS = process.env.LIGHTS || ''

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
if (LIGHTS) {
  await page.evaluate((v) => window.__store.getState().setLightsMode?.(v), LIGHTS)
  await new Promise((r) => setTimeout(r, 2000))
}
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

/**
 * One eye point per room, derived from the app's OWN room geometry.
 *
 * An earlier version looked for `polygon`/`points`/`rect` on `floorPlan.rooms` and found
 * exactly ONE room, because the curated default flat does not describe rooms that way.
 * `roomEditorShell.ts:getRoomEditorShell` already resolves any room — curated or custom —
 * to a shell with a `center` and `radius`, and it is what `OrbitCamera` uses for the room
 * editor framing, so reusing it means the tour cannot silently miss rooms again.
 *
 * Yaw is computed, not guessed: `FirstPersonCamera` applies it as a YXZ Euler Y, so forward
 * is `(-sin(yaw), 0, -cos(yaw))` and aiming from P at T is `atan2(-dx, -dz)`.
 */
const poses = await page.evaluate(async (yawArg) => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const out = []
  for (const id of Object.keys(ROOMS)) {
    const res = getRoomEditorShell(plan, id)
    const shell = res?.shell
    if (!shell?.center) continue
    const [cx, cz] = shell.center
    const r = shell.radius ?? 1.5
    if (r < 0.9) continue // utility slivers (ac ledge etc.) have nothing to review
    // Stand AT the centre. Backing off by `radius * 0.8` along +Z pushed the camera
    // through the exterior wall for edge rooms (the kitchen came back a featureless grey
    // with the minimap arrow outside the plan outline), and the walk collision resolver
    // then has nowhere valid to put it. The centre of a room whose radius clears the
    // player capsule is always inside it.
    const pos = [cx, 1.6, cz]
    out.push({
      id,
      pos,
      yaw: yawArg,
      radius: +r.toFixed(2),
      want: [+cx.toFixed(2), +cz.toFixed(2)],
    })
  }
  return out
}, YAW)

const liveState = await page.evaluate(() => {
  const st = window.__store.getState()
  return `${st.qualityTier}/${st.lightsMode}/${st.timeMode}${st.manualHour}`
})
console.log(
  `tier=${TIER} hour=${HOUR} lights=${LIGHTS || '(default)'} — resolved ${liveState} — walk tour, ${poses.length} rooms\n`,
)
// FOUR yaws per room. A single fixed facing is a lottery: standing at the centre of a
// galley kitchen with yaw 0 puts a wall cabinet 0.6 m from the lens, which passes a
// sigma guard (the frame is full of detail) while being useless for judging anything.
// Sweeping the cardinal directions means no room's review depends on a lucky aim.
const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
for (const p of poses) {
  for (let i = 0; i < YAWS.length; i++) {
    await page.evaluate(
      async (q) => {
        // `requestWalkTeleport` is a MODULE function (`cameras/walkTeleport.ts`), NOT a
        // store action — calling it as `store.requestWalkTeleport?.()` is a silent no-op
        // and left every "room" frame sitting at the default walk spawn.
        const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
        requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
        window.__walkLook?.setPitch(-0.05)
      },
      { ...p, yaw: YAWS[i] },
    )
    await new Promise((r) => setTimeout(r, 1800))
    await assertSceneAlive(page, `${p.id}-y${i}`)
    fs.writeFileSync(`${OUT}/${p.id}-y${i}.png`, await page.screenshot({ type: 'png' }))
  }
  const at = await page.evaluate(() => {
    const c = window.__three.camera
    return c.position.toArray().map((v) => +v.toFixed(2))
  })
  const moved = Math.hypot(at[0] - p.want[0], at[2] - p.want[1])
  console.log(
    `  ${String(p.id).padEnd(18)} r=${p.radius}m  at ${at.join(', ')}  ` +
      `${moved >= 3 ? `<-- DID NOT REACH centre (${moved.toFixed(1)} m)` : 'ok, 4 yaws'}`,
  )
}

// ROUGHNESS A/B on the furniture wood, in ONE run from the same pose.
// `getWoodMaterial(color, repeat, rough = 0.5)` also binds a roughness MAP, so the
// scalar multiplies it; at 0.5 the specular lobe is tight enough to turn the grain
// normal's low-frequency waviness into mirror ribbons ("cling film over timber").
// Materials are selected by that factory's signature (mapped MeshStandardMaterial at
// metalness 0.04) rather than by name, since r3f meshes carry none.
const ROUGH = (process.env.ROUGH || '').split(',').filter(Boolean).map(Number)
if (ROUGH.length) {
  const target = poses[0]
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
    window.__walkLook?.setPitch(-0.18)
  }, target)
  await new Promise((r) => setTimeout(r, 2500))
  const baseline = await page.evaluate(() => {
    const seen = []
    window.__three.scene.traverse((o) => {
      const m = o.material
      if (m?.isMeshStandardMaterial && m.map && Math.abs(m.metalness - 0.04) < 1e-6) {
        seen.push(m.roughness)
      }
    })
    return { n: seen.length, values: [...new Set(seen.map((v) => +v.toFixed(2)))] }
  })
  console.log(`\nwood-signature materials: ${baseline.n}  roughness values ${baseline.values}`)
  for (const r of ROUGH) {
    const applied = await page.evaluate((rv) => {
      let n = 0
      window.__three.scene.traverse((o) => {
        const m = o.material
        if (m?.isMeshStandardMaterial && m.map && Math.abs(m.metalness - 0.04) < 1e-6) {
          m.userData.__origRough ??= m.roughness
          m.roughness = rv
          m.needsUpdate = true
          n++
        }
      })
      window.__store.getState().setManualHour(window.__store.getState().manualHour)
      return n
    }, r)
    await new Promise((rr) => setTimeout(rr, 2000))
    fs.writeFileSync(`${OUT}/rough-${r}.png`, await page.screenshot({ type: 'png' }))
    console.log(`  roughness ${r} applied to ${applied} materials -> rough-${r}.png`)
  }
}

console.log(`\nframes -> ${OUT}`)
await browser.close()
