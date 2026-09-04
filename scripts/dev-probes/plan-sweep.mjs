/**
 * Does anything degrade on the plans nobody measures? — a discovery sweep.
 *
 * Every probe in this suite has only ever measured ONE plan: the default 4-room
 * HDB (9.2 x 9.8 m). The app ships nineteen starter plans up to the HDB Jumbo
 * (14.4 x 13.2 m, ~2.1x the area) and the landed Terrace (6.4 x 14 m, a long thin
 * footprint with a very different aspect ratio). Several shipped systems are
 * explicitly plan-size dependent and have never been exercised beyond the default:
 *
 *  - SHADOW-TEXEL: `shadowMapSizeForExtent` targets a constant ~20 mm world texel
 *    over the plan-fitted frustum, so a bigger plan climbs toward the tier ceiling.
 *  - Fixture lights: `lightsMode` lights every emitter (the old per-tier nearest-N
 *    cap is gone), so a bigger flat holds more emitters and pays more fill cost.
 *  - ORBIT-CEILING: `occluderRectsForPlan` builds one invisible shadow-caster per
 *    room footprint.
 *  - WALL-REVEAL-CORNER-SPREAD: adjacency work scales with wall count.
 *  - SKY-ANALYTIC-ORBIT: the new surround dome has a FIXED 400 m radius, which has
 *    to stay outside every plan and inside the camera far plane.
 *
 * For each plan this reports the structural counts those systems produce plus the
 * measured frame cost, so a regression shows up as a number that scales the wrong
 * way rather than as a vague suspicion. Plans are applied through the app's own
 * `setFloorPlan`, exactly as the template picker does.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'performance'
const HOUR = Number(process.env.HOUR || 13)
const SECONDS = Number(process.env.SECONDS || 6)
const OUT = process.env.OUT || '/tmp/ssg-plans'
fs.mkdirSync(OUT, { recursive: true })
const PLANS = (
  process.env.PLANS || 'tpl-hdb-4room,tpl-hdb-jumbo,tpl-terrace-ground,tpl-condo-penthouse'
).split(',')

const browser = await puppeteer.launch({
  headless: true,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
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
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = Math.round(box.x + box.w / 2)
const cy = Math.round(box.y + box.h / 2)

async function applyPlan(id) {
  const info = await page.evaluate(async (planId) => {
    const mod = await import('/src/floorplan/templates.ts')
    const tpl = mod.PLAN_TEMPLATES.find((t) => t.id === planId)
    if (!tpl) return null
    window.__store.getState().setFloorPlan(JSON.parse(JSON.stringify(tpl)))
    return { extent: tpl.extent, rooms: tpl.rooms?.length ?? 0, walls: tpl.walls?.length ?? 0 }
  }, id)
  if (!info) throw new Error(`no template ${id}`)
  // A plan swap rebuilds the whole shell and restreams furniture; give it room.
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 6000))
  await assertSceneAlive(page, `plan ${id}`)
  return info
}

/** Structural counts for every plan-size-dependent system. */
async function census() {
  return page.evaluate(() => {
    const scene = window.__three.scene
    let meshes = 0
    let occluders = 0
    let pointLights = 0
    let litPointLights = 0
    let sunMap = 0
    let sunIntensity = 0
    let domeRadius = null
    const mats = new Set()
    scene.traverse((o) => {
      if (o.isMesh) {
        meshes++
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) mats.add(m)
        const mm = Array.isArray(o.material) ? o.material[0] : o.material
        // CeilingOccluder: the only material with colorWrite false AND opacity 0.
        if (mm && mm.colorWrite === false && mm.opacity === 0) occluders++
        // The surround dome: a BackSide basic material on a big sphere.
        if (mm?.isMeshBasicMaterial && o.geometry?.parameters?.radius > 50)
          domeRadius = o.geometry.parameters.radius
      }
      if (o.isPointLight) {
        pointLights++
        if (o.intensity > 0) litPointLights++
      }
      if (o.isDirectionalLight) {
        sunMap = o.shadow?.mapSize?.x ?? 0
        sunIntensity = +o.intensity.toFixed(3)
      }
    })
    return {
      meshes,
      materials: mats.size,
      occluders,
      pointLights,
      litPointLights,
      sunMap,
      sunIntensity,
      domeRadius,
      items: window.__store.getState().items.length,
    }
  })
}

