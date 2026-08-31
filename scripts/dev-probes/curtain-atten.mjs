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
 * SUN-CURTAIN-PLAN — is the sun attenuation derived from the LOADED plan?
 *
 * Loads a template, furnishes it, then reads the live `windowLightSignal`
 * attenuation with the plan's window fixtures OPEN and then CLOSED. A plan whose
 * windows the controller cannot see reports the same number for both.
 */
const TIER = process.env.TIER || 'medium'
const PLAN = process.env.PLAN || ''
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

const read = async (label) => {
  const v = await page.evaluate(async () => {
    const m = await import('/src/scene/lighting/windowLightSignal.ts')
    const st = window.__store.getState()
    const curtains = st.items.filter((i) => i.defId === 'curtains' || i.defId === 'roller-blind')
    return {
      atten: m.getWindowAttenuation(),
      curtains: curtains.length,
      props: JSON.stringify(curtains[0]?.props ?? {}),
    }
  })
  console.log(
    `  ${label.padEnd(16)} attenuation=${v.atten.toFixed(4)}  curtains=${v.curtains}  props=${v.props}`,
  )
  return v
}

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return { plan: st.floorPlan.id, viewLevelId: st.viewLevelId, items: st.items.length }
})
console.log(`resolved=${JSON.stringify(resolved)}\n`)

// The shipped templates carry no window treatments — `applyLayoutPreset('move-in')`
// placed 138 items on the maisonette and ZERO curtains, so the first run of this
// probe measured nothing at all (rule: check what the instrument ENUMERATES).
// Place one curtain per window using the app's OWN snap pair, the same one the
// 2D/3D placement commits use, so the geometry is the product's and not mine.
const placed = await page.evaluate(async () => {
  const { snapToNearestWindow, windowFixtureProps } = await import(
    '/src/furniture/placement/windowSnap.ts'
  )
  const st = window.__store.getState()
  const plan = st.floorPlan
  const walls = plan.walls
  const openings = plan.openings
  let n = 0
  for (const op of openings) {
    if (op.kind !== 'window') continue
    const w = walls.find((x) => x.id === op.wallId)
    if (!w) continue
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    if (!len) continue
    const ux = (w.end[0] - w.start[0]) / len
    const uz = (w.end[1] - w.start[1]) / len
    const t = op.offset + op.width / 2
    const point = [w.start[0] + ux * t, w.start[1] + uz * t]
    const snap = snapToNearestWindow(walls, openings, point)
    if (!snap) continue
    st.addItem({
      defId: 'curtains',
      position: snap.position,
      rotation: snap.rotation,
      props: { ...windowFixtureProps('curtains', snap.window, plan.ceilingHeight), draw: 0 },
    })
    n++
  }
  return n
})
console.log(`placed ${placed} curtain(s) on the plan's own windows\n`)
await new Promise((r) => setTimeout(r, 1500))

// Drive BOTH arms explicitly. The first version trusted the placement defaults
// for the "open" arm and read 0.5600 for open AND closed — a failed mutation:
// the curtains were already drawn, so nothing was being compared.
const setAll = async (props) => {
  await page.evaluate((pr) => {
    const st = window.__store.getState()
    for (const it of st.items) {
      if (it.defId !== 'curtains' && it.defId !== 'roller-blind') continue
      st.updateItemProps(it.id, pr)
    }
  }, props)
  await new Promise((r) => setTimeout(r, 1200))
}

await setAll({ draw: 0, style: 'open' })
const open = await read('curtains OPEN')
await setAll({ draw: 1, style: 'closed', material: 'blackout' })
const shut = await read('curtains CLOSED')

console.log(
  `\ndelta=${(open.atten - shut.atten).toFixed(4)}  ${shut.atten < open.atten - 1e-6 ? 'CURTAINS DIM THE SUN' : 'NO EFFECT'}`,
)
await browser.close()
