/**
 * DOOR-LOOK — the surface class nothing has ever aimed at.
 *
 * `surface-coverage.mjs` censused what a walk-mode user actually sees, and door leaves plus
 * their frames come to roughly **13% of the view** across 11 rooms x 4 yaws — more than the
 * bathroom tile that three earlier rounds went into, and more than the ceiling (1.45%). No
 * round has ever photographed one deliberately, so "the default-surface survey is complete"
 * was not true.
 *
 * Stands square to each door opening at a conversational distance, derived from the plan's own
 * `openings` (kind === 'door') rather than a guessed pose, and reports the material actually
 * drawn on the leaf so the picture and the numbers come from one run.
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

/**
 * CEILING-ID — what is actually drawn overhead at a given room pose?
 *
 * Written for TEMPLATE-WALK-2: on `tpl-terrace-ground` the KITCHEN's ceiling band
 * measured 37 sRGB luma while the identically-sized DINING room next door read
 * 210, same storey, same lighting. Rather than name the dark shape by eye, this
 * stands at each room's own centroid and raycasts UPWARD-ish, reporting the hit
 * object's name, material colour/type, world bbox and ancestor chain.
 */
const TIER = process.env.TIER || 'performance'
const PLAN = process.env.PLAN || ''
const FURNISH = process.env.FURNISH === '1'
const ROOMS_ENV = (process.env.ROOMS || '').split(',').filter(Boolean)

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))

// FURNISH=1 with no PLAN re-furnishes the DEFAULT flat the same way, so the
// two arms differ in exactly one variable: which plan the preset ran against.
if (!PLAN && FURNISH) {
  await page.evaluate(() => {
    const st = window.__store.getState()
    st.replaceFloorPlan(structuredClone(st.floorPlan), { furniture: 'clear' })
    st.applyLayoutPreset('move-in')
  })
  await new Promise((r) => setTimeout(r, 2500))
  console.log('default flat re-furnished with move-in')
}
if (PLAN) {
  const swapped = await page.evaluate(
    async ({ id, furnish }) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
      if (!tpl) return null
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

await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return {
    plan: st.floorPlan.id,
    viewLevelId: st.viewLevelId,
    tier: st.qualityTier,
    items: st.items.length,
  }
})
console.log(`resolved=${JSON.stringify(resolved)}\n`)

const rooms = await page.evaluate((only) => {
  const st = window.__store.getState()
  return st.floorPlan.rooms
    .filter((r) => only.length === 0 || only.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      x: r.origin[0] + r.width / 2,
      z: r.origin[1] + r.depth / 2,
    }))
}, ROOMS_ENV)

for (const r of rooms) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.x, q.z, 0)
  }, r)
  await new Promise((res) => setTimeout(res, 900))

  const hit = await page.evaluate(() => {
    const { scene, camera, raycaster } = window.__three
    // `window.__three` exposes only camera/gl/controls/scene/raycaster/advance —
    // no constructors — so take Vector3 off a live vector rather than importing.
    const V3 = camera.position.constructor
    const rc = new raycaster.constructor()
    rc.set(camera.position.clone(), new V3(0, 1, 0))
    const hits = rc.intersectObjects(scene.children, true)
    const h = hits.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
    if (!h) return null
    const o = h.object
    const chain = []
    for (let p = o; p; p = p.parent) chain.push(p.name || p.type)
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    const wp = o.getWorldPosition(new V3())
    return {
      dist: Number(h.distance.toFixed(2)),
      hitY: Number(h.point.y.toFixed(2)),
      name: o.name || '(unnamed)',
      type: o.type,
      mat: m?.type,
      colour: m?.color ? `#${m.color.getHexString()}` : null,
      rough: m?.roughness,
      metal: m?.metalness,
      side: m?.side,
      transparent: m?.transparent,
      opacity: m?.opacity,
      map: !!m?.map,
      geo: o.geometry?.type,
      params: o.geometry?.parameters ?? null,
      worldPos: [wp.x, wp.y, wp.z].map((v) => Number(v.toFixed(2))),
      chain: chain.slice(0, 5).join(' < '),
    }
  })
  console.log(`${r.id.padEnd(12)} ${r.name.padEnd(14)} ${hit ? JSON.stringify(hit) : 'NO HIT'}`)
  // What is IN this room, and how high does it sit? A raycast names one surface;
  // the item list explains why it is there.
  const items = await page.evaluate((q) => {
    const st = window.__store.getState()
    const room = st.floorPlan.rooms.find((r) => r.id === q.id)
    if (!room) return []
    const inRoom = (p) =>
      p[0] >= room.origin[0] &&
      p[0] <= room.origin[0] + room.width &&
      p[1] >= room.origin[1] &&
      p[1] <= room.origin[1] + room.depth
    // LEVEL-BLIND FILTER BUG (found the hard way): the upper storey stacks
    // directly above the ground floor, so matching on XZ alone reported upper
    // bedrooms as "in the ground living room". `st.floorPlan.rooms` is
    // ground-only, so only ground-level items may count.
    return st.items
      .filter((it) => (it.levelId ?? 'ground') === 'ground')
      .filter((it) => inRoom(it.position))
      .map(
        (it) =>
          `${it.defId}@[${it.position.map((v) => v.toFixed(2)).join(',')}] elev=${it.elevation ?? 0} props=${JSON.stringify(it.props ?? {}).slice(0, 90)}`,
      )
  }, r)
  for (const line of items) console.log(`    ${line}`)
}

await browser.close()
