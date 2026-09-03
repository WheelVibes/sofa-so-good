/**
 * PROFILER-NOISE — is the profiler's instability in its MEASUREMENT or in its STEPS?
 *
 * PROFILER-UNSTABLE-BASELINE (v0.31.5.26) established that the dev profiler's baseline
 * frame for the same scene at the same settings reads anywhere from 12.73 to 46.44 ms,
 * while plain submit-time cost over the same sessions stays flat at 10.6-11.4 ms. Two
 * candidate causes were left open, and they need different fixes:
 *
 *   A. the MEASUREMENT primitive is noisy — then repeating it with nothing whatsoever
 *      changed will swing on its own, and the sweep steps are innocent;
 *   B. applying/restoring a quality override is what destabilises the pipeline (React
 *      re-render, material recompile, render-target reallocation) and `settleUntilStable`
 *      returns before that has finished — then the primitive is fine and the fix belongs
 *      in the step path.
 *
 * This isolates them by repeating `measureRenderMs` EXACTLY as `profilerEngine.ts`
 * implements it (RENDER_BATCH = 10 synchronous `advance` calls, one `ctx.finish()` per
 * batch, median of the batches — reproduced rather than imported because the function is
 * module-private) N times in a row with NO override applied and nothing else touched.
 * Nothing varies between iterations, so any spread IS the primitive's noise floor
 * (meta-rule xxiii: establish the noise floor by repeating the SAME arm first).
 *
 * It also reports the same N measurements at the two sample counts the engine uses —
 * quick (15) and full (60) — because if the spread collapses at 60 the settle/sample
 * budget is the lever rather than the method.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 21)
const TIER = process.env.TIER || 'realistic'
const OUT = process.env.OUT || '/tmp/ssg-night-lights'
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
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const REPEATS = Number(process.env.REPEATS || 10)

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3500))

// ProfilerProbe registers the bridge refs, and it only mounts when the devOnly
// `profiler` flag resolves — which needs Pro mode.
await page.evaluate(() => window.__store.getState().setUiMode('pro'))
await page.waitForFunction(() => !!window.__profiler, { timeout: 30000 })
await page.evaluate((m) => window.__store.getState().setLightsMode(m), process.env.LIGHTS || 'on')
await new Promise((r) => setTimeout(r, 2500))
await assertSceneAlive(page, 'profiler ready')

async function repeatMeasure(sampleFrames) {
  return page.evaluate(
    async ({ n, repeats }) => {
      const mod = await import('/src/dev/profiler/profilerBridge.ts')
      const refs = mod.profilerBridge.getRefs()
      if (!refs) return { error: 'no bridge refs' }
      const { advance, gl } = refs
      const ctx = gl.getContext()
      const RENDER_BATCH = 10
      // Byte-for-byte the engine's `measureRenderMs`.
      const measure = () => {
        const batches = Math.max(3, Math.ceil(n / RENDER_BATCH))
        const samples = []
        for (let b = 0; b < batches; b++) {
          const t0 = performance.now()
          for (let i = 0; i < RENDER_BATCH; i++) advance(performance.now(), true)
          ctx.finish()
          samples.push((performance.now() - t0) / RENDER_BATCH)
        }
        samples.sort((a, b) => a - b)
        return samples[Math.floor(samples.length / 2)] ?? 0
      }
      const out = []
      for (let i = 0; i < repeats; i++) out.push(+measure().toFixed(2))
      return { out }
    },
    { n: sampleFrames, repeats: REPEATS },
  )
}

console.log(`tier=${TIER} hour=${HOUR} — ${REPEATS} repeats of the engine's own measureRenderMs`)
console.log('NOTHING changes between iterations: no override, no store write, no remount.\n')

for (const [label, n] of [
  ['quick (15)', 15],
  ['full  (60)', 60],
]) {
  const r = await repeatMeasure(n)
  if (r.error) {
    console.log(`${label}: FAILED — ${r.error}`)
    continue
  }
  const v = r.out
  const min = Math.min(...v)
  const max = Math.max(...v)
  console.log(`${label}  ${v.join('  ')}`)
  console.log(
    `${' '.repeat(label.length)}  min ${min.toFixed(2)}  max ${max.toFixed(2)}  ` +
      `spread ${(max / min).toFixed(2)}x\n`,
  )
}
await browser.close()
