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
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/ssg-walk'
fs.mkdirSync(OUT, { recursive: true })
/** Per-frame camera transforms, written to `cams.json` for Cycles view parity. */
const cams = []

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
await page.evaluate(
  ({ h, photo }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    // PHOTO=1 turns on the photographic look. Everything this tour has ever shot
    // was the DEFAULT look, so the look the realism work since `.162` actually
    // tunes had never been reviewed room-by-room (`.228`).
    if (photo) s.setPhotographicLook?.(true)
  },
  { h: HOUR, photo: process.env.PHOTO === '1' },
)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

// `TIER=auto` leaves the capability-detected tier ALONE. Without it this probe
// always calls `setQualityTier`, so a phone-profile run (BOOT_PHONE=1 COARSE=1)
// booted to the veto's `performance` and was then FORCED back to `medium` — the
// arm would not have been a phone arm at all (meta-rules iv, xvi).
// PLAN=<template id> swaps in a shipped PLAN_TEMPLATE before touring, and
// LEVEL=<upper level id> tours that storey instead of the ground floor. Without
// them the tour is hardwired to the default flat — see the pose block below.
const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
/** FURNISH=1 — clear the old furniture and auto-furnish the template instead. */
const FURNISH = process.env.FURNISH === '1'

const TIER = process.env.TIER || 'performance'
const TIER_AUTO = TIER === 'auto'
/** Look direction, radians. YXZ Euler Y: forward is (-sin, 0, -cos), so 0 looks -Z. */
const YAW = Number(process.env.YAW || 0)

// LIGHTS=on — at night the shipped `lightsMode: 'off'` default (DEFAULT-GLOOM,
// v0.31.5.54) gives a near-black frame, which is not the condition the emitter
// table and `fixtureGlow.ts` were tuned for. Each run prints its own resolved
// mode beside the tier (meta-rule iv).
const LIGHTS = process.env.LIGHTS || ''

