/**
 * REVEAL-STEP — how big is the opacity jump between walls that share a corner?
 *
 * TODO.md's oldest open rendering item: "adjacent walls settle at DIFFERENT fade opacities,
 * so a joint shows a hard step". That entry already records what it is NOT — a
 * single-layer-transparency stencil was built end-to-end and pixel-diffed on a real GPU,
 * and moved 94 pixels of a 1400x900 frame, so double-compositing is ruled out. Each wall's
 * fade depth comes from its OWN facing angle, so two walls meeting at a corner settle at
 * different opacities and step where they meet.
 *
 * The entry has no NUMBER, which makes it unfalsifiable and makes any future fix
 * unverifiable. This supplies one, using the app's own instruments rather than a
 * reinvention: `wallReveal.ts:getWallOpacity` for what each wall settled at, and
 * `wallRevealMath.ts:cornerNeighbors` for which walls actually share a corner. The metric
 * is the opacity STEP across each shared corner; the headline is the worst one and the
 * distribution behind it (a mean would hide exactly the bimodality that is the complaint —
 * meta-rule xv).
 *
 * Run in ORBIT at the boot framing, which is the default view every user lands on.
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

const out = await page.evaluate(async () => {
  const [{ getWallOpacity, getWallOwnStrength }, { cornerNeighbors }] = await Promise.all([
    import('/src/apartment/walls/wallReveal.ts'),
    import('/src/apartment/walls/wallRevealMath.ts'),
  ])
  const plan = window.__store.getState().floorPlan
  const walls = (plan.walls ?? []).map((w) => ({ id: w.id, start: w.start, end: w.end }))
  const nb = cornerNeighbors(walls)
  // Is the identical own-strength a bug, or the symmetric default pose? `facingToward`
  // dots the wall's OUTWARD normal with the CAMERA FORWARD, so at a 45-degree dollhouse
  // view the two visible facade directions give the same cosine. Compute it per wall with
  // the app's own function and the live camera before concluding anything (meta-rule xxv
  // has fired twice already and been innocent both times).
  const { facingToward } = await import('/src/apartment/walls/wallRevealMath.ts')
  const cam = window.__three.camera
  const fwd = new cam.position.constructor()
  cam.getWorldDirection(fwd)
  const toward = new Map()
  for (const w of walls) {
    const dx = w.end[0] - w.start[0]
    const dz = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dz) || 1
    // Outward normal candidates for a wall segment (sign unknown here); report both.
    const t1 = facingToward(fwd.x, fwd.z, -dz / len, dx / len)
    const t2 = facingToward(fwd.x, fwd.z, dz / len, -dx / len)
    toward.set(w.id, [+t1.toFixed(3), +t2.toFixed(3)])
  }
  const op = new Map(walls.map((w) => [w.id, getWallOpacity(w.id)]))
  const st = new Map(walls.map((w) => [w.id, getWallOwnStrength(w.id)]))
  const pairs = []
  const seen = new Set()
  for (const [id, others] of nb) {
    for (const o of others) {
      const key = id < o ? `${id}|${o}` : `${o}|${id}`
      if (seen.has(key)) continue
      seen.add(key)
      const a = op.get(id)
      const b = op.get(o)
      if (a == null || b == null) continue
      pairs.push({
        a: id,
        b: o,
        oa: +a.toFixed(3),
        ob: +b.toFixed(3),
        step: +Math.abs(a - b).toFixed(3),
      })
    }
  }
  pairs.sort((x, y) => y.step - x.step)
  return {
    walls: walls.length,
    corners: pairs.length,
    pairs: pairs.slice(0, 10),
    opacities: [...op.entries()].map(([k, v]) => [k, +v.toFixed(3)]),
    strengths: [...st.entries()].map(([k, v]) => [k, +v.toFixed(3)]),
    toward: [...toward.entries()],
    fwd: [+fwd.x.toFixed(3), +fwd.z.toFixed(3)],
  }
})

console.log(`${out.walls} walls, ${out.corners} shared corners\n`)
console.log('worst opacity steps across a shared corner:')
for (const p of out.pairs) {
  console.log(
    `  ${p.a.padEnd(16)} ${String(p.oa).padStart(5)}  vs  ${p.b.padEnd(16)} ${String(p.ob).padStart(5)}   step ${p.step}`,
  )
}
// The distribution matters more than the worst case: a step only reads as a hard band
// when BOTH walls are visible and their opacities are far apart.
const big = out.pairs.filter((p) => p.step > 0.25).length
console.log(`\ncorners with a step > 0.25: ${big} of ${out.corners}`)
// Own-strength vs settled opacity separates the two populations: a wall fading by its
// OWN facing has a non-zero own-strength, while one pulled along by corner spread has
// own-strength ~0. That distinction is what a fix has to act on.
const stMap = new Map(out.strengths)
console.log(`\ncamera forward XZ = ${JSON.stringify(out.fwd)} (equal magnitudes => 45-degree view)`)
const twMap = new Map(out.toward)
console.log('\nwall                     ownStrength  settledOpacity  toward(+/-normal)')
for (const [id, o] of out.opacities) {
  console.log(
    `  ${id.padEnd(24)} ${String(stMap.get(id) ?? '?').padStart(6)}      ${String(o).padEnd(6)}  ${JSON.stringify(twMap.get(id) ?? [])}`,
  )
}

fs.writeFileSync('/tmp/reveal-step.png', await page.screenshot({ type: 'png' }))
console.log('\nframe -> /tmp/reveal-step.png')
await browser.close()
