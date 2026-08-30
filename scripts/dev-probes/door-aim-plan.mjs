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

const TIER = process.env.TIER || 'medium'
const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
const FURNISH = process.env.FURNISH === '1'

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
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

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return {
    plan: st.floorPlan.id,
    viewLevelId: st.viewLevelId,
    cameraMode: st.cameraMode,
    tier: st.qualityTier,
    uiMode: st.uiMode,
    items: st.items.length,
  }
})
console.log(`resolved=${JSON.stringify(resolved)}`)

// Door poses derived from the WALKED storey's own openings — not the default
// flat's constants, which is the whole point of the round.
const poses = await page.evaluate(async () => {
  const st = window.__store.getState()
  const plan = st.floorPlan
  const lvlId = st.viewLevelId
  const upper = (plan.upperLevels ?? []).find((l) => l.id === lvlId)
  const walls = upper ? upper.walls : plan.walls
  const openings = upper ? upper.openings : plan.openings
  const rooms = upper ? upper.rooms : plan.rooms
  const out = []
  for (const op of openings ?? []) {
    if (op.kind !== 'door') continue
    const w = (walls ?? []).find((x) => x.id === op.wallId)
    if (!w) continue
    const [x0, z0] = w.start
    const [x1, z1] = w.end
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (!len) continue
    const ux = (x1 - x0) / len
    const uz = (z1 - z0) / len
    const t = op.offset + op.width / 2
    const cx = x0 + ux * t
    const cz = z0 + uz * t
    const nx = -uz
    const nz = ux
    const inRoom = (px, pz) =>
      (rooms ?? []).some(
        (r) =>
          px >= r.origin[0] &&
          px <= r.origin[0] + r.width &&
          pz >= r.origin[1] &&
          pz <= r.origin[1] + r.depth,
      )
    const back = 1.2
    let px = cx + nx * back
    let pz = cz + nz * back
    if (!inRoom(px, pz)) {
      px = cx - nx * back
      pz = cz - nz * back
    }
    if (!inRoom(px, pz)) continue
    out.push({ id: op.id, pos: [px, pz], yaw: Math.atan2(-(cx - px), -(cz - pz)) })
  }
  return out
})
console.log(`${poses.length} door pose(s) derived from the walked storey\n`)

// OUT=<dir> also captures a frame at each door, because `nearbyDoorId` being
// right does NOT prove the user sees an affordance — WALK-AIM-PROMPT was exactly
// that failure.
const SHOT_DIR = process.env.OUT || ''
if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true })

let hit = 0
const wrong = []
for (const p of poses) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[1], q.yaw)
  }, p)
  await new Promise((r) => setTimeout(r, 900))
  const near = await page.evaluate(() => window.__store.getState().nearbyDoorId)
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${p.id}.png` })
  const ok = near === p.id
  if (ok) hit++
  else wrong.push(`${p.id} -> ${near ?? 'null'}`)
  console.log(`  ${ok ? 'OK  ' : 'MISS'} ${p.id.padEnd(18)} nearbyDoorId=${near ?? 'null'}`)
}
console.log(`\n${hit}/${poses.length} doors interactable`)
if (wrong.length) console.log(`mismatches: ${wrong.join(' | ')}`)

await browser.close()
