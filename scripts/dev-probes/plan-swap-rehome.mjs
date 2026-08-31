/**
 * PLAN-SWAP-REHOME — does furniture survive an architecture change, or end up in walls?
 *
 * The worry was that switching apartment type leaves the OLD flat's furniture standing in
 * the NEW plan — beds in corridors, sofas inside walls. Reading the three user paths first
 * (meta-rule xvii cuts both ways: a source read is not proof a system WORKS either, but it
 * does tell you which path to measure):
 *   · the template picker calls `replaceFloorPlan(tpl, { furniture: 'clear' })` behind a
 *     danger confirm that names the item count and mentions undo — nothing to strand;
 *   · the SH3D import calls the low-level `setFloorPlan` but `setItems` the imported file's
 *     OWN furniture first, in one history step — it owns the furniture, as that API's
 *     contract requires;
 *   · **`replaceFloorPlan(plan, { furniture: 'rehome' })` is the only path where furniture
 *     crosses an architecture change** — used by "reset to default" and by loading a SAVED
 *     apartment, where keeping the user's pieces is the whole point.
 * So this measures the rehome path, and stresses it the way that hurts: swap the furnished
 * default 4-room for a SMALLER plan, where much of the old layout has nowhere to go.
 *
 * The verdict is the app's own definition, not one invented here — `rehomeStrandedItems`
 * decides "outside every room", and `itemFootprint` gives the world OBB — so the check
 * cannot drift from the code it audits.
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

const TARGETS = (process.env.TARGETS || 'tpl-hdb-2room,tpl-studio,tpl-condo-penthouse').split(',')

/** How many items sit outside every room of the CURRENT plan, by the app's own rule? */
const census = async () =>
  await page.evaluate(async () => {
    const [{ itemFootprint }, { obbAxisHalf }, { buildMergedCatalog }] = await Promise.all([
      import('/src/collision/placement.ts'),
      import('/src/layout/alignDistribute.ts'),
      import('/src/furniture/catalog.ts'),
    ])
    const st = window.__store.getState()
    const plan = st.floorPlan
    // There is no `st.catalog` — the store builds it on demand. Reading a field that
    // does not exist gave `{}`, so `if (!def) continue` skipped EVERY item and the
    // census reported 0 outside while the frame plainly showed furniture in the void.
    const catalog = buildMergedCatalog({
      userFurniture: st.userFurniture,
      resolvedRemoteFurniture: st.resolvedRemoteFurniture,
      packFurniture: st.packFurniture,
    })
    const items = st.items ?? []

    // Room cover rects, same shape rehomeItems uses (rect + optional extension).
    const rects = []
    for (const r of plan.rooms) {
      rects.push({
        x0: r.origin[0],
        z0: r.origin[1],
        x1: r.origin[0] + r.width,
        z1: r.origin[1] + r.depth,
      })
      if (r.extension) {
        rects.push({
          x0: r.origin[0] + r.extension.offset[0],
          z0: r.origin[1] + r.extension.offset[1],
          x1: r.origin[0] + r.extension.offset[0] + r.extension.width,
          z1: r.origin[1] + r.extension.offset[1] + r.extension.depth,
        })
      }
    }
    const inAnyRoom = (x, z) => rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)

    let outside = 0
    let footprintOut = 0
    const examples = []
    for (const it of items) {
      const def = catalog[it.defId]
      if (!def) continue
      const [ix, iz] = it.position
      if (!inAnyRoom(ix, iz)) {
        outside += 1
        if (examples.length < 6) examples.push(`${it.defId} @ ${ix.toFixed(1)},${iz.toFixed(1)}`)
      }
      // Also check the item's BODY, not just its centre — a piece can be centred
      // inside and still hang through a wall.
      const obb = itemFootprint(it, def)
      const hx = obbAxisHalf(obb.hx, obb.hz, obb.rot, 0)
      const hz = obbAxisHalf(obb.hx, obb.hz, obb.rot, 1)
      const corners = [
        [obb.cx - hx, obb.cz - hz],
        [obb.cx + hx, obb.cz - hz],
        [obb.cx - hx, obb.cz + hz],
        [obb.cx + hx, obb.cz + hz],
      ]
      if (!corners.every(([cx, cz]) => inAnyRoom(cx, cz))) footprintOut += 1
    }
    // The FRAME disagreed with this count (meta-rule v caught it), so report the raw
    // inputs: the room rects the test is using, and the items furthest from the plan
    // centre with their verdicts. A predicate that says 0 while the picture shows
    // furniture in the void is measuring the wrong thing.
    const cx = rects.length ? rects.reduce((a, r) => a + (r.x0 + r.x1) / 2, 0) / rects.length : 0
    const cz = rects.length ? rects.reduce((a, r) => a + (r.z0 + r.z1) / 2, 0) / rects.length : 0
    const far = items
      .map((it) => ({
        id: it.defId,
        x: +it.position[0].toFixed(2),
        z: +it.position[1].toFixed(2),
        d: +Math.hypot(it.position[0] - cx, it.position[1] - cz).toFixed(2),
        inside: inAnyRoom(it.position[0], it.position[1]),
      }))
      .sort((a, b) => b.d - a.d)
      .slice(0, 8)
    return {
      plan: plan.id,
      items: items.length,
      outside,
      footprintOut,
      examples,
      rooms: plan.rooms.length,
      rects: rects.slice(0, 6).map((r) => [r.x0, r.z0, r.x1, r.z1].map((v) => +v.toFixed(1))),
      polygonRooms: plan.rooms.filter((r) => r.polygon?.length >= 3).length,
      far,
    }
  })

