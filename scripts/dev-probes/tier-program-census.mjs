/**
 * TIER-PROGRAM-CENSUS — what the first live quality-tier switch actually compiles.
 *
 * Finding R1 (`docs/audit/interaction-sweep-2026-09-19.md`): the FIRST
 * `setQualityTier` burst in `orbit-tier-change-mid-drag` went from a 950-983 ms
 * ceiling (every pass v0.35.6.1 -> the 09-18 final) to **3283 ms**, while the SECOND
 * switch in the same clip still cost ~950 ms. The sweep recorder can only report
 * `renderer.info.programs.length` and the rAF delta — a COUNT and a STALL, which
 * cannot tell "more programs" from "slower programs". This probe reads the
 * program CACHE KEYS either side of the switch, so the burst can be attributed to
 * named shader variants rather than guessed at from a count.
 *
 * Same technique as the BACKDROP-WARMUP census documented in `ShaderWarmup.tsx`:
 * snapshot `gl.info.programs` (three exposes `cacheKey`, `name` and `usedTimes` on
 * each `WebGLProgram` wrapper), switch, snapshot again, diff by cacheKey. What it
 * adds over that one is the per-program COMPILE TIME: each added key is timed by
 * bracketing the switch with a rAF-delta recorder and reporting the worst stall
 * alongside the added-key count, so "23 programs took 3.3 s" is distinguishable
 * from "70 programs took 3.3 s".
 *
 * Usage:
 *   node scripts/dev-probes/tier-program-census.mjs
 *   FF='ceilingPlaster:off' node scripts/dev-probes/tier-program-census.mjs
 *   FROM=realistic TO=performance node scripts/dev-probes/tier-program-census.mjs
 *
 * `FF` is passed straight through as the app's `?ff=` override list, so a flag-off
 * arm is one env var. `SWITCHES=2` runs the second switch too (back to `FROM`),
 * which is the control the audit's own "the second switch still costs 950 ms"
 * observation needs.
 *
 * Prints one JSON object per switch on stdout plus a human summary on stderr.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const FROM = process.env.FROM || 'realistic'
const TO = process.env.TO || 'performance'
const FF = process.env.FF || ''
const SWITCHES = Number(process.env.SWITCHES || 1)
const HOUR = Number(process.env.HOUR || 12)
const DEVICE = process.env.DEVICE || 'capable'
const SETTLE_MS = Number(process.env.SETTLE_MS || 4000)
const ANGLE = process.env.ANGLE || 'metal'

/** Snapshot of three's program cache: every `cacheKey` plus its `name`, so the diff
 *  can be grouped by three's own shaderID (`name`) the way the BACKDROP-WARMUP census
 *  table in `ShaderWarmup.tsx` is. */
const SNAPSHOT = `(() => {
  const ps = window.__three?.gl?.info?.programs ?? []
  return ps.map((p) => ({ key: String(p.cacheKey ?? ''), name: String(p.name ?? ''), uses: p.usedTimes ?? 0 }))
})()`

/** A rAF-delta recorder, so the switch's worst main-thread stall is measured on the
 *  same axis the sweep recorder reports (`clip.json.samples[].raf`). */
const RAF_HOOK = `(() => {
  window.__censusRaf = { deltas: [], last: 0, on: true }
  const tick = (t) => {
    const r = window.__censusRaf
    if (!r || !r.on) return
    if (r.last) r.deltas.push(Math.round((t - r.last) * 100) / 100)
    r.last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** shaderID group for a program, falling back to the cache key's own leading token when
 *  three left `name` empty (a `customProgramCacheKey` material — `visLightmap:*`,
 *  `pom-floor-*`, `drape-translucency-*` — is exactly the case that matters here). */
function group(p) {
  if (p.name) return p.name
  const m = /^[a-zA-Z-]+/.exec(p.key)
  return m ? m[0] : '(unnamed)'
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    `--use-angle=${ANGLE}`,
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
  ],
})
try {
  const page = await browser.newPage()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  const url = FF ? `${appUrl()}${appUrl().includes('?') ? '&' : '?'}ff=${FF}` : appUrl()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.waitForFunction(() => !!window.__store, { timeout: 30000 })
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 120000 })
  // Pin the clock and the device class BEFORE the tier, so the adaptive ladder
  // cannot walk the tier out from under the measurement (the same gotcha the sweep
  // recorder's setup documents).
  await page.evaluate(
    (h, d) => {
      const st = window.__store.getState()
      st.setTimeMode('manual')
      st.setManualHour(h)
      if (st.setDeviceClass) {
        st.setDeviceClass(d)
        window.__store.setState({ setDeviceClass: () => {} })
      }
    },
    HOUR,
    DEVICE,
  )
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), FROM)
  await page.waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 90000 })
  await sleep(SETTLE_MS)
  await assertSceneAlive(page, 'tier-program-census boot')

  const results = []
  let tier = FROM
  for (let n = 0; n < SWITCHES; n++) {
    const next = tier === FROM ? TO : FROM
    const before = await page.evaluate(SNAPSHOT)
    await page.evaluate(RAF_HOOK)
    await sleep(300)
    const t0 = Date.now()
    await page.evaluate((t) => window.__store.getState().setQualityTier(t), next)
    await page
      .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 90000 })
      .catch(() => {})
    await sleep(SETTLE_MS)
    const wallMs = Date.now() - t0
    const deltas = await page.evaluate(() => {
      const r = window.__censusRaf
      if (r) r.on = false
      return r ? r.deltas : []
    })
    const after = await page.evaluate(SNAPSHOT)

    const beforeKeys = new Set(before.map((p) => p.key))
    const afterKeys = new Set(after.map((p) => p.key))
    const added = after.filter((p) => !beforeKeys.has(p.key))
    const removed = before.filter((p) => !afterKeys.has(p.key))
    const byGroup = {}
    for (const p of added) byGroup[group(p)] = (byGroup[group(p)] ?? 0) + 1

    const res = {
      switch: n + 1,
      from: tier,
      to: next,
      ff: FF,
      programsBefore: before.length,
      programsAfter: after.length,
      added: added.length,
      removed: removed.length,
      worstRafMs: deltas.length ? Math.max(...deltas) : null,
      stallSumMs: +deltas
        .filter((d) => d > 120)
        .reduce((a, b) => a + b, 0)
        .toFixed(1),
      wallMs,
      addedByGroup: byGroup,
      addedKeys: added.map((p) => ({ g: group(p), key: p.key.slice(0, 220) })),
    }
    results.push(res)
    console.error(
      `[census] ${tier}->${next} ff="${FF}" programs ${before.length}->${after.length} ` +
        `(+${added.length} -${removed.length}) worstRaf ${res.worstRafMs} ms ` +
        `stallSum ${res.stallSumMs} ms  groups ${JSON.stringify(byGroup)}`,
    )
    tier = next
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
