/**
 * DEFAULT-GLOOM — how dark is the flat in its OUT-OF-BOX state, and which default causes it?
 *
 * A 24-frame discovery contact sheet came back overwhelmingly dark-grey interiors at 13:00.
 * That is NOT a tier artefact — a verified-state probe (medium, IBL on, exposure 1.38,
 * 13:00 manual, confirmed stable across 24 teleports) reproduces it exactly, so the frames are
 * honest. The flat simply ships with three separately-defensible defaults that COMPOUND:
 *   · `lightsMode` defaults to **off** (documented in NIGHT-LIGHT-BUDGET — a zero point-light
 *     census "reads as a broken light system and is simply the switch being off"),
 *   · curtains ship **drawn** (WINDOW-TIME-INVARIANT, v0.31.5.44),
 *   · interior doors ship **closed**.
 *
 * This measures each one's contribution at the SAME poses, one variable at a time
 * (meta-rule xvi), so "the flat looks gloomy" becomes a number a product decision can use
 * rather than an impression.
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

const OUTDIR = process.env.OUT || '/tmp/default-gloom'
fs.mkdirSync(OUTDIR, { recursive: true })

const rooms = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const out = []
  for (const id of Object.keys(ROOMS)) {
    if (!/bath1|livingDining|mainBedroom|kitchen/i.test(id)) continue
    const shell = getRoomEditorShell(plan, id)?.shell
    if (shell?.center) out.push({ id, pos: [shell.center[0], 1.6, shell.center[1]] })
  }
  return out
})

const capture = async (room, label) => {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.pos[0], q.pos[2], 0)
  }, room)
  await new Promise((r) => setTimeout(r, 900))
  const p = `${OUTDIR}/${room.id}-${label}.png`
  fs.writeFileSync(p, await page.screenshot({ type: 'png' }))
  return p
}

const ARMS = [
  ['default', async () => {}],
  [
    'lightson',
    async () => {
      await page.evaluate(() => window.__store.getState().setLightsMode?.('on'))
    },
  ],
  [
    'lights+curtains',
    async () => {
      await page.evaluate(() => {
        const st = window.__store.getState()
        st.setLightsMode?.('on')
        for (const it of st.items ?? []) {
          if (it.defId === 'curtains' || it.defId === 'roller-blind') st.toggleWindowFixture(it.id)
        }
      })
    },
  ],
]

const results = {}
for (const [label, apply] of ARMS) {
  await apply()
  await new Promise((r) => setTimeout(r, 1600))
  const state = await page.evaluate(() => ({
    lights: window.__store.getState().lightsMode,
    tier: window.__store.getState().qualityTier,
  }))
  results[label] = { state, files: [] }
  for (const room of rooms) results[label].files.push(await capture(room, label))
  console.log(`arm ${label.padEnd(16)} lightsMode=${state.lights} tier=${state.tier}`)
}

console.log(`\nframes -> ${OUTDIR}`)
await browser.close()
