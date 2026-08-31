/**
 * PLAN-SHADOW-TEXEL — which shipped plans actually leave the 1024 shadow map?
 *
 * SHADOW-TEXEL replaced a literal per-tier `shadowMapSize` with a constant ~20 mm
 * world-space texel target over the plan-fitted frustum, and every number justifying it
 * was measured on the DEFAULT 4-room flat, where the answer is 1024 at every tier. The
 * note observes that a large custom plan scales up to its tier ceiling instead — a
 * regime nothing has ever looked at.
 *
 * Before probing frames, do the arithmetic on the shipped content (meta-rule xxxvi):
 * run every `PLAN_TEMPLATES` entry through the app's OWN `shadowFrustumForPlan` and
 * `shadowMapSizeForExtent` at each tier ceiling, and report the resulting texel size.
 * `wanted = 2*halfExtent / 0.02`, so 1024 is left only above halfExtent 10.24 m — a
 * plan spanning more than ~15.5 m. If no shipped plan crosses that, the whole scaling
 * regime is unreachable in shipped content and THAT is the finding.
 *
 * Needs no rendering, so it is cheap and deterministic — it only imports modules.
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

const rows = await page.evaluate(async () => {
  const [{ PLAN_TEMPLATES }, frustum] = await Promise.all([
    import('/src/floorplan/templates.ts'),
    import('/src/scene/lighting/shadowFrustum.ts'),
  ])
  const { shadowFrustumForPlan, shadowMapSizeForExtent, SHADOW_TEXEL_TARGET_M } = frustum
  // performance has ceiling 0 (shadows off) so it is not a texel question.
  const CEIL = { medium: 1024, high: 2048, maximum: 4096 }
  const out = []
  for (const plan of PLAN_TEMPLATES) {
    const { halfExtent } = shadowFrustumForPlan(plan)
    const per = {}
    for (const [tier, max] of Object.entries(CEIL)) {
      const size = shadowMapSizeForExtent(halfExtent, max)
      per[tier] = { size, texelMm: size > 0 ? ((2 * halfExtent) / size) * 1000 : 0 }
    }
    // 18 of 19 landing exactly on MIN_HALF is the meta-rule (xxv) signature, so report
    // the RAW bounds and the plan's own declared extent alongside — if the bounds are
    // degenerate while `extent` is large, the frustum never saw the plan's geometry.
    const b = frustum.planShadowBounds(plan)
    out.push({
      id: plan.id,
      halfExtent,
      per,
      span: [b.maxX - b.minX, b.maxZ - b.minZ],
      extent: plan.extent,
      walls: plan.walls?.length ?? 0,
      rooms: plan.rooms?.length ?? 0,
    })
  }
  // The shipped plans all clamp at MIN_HALF, so the SCALING regime can only be reached
  // by a user-drawn plan. Probe it with synthetic square plans at representative sizes
  // (the floorplan editor imposes no such limit), using the same two pure functions.
  const synth = []
  for (const side of [16, 20, 30, 40, 60, 90]) {
    const plan = {
      id: `synthetic-${side}m`,
      extent: [side, side],
      walls: [
        { start: [0, 0], end: [side, 0] },
        { start: [side, 0], end: [side, side] },
        { start: [side, side], end: [0, side] },
        { start: [0, side], end: [0, 0] },
      ],
      rooms: [],
    }
    const { halfExtent } = shadowFrustumForPlan(plan)
    const per = {}
    for (const [tier, max] of Object.entries(CEIL)) {
      const size = shadowMapSizeForExtent(halfExtent, max)
      per[tier] = { size, texelMm: size > 0 ? ((2 * halfExtent) / size) * 1000 : 0 }
    }
    synth.push({ id: plan.id, halfExtent, per })
  }
  return { rows: out, synth, target: SHADOW_TEXEL_TARGET_M * 1000 }
})

console.log(`target texel = ${rows.target} mm; 1024 is left above halfExtent 10.24 m\n`)
console.log('plan                       walls/rooms    spanX x spanZ     extent          half')
for (const r of rows.rows) {
  console.log(
    `${r.id.padEnd(24)} ${String(r.walls).padStart(3)}/${String(r.rooms).padEnd(4)} ` +
      `${r.span[0].toFixed(1).padStart(6)} x ${r.span[1].toFixed(1).padEnd(7)} ` +
      `${JSON.stringify(r.extent).padEnd(14)} ${r.halfExtent.toFixed(2)}`,
  )
}

console.log('plan                                half   medium        high          maximum')
for (const r of rows.rows.sort((a, b) => a.halfExtent - b.halfExtent)) {
  const cell = (t) => `${String(r.per[t].size).padStart(4)}/${r.per[t].texelMm.toFixed(1)}mm`
  console.log(
    `${r.id.padEnd(34)} ${r.halfExtent.toFixed(2).padStart(5)}  ` +
      `${cell('medium').padEnd(13)} ${cell('high').padEnd(13)} ${cell('maximum')}`,
  )
}

const scaling = rows.rows.filter((r) => r.per.maximum.size > 1024)
console.log(`\n${scaling.length} of ${rows.rows.length} shipped plans scale past 1024 at maximum`)
if (scaling.length) console.log(`  ${scaling.map((r) => r.id).join(', ')}`)
const overTarget = rows.rows.filter((r) => r.per.maximum.texelMm > rows.target + 0.5)
console.log(`${overTarget.length} miss the ${rows.target} mm target at maximum`)
if (overTarget.length) {
  for (const r of overTarget) console.log(`  ${r.id}: ${r.per.maximum.texelMm.toFixed(1)} mm`)
}
const mediumMiss = rows.rows.filter((r) => r.per.medium.texelMm > rows.target + 0.5)
console.log(`${mediumMiss.length} miss it at MEDIUM (ceiling 1024 cannot scale)`)
for (const r of mediumMiss) console.log(`  ${r.id}: ${r.per.medium.texelMm.toFixed(1)} mm`)
await browser.close()

console.log('\n--- SYNTHETIC custom plans (the regime shipped content cannot reach) ---')
console.log('plan                     half   medium         high           maximum')
for (const r of rows.synth) {
  const cell = (t) => `${String(r.per[t].size).padStart(4)}/${r.per[t].texelMm.toFixed(1)}mm`
  console.log(
    `${r.id.padEnd(22)} ${r.halfExtent.toFixed(2).padStart(6)}  ` +
      `${cell('medium').padEnd(14)} ${cell('high').padEnd(14)} ${cell('maximum')}`,
  )
}