if (!TIER_AUTO) await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
if (LIGHTS) {
  await page.evaluate((v) => window.__store.getState().setLightsMode?.(v), LIGHTS)
  await new Promise((r) => setTimeout(r, 2000))
}
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))
if (PLAN) {
  const swapped = await page.evaluate(
    async ({ id, furnish }) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
      if (!tpl) return null
      // 'rehome' is the real SWAP path (PLAN-SWAP-STRANDED, v0.31.5.90) and keeps the
      // old flat's furniture; FURNISH=1 instead CLEARS and auto-furnishes, which is
      // the only way to judge the TEMPLATE rather than the swap.
      const st = window.__store.getState()
      st.replaceFloorPlan(structuredClone(tpl), { furniture: furnish ? 'clear' : 'rehome' })
      if (furnish) st.applyLayoutPreset('move-in')
      return tpl.name
    },
    { id: PLAN, furnish: FURNISH },
  )
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await new Promise((r) => setTimeout(r, 2500))
  console.log(`plan swapped -> ${swapped} (${PLAN})`)
}
if (LEVEL) {
  // The walk camera stands at `level.elevation + eyeHeight` for whichever level
  // `viewLevelId` selects (FirstPersonCamera, ML6c) — this is how an upper storey
  // is reached at all.
  await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
  await new Promise((r) => setTimeout(r, 1200))
}

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
const poses = await page.evaluate(
  async (yawArg, levelId) => {
    const [{ ROOMS }, { getRoomEditorShell }, { isDefaultPlan }] = await Promise.all([
      import('/src/apartment/constants.ts'),
      import('/src/scene/roomEditorShell.ts'),
      import('/src/floorplan/planGeometry.ts'),
    ])
    const plan = window.__store.getState().floorPlan
    // Room ids come from the LOADED PLAN, not from `ROOMS`. `ROOMS` is the default
    // flat's hardcoded constant table, so touring any other template through it
    // yielded ZERO poses — the instrument was hardwired to one plan and would have
    // reported an empty tour rather than a missing capability (meta-rule cix).
    // `ROOMS` order is kept for the default flat so existing runs are unchanged.
    const upper = (plan.upperLevels ?? []).find((l) => l.id === levelId)
    const ids = upper
      ? upper.rooms.map((r) => r.id)
      : isDefaultPlan(plan)
        ? Object.keys(ROOMS)
        : (plan.rooms ?? []).map((r) => r.id)
    const out = []
    for (const id of ids) {
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
  },
  YAW,
  LEVEL,
)

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
/** Below this fraction of non-background cells a frame is treated as EMPTY. */
const EMPTY_PCT = Number(process.env.EMPTY_PCT || 12)
const frameStats = []
const empties = []
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
    // Three's OWN submission counters for the frame just drawn. A tier that
    // renders far fewer calls/triangles at the same pose has dropped geometry
    // before the rasteriser, which is a different failure from one that draws it
    // and looks wrong. `advance` is r3f's synchronous driver, so this measures
    // the real pipeline under `frameloop="demand"` rather than a stale composite.
    // NOT `gl.info.render.calls` — with the post stack mounted the last render
    // is the final fullscreen pass, so that counter reads 1 and tells you
    // nothing (it did exactly that on the first attempt). Count the meshes the
    // camera can actually see instead: visible, and intersecting the frustum.
    const info = await page.evaluate(() => {
      const { scene, camera } = window.__three
      camera.updateMatrixWorld()
      const proto = Object.getPrototypeOf(camera.projectionMatrix)
      const m = proto.constructor
        ? new camera.projectionMatrix.constructor().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse,
          )
        : null
      if (!m) return { vis: -1, tris: -1 }
      // Plane extraction, so the probe does not need THREE.Frustum imported.
      const e = m.elements
      const planes = [
        [e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]],
        [e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]],
        [e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]],
        [e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]],
        [e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]],
        [e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]],
      ].map(([a, b, c, d]) => {
        const n = Math.hypot(a, b, c) || 1
        return [a / n, b / n, c / n, d / n]
      })
      let vis = 0
      let tris = 0
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return
        for (let q = o.parent; q; q = q.parent) if (!q.visible) return
        const g = o.geometry
        if (!g) return
        g.computeBoundingSphere?.()
        const bs = g.boundingSphere
        if (!bs) return
        const c = bs.center.clone().applyMatrix4(o.matrixWorld)
        const sc = o.matrixWorld.getMaxScaleOnAxis?.() ?? 1
        const r = bs.radius * sc
        for (const [a, b, cc, d] of planes) {
          if (a * c.x + b * c.y + cc * c.z + d < -r) return
        }
        vis++
        tris += (g.index ? g.index.count : (g.attributes?.position?.count ?? 0)) / 3
      })
      return { vis, tris: Math.round(tris) }
    })
    // CAMERA DUMP, so a Cycles render can reproduce this exact view.
    // Every app-vs-traced round in this arc has had to re-establish view parity by hand, and
    // `render_still.py --cam-space three` takes these numbers directly. Written per frame because
    // walk mode's yaw comes from `FirstPersonCamera`'s own refs, so the only trustworthy source
    // for where the camera actually ended up is the camera itself, after the fact.
    const cam = await page.evaluate(() => {
      const c = window.__three?.camera
      if (!c) return null
      c.updateMatrixWorld(true)
      const p0 = [
        c.matrixWorld.elements[12],
        c.matrixWorld.elements[13],
        c.matrixWorld.elements[14],
      ]
      // three cameras look down LOCAL -Z; column 2 of the world matrix is +Z.
      const fwd = [
        -c.matrixWorld.elements[8],
        -c.matrixWorld.elements[9],
        -c.matrixWorld.elements[10],
      ]
      return {
        pos: p0.map((v) => Number(v.toFixed(4))),
        target: p0.map((v, k) => Number((v + fwd[k] * 3).toFixed(4))),
        fovDeg: Number((c.fov ?? 0).toFixed(3)),
        aspect: Number((c.aspect ?? 0).toFixed(4)),
      }
    })
    if (cam) cams.push({ id: `${p.id}-y${i}`, ...cam })
    const shot = await page.screenshot({ type: 'png' })
    fs.writeFileSync(`${OUT}/${p.id}-y${i}.png`, shot)
    // EMPTY-FRAME GUARD (meta-rule lvii). ~180 frames have been judged in this
    // run and a silently empty one would have looked plausible on disk. Compare
    // every cell against the top-left corner (always backdrop at eye level);
    // a frame where almost nothing differs from the background is not a frame.
    const { data, info: meta } = await sharp(shot)
      .removeAlpha()
      .resize(64, 40, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const lum = (k) => 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]
    const bg = lum(0)
    let differing = 0
    for (let k = 0; k < meta.width * meta.height; k++) {
      if (Math.abs(lum(k * 3) - bg) > 8) differing++
    }
    const content = (100 * differing) / (meta.width * meta.height)
    frameStats.push({ id: `${p.id}-y${i}`, content, ...info })
    if (content < EMPTY_PCT) {
      empties.push(`${p.id}-y${i} (${content.toFixed(1)}% content, ${info.calls} calls)`)
    }
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

const avg = (f) => (frameStats.reduce((a, b) => a + f(b), 0) / frameStats.length).toFixed(0)
console.log(
  `\n${frameStats.length} frames — mean ${avg((f) => f.content)}% content, ` +
    `${avg((f) => f.vis)} visible meshes in frustum, ${avg((f) => f.tris)} triangles`,
)
if (empties.length) {
  console.log(`\n!! ${empties.length} EMPTY FRAME(S) (< ${EMPTY_PCT}% content):`)
  for (const e of empties) console.log(`   ${e}`)
}
console.log(`\nframes -> ${OUT}`)
await browser.close()
fs.writeFileSync(`${OUT}/cams.json`, JSON.stringify(cams, null, 1))
console.log(`camera transforms -> ${OUT}/cams.json (${cams.length})`)
