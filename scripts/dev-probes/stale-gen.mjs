/**
 * STALE-GEN — WHICH textures change size on a tier change, and what are they?
 *
 * `bake-size.mjs` reports a size histogram, and a histogram cannot say which def a
 * 256-square map belongs to (meta-rule xl — reading one as "every 512-capped pattern is
 * at quarter resolution" is exactly how PROCEDURAL-BAKE-STALE got its headline wrong).
 * Post-WALL-FACE-CLONE-STALE the residual is precise: 12 textures move from 256 to 512
 * between Medium and Maximum, at a tier where `getProceduralBaseSize()` is 512 either
 * way — so `effectivePatternSize` cannot explain it and something else must.
 *
 * This names them. Every bound texture is labelled by uuid against the material the
 * app's OWN cache builds for each procedural def, at BOTH generations (`@512` and
 * `@256`), so a mesh bound to the stale generation is identified as such rather than
 * lumped into a bucket. Anything still unlabelled is reported with its mesh geometry so
 * a non-cache path (POM builds its own maps, and only at High/Maximum) is visible as
 * itself instead of being mistaken for staleness.
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

/** Label every texture the material cache can account for, at BOTH generations. */
const LABEL_AND_CENSUS = async () => {
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
  const seen = new Set()
  window.__three.scene.traverse((o) => {
    const m = o.material
    if (!m) return
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) {
      const t = m[k]
      const img = t?.image
      if (!img || seen.has(t.uuid)) continue
      seen.add(t.uuid)
      const who = label.get(t.uuid)
      let key
      if (who) {
        key = `${who}`
      } else {
        // Unlabelled: describe the mesh so a non-cache path is identifiable.
        const g = o.geometry
        g?.computeBoundingBox?.()
        const bb = g?.boundingBox
        const sz = bb
          ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]
              .map((v) => v.toFixed(1))
              .join('x')
          : '?'
        key = `UNLABELLED ${m.type} bbox=${sz} slot=${k}`
      }
      const e = rows.get(key) ?? { n: 0, sizes: new Set() }
      e.n += 1
      e.sizes.add(`${img.width}x${img.height}`)
      rows.set(key, e)
    }
  })
  return {
    tier: window.__store.getState().qualityTier,
    base: gen.getProceduralBaseSize(),
    rows: [...rows.entries()].map(([k, v]) => [k, v.n, [...v.sizes].join(',')]),
  }
}

async function census(label) {
  const out = await page.evaluate(LABEL_AND_CENSUS)
  console.log(`\n=== ${label} — tier=${out.tier} base=${out.base} ===`)
  for (const [k, n, sizes] of out.rows.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    console.log(`  ${k.padEnd(52)} x${String(n).padEnd(3)} ${sizes}`)
  }
  return out
}

const a = await census('as booted')
await page.evaluate(() => window.__store.getState().setQualityTier('maximum'))
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 6000))
await assertSceneAlive(page, 'maximum')
const b = await census('after setTier maximum')

// The diff is the whole point: what appeared, vanished, or changed size.
const ma = new Map(a.rows.map(([k, n, s]) => [k, `${s} x${n}`]))
const mb = new Map(b.rows.map(([k, n, s]) => [k, `${s} x${n}`]))
console.log('\n=== DIFF medium -> maximum ===')
for (const k of new Set([...ma.keys(), ...mb.keys()])) {
  const va = ma.get(k) ?? '(absent)'
  const vb = mb.get(k) ?? '(absent)'
  if (va !== vb) console.log(`  ${k.padEnd(52)} ${va}  ->  ${vb}`)
}
await browser.close()
