/**
 * FADE-CLONE — is the wall-reveal fade clone stale, and is it even REACHABLE?
 *
 * `useWallReveal` swaps a fading wall onto a per-mesh CLONE. That clone was assumed
 * exempt from WALL-FACE-CLONE-STALE because it is "transient" — but it is not: the
 * clone is created on the FIRST fade and cached in a `fadeStateRef` WeakMap for the
 * mesh's lifetime, so a clone taken before the procedural worker upgrade lands would
 * hold the 64-square preview maps for every subsequent fade in the session. Orbit is
 * the default view mode and near walls fade by default, so that would be a default-look
 * defect.
 *
 * Two things have to be true for it to bite, and this measures BOTH rather than
 * assuming either: (a) something that fades must actually carry worker-swapped
 * textures — the default `wallRevealScope` is `exterior`, and WALL-FADE-OVERLAY-CULL
 * hides the interior face plane during a fade, so what remains visible may be a plain
 * wall body with no maps at all; and (b) that texture must be short.
 *
 * Reports every mid-fade mesh: whether it has a map, the map size, and which cached
 * generation it belongs to (labelled by TEXTURE uuid — meta-rule xl).
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

/** Census every mesh currently mid-fade (transparent, not yet opaque). */
const FADED = async () => {
  const [gen, cache, cat] = await Promise.all([
    import('/src/materials/procedural/generators.ts'),
    import('/src/materials/cache.ts'),
    import('/src/materials/builtinCatalog.ts'),
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
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        const t = m?.[k]
        if (t?.image) label.set(t.uuid, `${id}@${t.image.width}`)
      }
    }
  }
  gen.setProceduralBaseSize(base)

  const rows = new Map()
  let fading = 0
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m?.transparent || !(m.opacity < 0.999)) continue
      fading += 1
      const t = m.map
      const key = t?.image
        ? `map ${t.image.width}x${t.image.height} ${label.get(t.uuid) ?? 'UNLABELLED'}`
        : `NO MAP (${m.type} #${m.color?.getHexString?.() ?? '??'})`
      rows.set(key, (rows.get(key) ?? 0) + 1)
    }
  })
  return { fading, rows: [...rows.entries()].sort((a, b) => b[1] - a[1]) }
}

async function census(when) {
  const out = await page.evaluate(FADED)
  console.log(`\n--- ${when}: ${out.fading} mid-fade material(s) ---`)
  for (const [k, n] of out.rows) console.log(`   ${k.padEnd(52)} x${n}`)
  if (!out.rows.length) console.log('   (nothing fading)')
}

// At boot the orbit camera frames the dollhouse and near walls fade immediately —
// the exact window in which a clone could capture pre-upgrade textures.
await census('at boot framing')

// Then drive a real orbit drag so more walls cross the reveal threshold.
const box = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const r = c.getBoundingClientRect()
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
})
await page.mouse.move(box.cx, box.cy)
await page.mouse.down()
for (let i = 0; i < 40; i++) {
  await page.mouse.move(box.cx + i * 6, box.cy + (i % 2 === 0 ? 3 : -3))
  if (i === 20) await census('mid-drag')
}
await page.mouse.up()
await new Promise((r) => setTimeout(r, 500))
await census('just after drag')

fs.writeFileSync('/tmp/fade-clone.png', await page.screenshot({ type: 'png' }))
console.log('\nframe -> /tmp/fade-clone.png')
await browser.close()
