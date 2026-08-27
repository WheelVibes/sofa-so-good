/**
 * What causes the OUTLIER frames?
 *
 * `maximum` sits near 11ms p90 but its max frame has been seen at 31ms, 67ms and
 * once 155ms. A p90 inside budget with occasional 4-10x spikes is what a user
 * feels as a stutter, so the outliers matter more than the average.
 *
 * Correlates each frame's cost against two suspects that are cheap to observe:
 *  - `gl.info.programs.length` — a shader COMPILE (a material swap, a new effect
 *    pass, a first-seen material) shows up as this growing on the spike frame;
 *  - whether a real planar mirror reflection is currently granted, which is a
 *    whole extra scene pass (MIRROR-RELEVANCE) and was observed swinging
 *    maximum's cost ~2ms between otherwise identical runs.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'maximum'
const DSF = Number(process.env.DSF || 2)
const SECONDS = Number(process.env.SECONDS || 25)
const SPIKE_MS = Number(process.env.SPIKE_MS || 18)

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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: DSF })
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
await page.evaluate(
  (h) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 6000))
await assertSceneAlive(page, 'after tier set')

await page.evaluate(() => {
  const gl = window.__three.gl
  const orig = gl.render
  window.__sp = { frames: [] }
  let bucket = 0
  gl.render = function (...a) {
    const t = performance.now()
    try {
      return orig.apply(this ?? gl, a)
    } finally {
      bucket += performance.now() - t
    }
  }
  const isReflector = (m) => !!m?.uniforms?.textureMatrix
  const tick = () => {
    if (bucket > 0) {
      let mirrors = 0
      window.__three.scene.traverse((o) => {
        if (o.isMesh && isReflector(o.material)) mirrors++
      })
      window.__sp.frames.push({
        ms: +bucket.toFixed(2),
        programs: gl.info.programs?.length ?? -1,
        mirrors,
        calls: gl.info.render.calls,
      })
      bucket = 0
    }
    window.__sp.raf = requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// Census of distinct material instances, and how many are shadow-receiving /
// transmissive. The wall reveal must clone a material PER MESH on first fade (a
// room's walls share one finish material, so fading in place would fade them
// all — WALL-REVEAL-ANGLE-GRADED), and a fresh material is a fresh program. If
// ~25 materials appear across the first gesture, that is the +25 compiles.
const census = () =>
  page.evaluate(() => {
    const ids = new Set()
    let transmissive = 0
    window.__three.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        ids.add(m.uuid)
        if (m.transmission > 0) transmissive++
      }
    })
    // Count the LIGHTS too: their number is baked into every lit material's
    // program cache key, so a change here recompiles the whole scene.
    let point = 0
    let spot = 0
    window.__three.scene.traverse((o) => {
      if (o.isPointLight) point++
      else if (o.isSpotLight) spot++
    })
    return {
      materials: ids.size,
      transmissive,
      point,
      spot,
      lightsMode: window.__store.getState().lightsMode,
      programs: window.__three.gl.info.programs?.length ?? -1,
    }
  })
const before = await census()

// Snapshot the program list so the NEW programs can be named after the gesture.
// three's `info.programs` entries carry a `cacheKey` — the exact parameter string
// the program was compiled for — which turns "+25 compiled" from a number into a
// list of what actually recompiled and why.
await page.evaluate(() => {
  window.__progBefore = new Set((window.__three.gl.info.programs || []).map((p) => p.cacheKey))
})

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2
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

const newPrograms = await page.evaluate(() => {
  const out = []
  for (const p of window.__three.gl.info.programs || []) {
    if (!window.__progBefore.has(p.cacheKey)) out.push(p.cacheKey)
  }
  return out
})

const after = await census()
console.log(`\nNEW programs compiled during the gesture: ${newPrograms.length}`)
// Name the CHANGED parameter rather than eyeballing the blob: for each new key,
// find the pre-existing key it is closest to (fewest differing comma-separated
// fields) and report which field indices differ. A single recurring index across
// all 29 is the parameter that flipped.
const diffTally = await page.evaluate((news) => {
  const olds = [...window.__progBefore]
  const tally = {}
  const examples = {}
  for (const nk of news) {
    const nf = nk.split(',')
    let best = null
    let bestDiff = null
    for (const ok of olds) {
      const of = ok.split(',')
      if (of.length !== nf.length) continue
      const d = []
      for (let i = 0; i < nf.length; i++) if (nf[i] !== of[i]) d.push(i)
      if (!bestDiff || d.length < bestDiff.length) {
        bestDiff = d
        best = of
      }
    }
    if (!bestDiff) continue
    const sig = bestDiff.join('+')
    tally[sig] = (tally[sig] || 0) + 1
    if (!examples[sig]) examples[sig] = bestDiff.map((i) => `field[${i}]: ${best[i]} -> ${nf[i]}`)
  }
  return { tally, examples }
}, newPrograms)
for (const [sig, n] of Object.entries(diffTally.tally)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)) {
  console.log(`  ${n} program(s) differ only at field(s) ${sig || '(none)'}`)
  for (const line of diffTally.examples[sig] || []) console.log(`      ${line}`)
}
console.log(
  `lights — before: ${before.point} point + ${before.spot} spot (lightsMode ${before.lightsMode})   after: ${after.point} point + ${after.spot} spot`,
)
console.log(
  `material census — before gesture: ${before.materials} materials / ${before.programs} programs` +
    `   after: ${after.materials} materials / ${after.programs} programs` +
    `   (+${after.materials - before.materials} materials, +${after.programs - before.programs} programs)`,
)

const r = await page.evaluate(() => {
  cancelAnimationFrame(window.__sp.raf)
  return window.__sp.frames
})
const sorted = r.map((f) => f.ms).sort((a, b) => a - b)
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
console.log(
  `tier=${TIER} frames=${r.length}  p50=${q(0.5)}ms p90=${q(0.9)}ms p99=${q(0.99)}ms max=${sorted[sorted.length - 1]}ms`,
)
const mirrorOn = r.filter((f) => f.mirrors > 0)
console.log(`frames with a real mirror reflection: ${mirrorOn.length}/${r.length}`)
if (mirrorOn.length && mirrorOn.length < r.length) {
  const avg = (a) => a.reduce((s, f) => s + f.ms, 0) / a.length
  console.log(
    `  avg cost WITH mirror = ${avg(mirrorOn).toFixed(2)}ms   WITHOUT = ${avg(r.filter((f) => f.mirrors === 0)).toFixed(2)}ms`,
  )
}
const spikes = r.map((f, k) => ({ k, ...f })).filter((f) => f.ms >= SPIKE_MS)
console.log(`\nspikes >= ${SPIKE_MS}ms: ${spikes.length}`)
for (const s of spikes.slice(0, 12)) {
  const prev = r[s.k - 1]
  const dProg = prev ? s.programs - prev.programs : 0
  console.log(
    `  frame ${String(s.k).padStart(4)}  ${String(s.ms).padStart(7)}ms  programs=${s.programs}${dProg ? ` (+${dProg} COMPILED)` : ''}  mirrors=${s.mirrors}  drawcalls=${s.calls}`,
  )
}
const compileSpikes = spikes.filter((s) => r[s.k - 1] && s.programs > r[s.k - 1].programs).length
console.log(`\nspikes coinciding with a shader compile: ${compileSpikes}/${spikes.length}`)
await browser.close()