/** Frame cost over a real orbit drag — the same bucketing frame-time.mjs uses
 *  (the composer issues ~18 SIBLING render calls per displayed frame, so per-call
 *  timing reports the parts). */
async function cost() {
  await page.evaluate(() => {
    const gl = window.__three.gl
    if (gl.__psRestore) gl.__psRestore()
    const orig = gl.render.bind(gl)
    window.__ps = { ms: [], raf: 0, t0: performance.now() }
    let bucket = 0
    gl.render = (sc, cam) => {
      const t = performance.now()
      try {
        return orig(sc, cam)
      } finally {
        bucket += performance.now() - t
      }
    }
    gl.__psRestore = () => {
      gl.render = orig
    }
    const tick = () => {
      window.__ps.raf++
      if (bucket > 0) {
        window.__ps.ms.push(bucket)
        bucket = 0
      }
      window.__ps.rafId = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const t0 = Date.now()
  let i = 0
  while ((Date.now() - t0) / 1000 < SECONDS) {
    await page.mouse.move(cx + Math.sin(i / 10) * 250, cy + Math.cos(i / 14) * 85, { steps: 1 })
    await new Promise((r) => setTimeout(r, 8))
    i++
  }
  await page.mouse.up()
  return page.evaluate(() => {
    const f = window.__ps
    cancelAnimationFrame(f.rafId)
    window.__three.gl.__psRestore?.()
    const a = f.ms.slice().sort((x, y) => x - y)
    const q = (p) =>
      a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : -1
    return { p50: q(0.5), p90: q(0.9), max: +(a[a.length - 1] ?? -1).toFixed(1), n: a.length }
  })
}

console.log(`tier=${TIER} hour=${HOUR} — plan sweep (${SECONDS}s orbit drag each)\n`)
console.log(
  'plan                  extent        area  rooms items meshes mats occl lights(lit) sunMap  dome   p50    p90    max',
)
// Arm 0: the app AS BOOTED, before any `setFloorPlan`. Without it there is no way
// to tell a plan's own cost from the cost of having swapped the plan at all — and
// the first sweep measured 4.1 ms for `tpl-hdb-4room` where frame-time.mjs reports
// 8.4 ms at the same tier, which is either a swap regression or a difference
// between the shipped default plan and its template.
{
  fs.writeFileSync(`${OUT}/as-booted.png`, await page.screenshot({ type: 'png' }))
  const c0 = await census()
  const t0m = await cost()
  console.log(
    `${'(as booted, no swap)'.padEnd(21)} ${'-'.padEnd(12)} ${'-'.padStart(5)} ` +
      `${'-'.padStart(5)} ${String(c0.items).padStart(5)} ${String(c0.meshes).padStart(6)} ` +
      `${String(c0.materials).padStart(4)} ${String(c0.occluders).padStart(4)} ` +
      `${`${c0.pointLights}(${c0.litPointLights})`.padStart(11)} ${String(c0.sunMap).padStart(6)} ` +
      `${String(c0.domeRadius ?? '-').padStart(5)} ${String(t0m.p50).padStart(5)} ${String(t0m.p90).padStart(6)} ${String(t0m.max).padStart(6)}`,
  )
}
for (const id of PLANS) {
  const info = await applyPlan(id)
  fs.writeFileSync(`${OUT}/${id}.png`, await page.screenshot({ type: 'png' }))
  const c = await census()
  const t = await cost()
  const area = Math.round(info.extent[0] * info.extent[1])
  console.log(
    `${id.padEnd(21)} ${`${info.extent[0]}x${info.extent[1]}`.padEnd(12)} ${String(area).padStart(5)} ` +
      `${String(info.rooms).padStart(5)} ${String(c.items).padStart(5)} ${String(c.meshes).padStart(6)} ` +
      `${String(c.materials).padStart(4)} ${String(c.occluders).padStart(4)} ` +
      `${`${c.pointLights}(${c.litPointLights})`.padStart(11)} ${String(c.sunMap).padStart(6)} ` +
      `${String(c.domeRadius ?? '-').padStart(5)} ${String(t.p50).padStart(5)} ${String(t.p90).padStart(6)} ${String(t.max).padStart(6)}`,
  )
}
await browser.close()
