/**
 * WALL-CAP — how dark are the wall TOP CAPS at night, and is it a defect?
 *
 * Orbit culls the real ceiling, so every wall in the dollhouse view ends in a
 * horizontal, UP-FACING cap. In daylight those caps are the brightest thing in the
 * frame. At 21:00 with the fixtures on they render near-black, drawing a hard inked
 * lattice over the whole flat while the wall faces immediately below them are warm
 * and lit. That is arguably "physically correct" for an up-facing surface under a
 * night sky, but it is worth measuring before deciding.
 *
 * Screen points cannot be eyeballed for this (the caps are thin, and every probe
 * uses a slightly different pose — meta-rule xii). So the mask is GEOMETRIC: raycast
 * a dense screen grid, keep hits whose world normal points UP and whose hit point is
 * above `CAP_MIN_Y` (which excludes floors and worktops, the other up-facing
 * surfaces), and compare their rendered luminance against the VERTICAL wall pixels
 * in the very same frame. Both hours are measured in ONE run (meta-rule i), so the
 * day figure is a true reference rather than a remembered one.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'performance'

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
await page.evaluate(() => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(13)
})
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const HOURS = (process.env.HOURS || '13,21').split(',').map(Number)
const LIGHTS = process.env.LIGHTS || 'on'
const GRID_W = Number(process.env.GRID_W || 200)
const GRID_H = Number(process.env.GRID_H || 130)
/** Above any floor or worktop, below the wall top (walls are 2.6 m). */
const CAP_MIN_Y = Number(process.env.CAP_MIN_Y || 2.0)

await page.evaluate((m) => window.__store.getState().setLightsMode(m), LIGHTS)

/**
 * Classify every grid point by the world normal of what it hits, then read the
 * rendered pixel under it. Returns per-bucket mean luminance + sample counts.
 */
async function measure() {
  const hits = await page.evaluate(
    ({ gw, gh, capMinY }) => {
      const { scene, camera } = window.__three
      const THREE = window.__three
      const rc = new THREE.raycaster.constructor()
      const out = []
      const n = new camera.position.constructor()
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const x = (i + 0.5) / gw
          const y = (j + 0.5) / gh
          rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
          const r = rc.intersectObjects(scene.children, true)
          const h = r.find((k) => k.object.visible && k.object.material?.colorWrite !== false)
          if (!h?.face) continue
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          const g = h.object.geometry
          g.computeBoundingBox?.()
          const bb = g.boundingBox
          const sz = bb
            ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map(
                (v) => +v.toFixed(2),
              )
            : null
          out.push({
            x,
            y,
            ny: n.y,
            hy: h.point.y,
            mat: h.object.material?.type,
            col: h.object.material?.color ? `#${h.object.material.color.getHexString()}` : null,
            sz,
          })
        }
      }
      return { out, capMinY }
    },
    { gw: GRID_W, gh: GRID_H, capMinY: CAP_MIN_Y },
  )

  const shot = await page.screenshot({ type: 'png' })
  const sharp = (await import('sharp')).default
  const img = sharp(shot)
  const meta = await img.metadata()
  const raw = await img.raw().toBuffer()
  const ch = raw.length / (meta.width * meta.height)

  const buckets = { cap: [], wall: [] }
  /** Dark cap samples, kept with their geometry so a bimodal cap population can be
   *  NAMED rather than guessed at — the mean alone hid this entirely. */
  const darkCaps = new Map()
  for (const h of hits.out) {
    const px = Math.min(meta.width - 1, Math.floor(h.x * meta.width))
    const py = Math.min(meta.height - 1, Math.floor(h.y * meta.height))
    const o = (py * meta.width + px) * ch
    const lum = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2]
    if (h.ny > 0.9 && h.hy > CAP_MIN_Y) {
      buckets.cap.push(lum)
      if (lum < 40) {
        const k = `${h.mat} ${h.col} ${h.sz?.join('x')}`
        const e = darkCaps.get(k) ?? { n: 0, lum: 0 }
        e.n++
        e.lum += lum
        darkCaps.set(k, e)
      }
    } else if (Math.abs(h.ny) < 0.2) buckets.wall.push(lum)
  }
  const stat = (a) => {
    const s = a.slice().sort((x, y) => x - y)
    const q = (p) =>
      s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0
    return {
      n: a.length,
      mean: a.length ? +(a.reduce((t, v) => t + v, 0) / a.length).toFixed(1) : 0,
      p10: q(0.1),
      p50: q(0.5),
      p90: q(0.9),
      darkFrac: a.length ? +((a.filter((v) => v < 40).length / a.length) * 100).toFixed(1) : 0,
    }
  }
  return { cap: stat(buckets.cap), wall: stat(buckets.wall), darkCaps }
}

console.log(`orbit tier=${TIER} lightsMode=${LIGHTS}\n`)
console.log('hour   capN  capMean  p10   p50   p90  dark%   wallMean  cap/wall')
for (const h of HOURS) {
  await page.evaluate((hh) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(hh)
  }, h)
  await new Promise((r) => setTimeout(r, 3000))
  await assertSceneAlive(page, `hour ${h}`)
  const m = await measure()
  const ratio = m.wall.mean > 0 ? (m.cap.mean / m.wall.mean).toFixed(3) : 'n/a'
  console.log(
    `${String(h).padEnd(6)} ${String(m.cap.n).padStart(4)} ${String(m.cap.mean).padStart(8)} ` +
      `${String(m.cap.p10).padStart(5)} ${String(m.cap.p50).padStart(5)} ${String(m.cap.p90).padStart(5)} ` +
      `${String(m.cap.darkFrac).padStart(6)} ${String(m.wall.mean).padStart(10)}   ${ratio}`,
  )
  if (m.darkCaps.size) {
    for (const [k, v] of [...m.darkCaps.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6)) {
      console.log(
        `         dark cap x${String(v.n).padStart(3)} lum=${(v.lum / v.n).toFixed(1)} ${k}`,
      )
    }
  }
}

await browser.close()