const before = await census()
console.log(
  `BEFORE  plan=${before.plan}  items=${before.items}  ` +
    `centre-outside=${before.outside}  footprint-crosses=${before.footprintOut}`,
)
fs.writeFileSync(`${OUT}/before.png`, await page.screenshot({ type: 'png' }))

for (const target of TARGETS) {
  // Reload the furnished default between arms so every swap starts from the same
  // layout (a control arm must differ in exactly one variable — meta-rule xvi).
  // `resetFloorPlan` IS `replaceFloorPlan(buildDefaultPlan(), { furniture: 'rehome' })`,
  // and it is a real store action rather than a module internal.
  await page.evaluate(() => window.__store.getState().resetFloorPlan())
  await new Promise((r) => setTimeout(r, 800))

  const ok = await page.evaluate(async (id) => {
    const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
    const tpl = PLAN_TEMPLATES.find((p) => p.id === id)
    if (!tpl) return false
    // The path under test: keep the furniture, re-home what no longer fits.
    window.__store.getState().replaceFloorPlan(structuredClone(tpl), { furniture: 'rehome' })
    return true
  }, target)
  if (!ok) {
    console.log(`${target}: NOT FOUND`)
    continue
  }
  await new Promise((r) => setTimeout(r, 1500))
  const after = await census()
  console.log(
    `AFTER   plan=${after.plan.padEnd(20)} items=${String(after.items).padStart(3)}  ` +
      `centre-outside=${String(after.outside).padStart(3)}  ` +
      `footprint-crosses=${String(after.footprintOut).padStart(3)}`,
  )
  if (after.examples.length) console.log(`        e.g. ${after.examples.join(' | ')}`)
  console.log(
    `        rooms=${after.rooms} (polygon:${after.polygonRooms})  rects=${JSON.stringify(after.rects)}`,
  )
  console.log(
    `        furthest: ${after.far.map((f) => `${f.id}@${f.x},${f.z} d=${f.d}${f.inside ? ' IN' : ' OUT'}`).join(' | ')}`,
  )
  fs.writeFileSync(`${OUT}/${target}.png`, await page.screenshot({ type: 'png' }))
}

console.log(`\nframes -> ${OUT}`)
await browser.close()
