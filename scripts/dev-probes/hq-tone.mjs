/**
 * HQ-TONE — does the path-traced still actually use the app's view transform?
 *
 * HQ-TONE-MATCH (v0.31.5.36) stopped `hqRenderSession` hardcoding ACES Filmic +
 * exposure 1 and routed it through the same `TONE_MAPPING_THREE` registry and live
 * `gl.toneMappingExposure` the viewport uses. That shipped verified by UNIT TESTS AND
 * READING ONLY — never by a rendered before/after — which is exactly the gap meta-rule
 * (xxxix) is about: an output path can silently disagree with the viewport and nothing
 * on screen reveals it.
 *
 * Three arms in ONE run at one fixed walk pose, so the comparison is not a cross-run
 * lottery (meta-rule i):
 *   viewport  — what the user sees,
 *   hq-auto   — the still as the modal now requests it (resolved tone + live exposure),
 *   hq-filmic — the same still with `toneMapping: 'filmic'` forced, i.e. the PRE-FIX
 *               behaviour, as a control arm differing in exactly one variable (xvi).
 * If the fix is real, hq-auto tracks the viewport and hq-filmic clips visibly more.
 * If all three agree, the option never reached the renderer (meta-rule xxv).
 *
 * PT-BLANK-GUARD: the megakernel fails GLSL validation on some drivers and the canvas
 * comes back uniformly black or white. Every arm is checked for that signature FIRST —
 * a clipped-pixel number from a blank frame would be pure fiction.
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

const HQ_SAMPLES = Number(process.env.SAMPLES || 24)
const HQ_PX = Number(process.env.PX || 320)

// One deterministic pose: stand in the living/dining room, which has the window that
// makes highlight clipping a meaningful question at 09:00.
const pose = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  for (const id of Object.keys(ROOMS)) {
    if (!/living/i.test(id)) continue
    const shell = getRoomEditorShell(plan, id)?.shell
    if (shell?.center) return { id, pos: [shell.center[0], 1.6, shell.center[1]] }
  }
  return null
})
if (!pose) throw new Error('no living room found')

await page.evaluate(async (q) => {
  const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
  requestWalkTeleport(q.pos[0], q.pos[2], 0)
}, pose)
await new Promise((r) => setTimeout(r, 1500))

const src = await page.evaluate(async () => {
  const { getHqRenderSource } = await import('/src/scene/pathtrace/hqRenderSource.ts')
  const s = getHqRenderSource()
  return s
    ? { ok: true, exposure: s.gl.toneMappingExposure, tone: s.gl.toneMapping }
    : { ok: false }
})
console.log(`pose=${pose.id}  hqRenderSource=${src.ok ? 'present' : 'ABSENT'}`)
if (!src.ok) {
  console.log('HqRenderController never registered a source — cannot drive the HQ path.')
  await browser.close()
  process.exit(0)
}
console.log(`live gl.toneMappingExposure=${src.exposure}  gl.toneMapping=${src.tone}\n`)

/** Render one still and return it as a data URL, or the failure reason. */
async function hqStill(tone) {
  return await page.evaluate(
    async (args) => {
      const [{ createHqRenderSession }, { getHqRenderSource }, { resolveToneMapping }] =
        await Promise.all([
          import('/src/scene/pathtrace/hqRenderSession.ts'),
          import('/src/scene/pathtrace/hqRenderSource.ts'),
          import('/src/scene/toneContext.ts'),
        ])
      const s = getHqRenderSource()
      if (!s) return { error: 'no source' }
      // Resolve exactly as HqRenderModal does, so this measures the SHIPPED policy
      // and not a hand-picked operator (meta-rule xxxvii).
      const setting = window.__store.getState().toneMapping
      const resolved =
        args.tone ?? resolveToneMapping(setting, { photoMode: true, finishPreview: false })
      let session = null
      try {
        session = await createHqRenderSession(s.scene, s.camera, {
          width: args.px,
          height: args.px,
          maxSamples: args.samples,
          denoise: false,
          toneMapping: resolved,
          exposure: s.gl.toneMappingExposure,
        })
        // The session does NOT auto-start: `createHqRenderSession` builds the tracer
        // and `start()` kicks the rAF accumulation loop. Omitting it leaves samples at
        // 0 and `toDataURL()` returns a fully transparent canvas — which reads exactly
        // like the PT-BLANK-GUARD driver failure and is not one (meta-rule iv: prove
        // the mutation landed; a blank frame is a broken CALL before it is a broken GPU).
        session.start()
        // Poll accumulation rather than racing onDone — a tiny sample count can
        // finish before the callback is even wired up.
        const deadline = Date.now() + 60000
        while (session.samples < args.samples && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 200))
        }
        const url = session.toDataURL()
        const samples = session.samples
        session.dispose()
        return { url, resolved, samples, exposure: s.gl.toneMappingExposure }
      } catch (e) {
        try {
          session?.dispose()
        } catch {}
        return { error: String(e?.message ?? e), resolved }
      }
    },
    { px: HQ_PX, samples: HQ_SAMPLES, tone },
  )
}

fs.mkdirSync('/tmp/hq-tone', { recursive: true })
fs.writeFileSync('/tmp/hq-tone/viewport.png', await page.screenshot({ type: 'png' }))

for (const [label, tone] of [
  ['hq-auto', null],
  ['hq-filmic', 'filmic'],
]) {
  const out = await hqStill(tone)
  if (out.error) {
    console.log(`${label.padEnd(10)} FAILED: ${out.error}`)
    continue
  }
  const b64 = out.url.split(',')[1]
  fs.writeFileSync(`/tmp/hq-tone/${label}.png`, Buffer.from(b64, 'base64'))
  console.log(
    `${label.padEnd(10)} ok — tone=${out.resolved} exposure=${out.exposure} samples=${out.samples}`,
  )
}

console.log('\nframes -> /tmp/hq-tone')
await browser.close()
