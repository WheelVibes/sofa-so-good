/**
 * BATH-TILE-SIZE — what resolution is the bathroom tile ACTUALLY rendered at?
 *
 * PROCEDURAL-BAKE-STALE (v0.31.5.35) claimed 512-capped patterns render at quarter
 * resolution because the first bake happens at a low tier and is never regenerated.
 * Every attempt to confirm it from the CACHE was inconclusive: `getBuiltMaterial(id)`
 * returns a material that is NOT the instance bound to any mesh (the wall reveal clones
 * materials per mesh, so uuids cannot match), and a whole-scene texture histogram cannot
 * say WHICH def a 256-square map belongs to. Both are lookups past the thing in question.
 *
 * So ask the rendered scene: stand in the bathroom, raycast the walls, and read the map
 * off the material three is actually drawing with. `should` comes from the app's own
 * `effectivePatternSize` for the room's default finish, so the comparison cannot drift
 * from the generator. Also saves a frame per pose — the tile joint is a visual question
 * and a resolution number is not a substitute for looking at it (meta-rule xxviii).
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

// Stand in each wet room, using the app's OWN room geometry (same source as walk-tour).
const rooms = await page.evaluate(async () => {
  const [{ ROOMS }, { getRoomEditorShell }] = await Promise.all([
    import('/src/apartment/constants.ts'),
    import('/src/scene/roomEditorShell.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const out = []
  for (const id of Object.keys(ROOMS)) {
    if (!/bath|kitchen/.test(id)) continue
    const shell = getRoomEditorShell(plan, id)?.shell
    if (!shell?.center) continue
    out.push({ id, pos: [shell.center[0], 1.6, shell.center[1]] })
  }
  return out
})

// What the generator says each room's default finish SHOULD bake at.
const expected = await page.evaluate(async () => {
  const [gen, cat] = await Promise.all([
    import('/src/materials/procedural/generators.ts'),
    import('/src/materials/builtinCatalog.ts'),
  ])
  const catalog = cat.BUILTIN_MATERIALS ?? cat.default ?? {}
  const out = {}
  for (const id of ['wall-tile-white', 'floor-tile-beige']) {
    const def = catalog[id]
    if (def?.kind === 'procedural')
      out[id] = { pattern: def.pattern, should: gen.effectivePatternSize(def.pattern) }
  }
  return { base: gen.getProceduralBaseSize(), out }
})

console.log(`tier=${TIER}  getProceduralBaseSize()=${expected.base}`)
for (const [id, v] of Object.entries(expected.out)) {
  console.log(`  ${id} (${v.pattern}) should bake at ${v.should}`)
}
console.log('')

// Four yaws per room — a single facing is a lottery (walk-tour's lesson).
const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

for (const room of rooms) {
  for (let i = 0; i < YAWS.length; i++) {
    await page.evaluate(
      async (q) => {
        const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
        requestWalkTeleport(q.pos[0], q.pos[2], q.yaw)
      },
      { ...room, yaw: YAWS[i] },
    )
    await new Promise((r) => setTimeout(r, 900))

    // Raycast a grid; keep near-vertical hits (walls) and low near-horizontal ones (floor),
    // and read the map size off the material three is actually drawing with.
    const hits = await page.evaluate(async () => {
      const [cache, cat] = await Promise.all([
        import('/src/materials/cache.ts'),
        import('/src/materials/builtinCatalog.ts'),
      ])
      const catalog = cat.BUILTIN_MATERIALS ?? cat.default ?? {}
      // Identify by TEXTURE uuid: materials get cloned by the wall reveal, textures do not.
      // BOTH generations: the adaptive ladder passes through `performance`, so the app
      // builds an @256 copy of every 512-capped pattern alongside the @512 one, and a
      // mesh may be bound to either. Registering only the current one mislabels the other.
      const gen = await import('/src/materials/procedural/generators.ts')
      const known = new Map()
      const base = gen.getProceduralBaseSize()
      for (const px of [512, 256]) {
        gen.setProceduralBaseSize(px)
        for (const id of ['wall-tile-white', 'floor-tile-beige', 'floor-tile-bath-green']) {
          const def = catalog[id]
          if (def?.kind !== 'procedural') continue
          const m = cache.buildMaterial(def)
          if (m?.map) known.set(m.map.uuid, `${id}@${m.map.image?.width ?? '?'}`)
        }
      }
      gen.setProceduralBaseSize(base)
      const { scene, camera } = window.__three
      const THREE = window.__three
      const rc = new THREE.raycaster.constructor()
      const n = new camera.position.constructor()
      const acc = new Map()
      for (let j = 0; j < 12; j++) {
        for (let k = 0; k < 12; k++) {
          rc.setFromCamera({ x: ((k + 0.5) / 12) * 2 - 1, y: 1 - ((j + 0.5) / 12) * 2 }, camera)
          const r = rc.intersectObjects(scene.children, true)
          const h = r.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
          if (!h?.face) continue
          const m = h.object.material
          if (!m?.map?.image) continue
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          const kind = Math.abs(n.y) < 0.3 ? 'wall' : h.point.y < 0.5 ? 'floor' : 'other'
          if (kind === 'other') continue
          const who = known.get(m.map.uuid) ?? 'OTHER'
          // A wall-reveal fade swaps the mesh onto a per-mesh CLONE. A clone taken before
          // the async worker upgrade lands keeps the 64-square preview textures forever,
          // so the tell-tale is a material that is not in the cache but carries the fade's
          // own polygonOffset/opacity fingerprint.
          const fp = `op=${m.opacity.toFixed(2)} tr=${m.transparent ? 1 : 0} po=${m.polygonOffset ? 1 : 0}`
          const key = `${kind}|${m.map.image.width}|${who}|${fp}`
          acc.set(key, (acc.get(key) ?? 0) + 1)
        }
      }
      return [...acc.entries()].sort((a, b) => b[1] - a[1])
    })

    // Is the material the wall is DRAWING with the same instance the cache holds?
    if (i === 0) {
      const ident = await page.evaluate(async () => {
        const [cache, cat] = await Promise.all([
          import('/src/materials/cache.ts'),
          import('/src/materials/builtinCatalog.ts'),
        ])
        const catalog = cat.BUILTIN_MATERIALS ?? cat.default ?? {}
        const { scene, camera } = window.__three
        const THREE = window.__three
        const rc = new THREE.raycaster.constructor()
        const n = new camera.position.constructor()
        rc.setFromCamera({ x: 0, y: 0 }, camera)
        const r = rc.intersectObjects(scene.children, true)
        let hit = null
        for (const o of r) {
          if (!o.object.visible || o.object.material?.colorWrite === false) continue
          if (!o.face || !o.object.material?.map?.image) continue
          n.copy(o.face.normal).transformDirection(o.object.matrixWorld)
          if (Math.abs(n.y) < 0.3) {
            hit = o
            break
          }
        }
        if (!hit) return { note: 'no wall hit' }
        const m = hit.object.material
        const built = cache.buildMaterial(catalog['wall-tile-white'])
        return {
          drawn: `${m.map.image.width}x${m.map.image.height}`,
          cached: built?.map?.image ? `${built.map.image.width}x${built.map.image.height}` : 'none',
          sameInstance: m === built,
          cacheEntries: cache.__getSurfaceMaterialCacheSizeForTest(),
        }
      })
      console.log(`  identity: ${JSON.stringify(ident)}`)
    }

    const label = `${room.id}-y${i}`
    fs.writeFileSync(`${OUT}/${label}.png`, await page.screenshot({ type: 'png' }))
    const summary = hits.map(([k, c]) => `${k} x${c}`).join('   ')
    console.log(`${label.padEnd(12)} ${summary || '(no textured hits)'}`)
  }
}

console.log(`\nframes -> ${OUT}`)
await browser.close()
