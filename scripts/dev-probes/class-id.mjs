/**
 * CLASS-ID — what ARE the two unnamed classes the coverage census found?
 *
 * `surface-coverage.mjs` ranked what a walk-mode user sees and two door-like classes came
 * to ~7% of the view between them — more than glass, more than the ceiling — but neither
 * was ever identified: `#c8bca8` (MeshPhysical, normalMap only, bbox 1.0 x 2.5 x 0.1) and
 * `#9aa0a6` (MeshPhysical, normalMap+roughnessMap, 0.8 x 2.1 x 0.1). The first is TALLER
 * than a door leaf and a metre wide, so calling it "a door" is an assumption, and
 * meta-rule (xvii) says an assumption is not evidence.
 *
 * This locates every instance in the scene and reports what would identify it: world
 * position and size, the ancestor chain, any `userData`, and whether the material is
 * identical (by uuid) to what `getMetalMaterial` / `getVinylMaterial` / `getPaintedMaterial`
 * return — the factories `Door.tsx` actually calls. Position then maps to the plan's own
 * openings and rooms, so the answer comes from the app rather than from the shape.
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

const OUTDIR = process.env.OUT || '/tmp/surface-coverage'
fs.mkdirSync(OUTDIR, { recursive: true })

const TARGETS = (process.env.COLOURS || 'c8bca8,9aa0a6,cfc8bd').split(',')

// Optional tier switch BEFORE the census: transmission is documented as High/Maximum only
// (`materialRealism.ts:transmissionTiers`), and a comment is not evidence that the gate fires
// (meta-rule xvii). Setting it here lets the same census run on both sides of the gate.
if (process.env.TIER) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), process.env.TIER)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))
  const got = await page.evaluate(() => window.__store.getState().qualityTier)
  console.log(`tier set to ${got}\n`)
}

const out = await page.evaluate(async (colours) => {
  const { getMetalMaterial, getVinylMaterial, getPaintedMaterial, getWoodMaterial } = await import(
    '/src/materials/furnitureMaterials.ts'
  )
  const plan = window.__store.getState().floorPlan
  const want = new Set(colours.map((c) => c.toLowerCase()))
  const found = []
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      const hex = m.color?.getHexString?.()
      if (!hex || !want.has(hex)) continue
      const g = o.geometry
      g?.computeBoundingBox?.()
      const bb = g?.boundingBox
      const p = new o.position.constructor()
      o.getWorldPosition(p)
      // Ancestor chain: r3f meshes have no names, but the CHAIN shape and any userData
      // keys still identify which component built it.
      const chain = []
      let q = o.parent
      let depth = 0
      while (q && depth < 6) {
        chain.push(
          `${q.type}${Object.keys(q.userData ?? {}).length ? `{${Object.keys(q.userData).join(',')}}` : ''}`,
        )
        q = q.parent
        depth += 1
      }
      found.push({
        hex,
        type: m.type.replace('Mesh', '').replace('Material', ''),
        pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        size: bb
          ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map(
              (v) => +v.toFixed(2),
            )
          : null,
        userData: Object.keys(o.userData ?? {}),
        chain: chain.join(' < '),
        rough: m.roughness != null ? +m.roughness.toFixed(2) : null,
        metal: m.metalness != null ? +m.metalness.toFixed(2) : null,
        // Glass needs its own fields: a pane that is merely TRANSPARENT tints, while one
        // with transmission actually refracts what is behind it (and costs a lot more).
        transmission: m.transmission != null ? +m.transmission.toFixed(2) : null,
        ior: m.ior != null ? +m.ior.toFixed(2) : null,
        thickness: m.thickness != null ? +m.thickness.toFixed(2) : null,
        opacity: m.opacity != null ? +m.opacity.toFixed(2) : null,
        transparent: !!m.transparent,
      })
    }
  })

  // Which factory produces a material with this exact uuid? Probe the ones Door.tsx uses.
  const factoryHits = {}
  for (const hex of colours) {
    const c = `#${hex}`
    factoryHits[hex] = {
      metal: getMetalMaterial(c, 'satin')?.color.getHexString(),
      vinyl: getVinylMaterial(c)?.color.getHexString(),
      painted: getPaintedMaterial(c)?.color.getHexString(),
      wood: getWoodMaterial(c, 2)?.color.getHexString(),
    }
  }

  // Where are the plan's openings, so a world position can be matched to one?
  const openings = []
  for (const op of plan.openings ?? []) {
    const w = (plan.walls ?? []).find((x) => x.id === op.wallId)
    if (!w) continue
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) || 1
    const t = op.offset + op.width / 2
    openings.push({
      id: op.id,
      kind: op.kind,
      at: [
        +(w.start[0] + ((w.end[0] - w.start[0]) / len) * t).toFixed(2),
        +(w.start[1] + ((w.end[1] - w.start[1]) / len) * t).toFixed(2),
      ],
    })
  }
  return { found, factoryHits, openings }
}, TARGETS)

console.log(`${out.found.length} mesh instance(s) matching ${TARGETS.join(', ')}\n`)
for (const f of out.found.slice(0, 14)) {
  // Nearest plan opening to this mesh — the strongest identifying signal available.
  let best = null
  let bestD = 1e9
  for (const op of out.openings) {
    const d = Math.hypot(op.at[0] - f.pos[0], op.at[1] - f.pos[2])
    if (d < bestD) {
      bestD = d
      best = op
    }
  }
  console.log(
    `#${f.hex} ${f.type.padEnd(9)} at [${f.pos.join(',')}] size ${JSON.stringify(f.size)} ` +
      `rough=${f.rough} metal=${f.metal} transmission=${f.transmission} ior=${f.ior} ` +
      `thickness=${f.thickness} opacity=${f.opacity} transparent=${f.transparent}`,
  )
  console.log(
    `   nearest opening: ${best ? `${best.id} (${best.kind}) d=${bestD.toFixed(2)}m` : 'none'}` +
      `   userData=[${f.userData.join(',')}]`,
  )
  console.log(`   chain: ${f.chain}`)
}
console.log(`\nfactory colours for the same hex: ${JSON.stringify(out.factoryHits)}`)
await browser.close()
