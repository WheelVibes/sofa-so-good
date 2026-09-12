/**
 * BROWSER-PARITY: the brief's Milestone 5 asks for an FPS benchmark AND visual
 * parity in Chrome and Firefox. `firefox-smoke.mjs` only ever proved Firefox can
 * boot the app (FIREFOX-SMOKE) — it has no Chromium counterpart in the same run
 * and no pixel comparison, so "parity" was never actually measured, only
 * asserted by eye. This is the one script that measures BOTH engines identically
 * on the REAL GPU and diffs their frames, closing the "Firefox: smoke only" row
 * in `docs/audit/photoreal-mission-gap-2026-09-07.md`.
 *
 * Same-instrument discipline, reused from this repo's other probes rather than
 * invented fresh:
 *  - Boot/dismiss/ready sequence: `firefox-smoke.mjs` (`window.__store`,
 *    `#boot-loader` gone, `sceneReady`, the `dismiss-overlays` eval).
 *  - Frame cost: `frame-time.mjs`'s `SYNC=1` **fence** completion method
 *    (FRAME-COST-FENCE) — `advance(now)` -> `fenceSync` -> poll
 *    `getSyncParameter(SYNC_STATUS)`/`clientWaitSync` via `setTimeout(0)` ->
 *    `deleteSync`. This is the only mode of the three in that file proven to
 *    survive the post composer and to actually wait on raster, not just submit.
 *  - `deviceClass` pinning + the `interactiveDegrade` flag: the playbook's
 *    "pin the ladder" recipe, so neither browser's frame is quietly rasterised
 *    at half the pixel ratio (`gl.getPixelRatio() 0.5` under a held long-frame
 *    degrade would make a real difference look like a browser difference).
 *  - The interior-crop luminance/saturation recipe: the mission-gap audit's
 *    "Look parity of the floored Realistic path" row (central-third rect,
 *    `crop.mjs`, Rec.709 luminance weights, HSV `(max-min)/max` saturation —
 *    same formula `chroma-audit.mjs` uses).
 *
 * CHROMIUM CHANNEL NOTE: no Playwright-bundled Chromium binary is installed in
 * this worktree (only `firefox`+`ffmpeg` are cached under
 * `~/Library/Caches/ms-playwright`), and installing one is out of scope for a
 * measurement task. `channel: 'chrome'` launches the system **Google Chrome**
 * instead, which IS Chromium — verified here to resolve the same
 * `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, …)` string the puppeteer-driven
 * probes get, so it is the real GPU path this task asks for, not a stand-in.
 *
 * Usage: `node scripts/dev-probes/browser-parity.mjs` — expects the probe dev
 * server already up (`SSG_URL`, default http://localhost:5200/, NEVER 5173).
 *   BROWSERS=chromium,firefox   (default; also accepts either alone)
 *   FRAMES=40                   driven frames measured per browser x mode
 */
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const IMG_DIFF = path.join(REPO_ROOT, 'scripts/dev-probes/img-diff.mjs')
const CROP = path.join(REPO_ROOT, 'scripts/crop.mjs')

const TARGET_URL = process.env.SSG_URL || process.env.URL || 'http://localhost:5200/'
const BROWSERS = (process.env.BROWSERS || 'chromium,firefox').split(',')
const MODES = ['performance', 'realistic']
const FRAMES = Number(process.env.FRAMES || 40)
const OUT_DIR = '/tmp/photoreal/parity'
// Central-third interior crop, 1280x800 @ dpr1 — the mission-gap audit's rect.
const CROP_RECT = { left: 427, top: 267, width: 426, height: 266 }

await mkdir(OUT_DIR, { recursive: true })

const pageErrors = [] // { browser, message }

/** Same eval as `firefox-smoke.mjs` / `photo-gtao-ab.json`'s "dismiss-overlays" step. */
function dismissOverlays() {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
  const s = window.__store.getState()
  s.endTour?.()
  s.setOnboardingOpen?.(false)
  s.dismissLocationPrompt?.()
}

/** Copy of `frame-time.mjs`'s `SYNC=1` fence-poll completion method, in isolation. */
async function measureFence(page, n) {
  return page.evaluate(async (frames) => {
    const three = window.__three
    const gl = three?.gl
    if (!gl || typeof three.advance !== 'function') return { error: 'no __three.advance' }
    const ctx = gl.getContext()
    const times = []
    const gaps = []
    let fenceFails = 0
    let glErrors = 0
    const fenceWait = (t0) =>
      new Promise((resolve) => {
        let s = null
        try {
          s = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0)
          ctx.flush()
        } catch {
          s = null
        }
        if (!s) {
          fenceFails++
          resolve(performance.now() - t0)
          return
        }
        // `lastEnd` marks when the previous "not yet" poll returned — the gap
        // between it and the poll that sees the signal is this mode's error term.
        let lastEnd = performance.now()
        const check = () => {
          const started = performance.now()
          const st = ctx.clientWaitSync(s, 0, 0)
          const done =
            st === ctx.ALREADY_SIGNALED ||
            st === ctx.CONDITION_SATISFIED ||
            st === ctx.WAIT_FAILED ||
            ctx.getSyncParameter(s, ctx.SYNC_STATUS) === ctx.SIGNALED
          if (!done) {
            lastEnd = performance.now()
            setTimeout(check, 0)
            return
          }
          const dt = performance.now() - t0
          gaps.push(started - lastEnd)
          ctx.deleteSync(s)
          if (ctx.getError() !== 0) glErrors++
          resolve(dt)
        }
        check()
      })
    for (let i = 0; i < frames; i++) {
      const now = await new Promise((r) => requestAnimationFrame(r))
      const t0 = performance.now()
      three.advance(now)
      const dt = await fenceWait(t0)
      times.push(dt)
    }
    const pct = (arr) => {
      const a = arr.slice().sort((x, y) => x - y)
      const q = (p) =>
        a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(2) : null
      return { p50: q(0.5), p90: q(0.9) }
    }
    const t = pct(times)
    const g = pct(gaps)
    return {
      n: times.length,
      p50: t.p50,
      p90: t.p90,
      gapP50: g.p50,
      gapMax: gaps.length ? +Math.max(...gaps).toFixed(2) : null,
      fenceFails,
      glErrors,
    }
  }, n)
}

async function bootBrowser(name) {
  const launch =
    name === 'chromium'
      ? () =>
          chromium.launch({
            headless: true,
            channel: 'chrome',
            args: [
              '--use-gl=angle',
              '--use-angle=metal',
              '--ignore-gpu-blocklist',
              '--enable-gpu-rasterization',
            ],
          })
      : () => firefox.launch({ headless: true })
  const browser = await launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push({ browser: name, message: e.message }))

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__store, { timeout: 30000 })
  await page
    .waitForFunction(
      () =>
        !document.querySelector('#boot-loader') ||
        getComputedStyle(document.querySelector('#boot-loader')).display === 'none',
      { timeout: 60000 },
    )
    .catch(() => {})
  await page.evaluate(dismissOverlays)
  await page.waitForFunction(() => window.__store.getState().sceneReady === true, {
    timeout: 90000,
  })

  // So both browsers render at full pixel ratio — a held interactive-degrade
  // hold on a slow headless renderer would otherwise halve one browser's DPR
  // and read as a "browser difference" that is actually the adaptive ladder.
  await page.evaluate(() => window.__store.getState().setFeatureFlag?.('interactiveDegrade', false))
  await page.evaluate(() => window.__store.getState().setManualHour?.(13))
  await new Promise((r) => setTimeout(r, 1000))

  const renderer = await page.evaluate(() => {
    const gl3 = window.__three?.gl
    const ctx = gl3?.getContext?.()
    try {
      const dbg = ctx?.getExtension('WEBGL_debug_renderer_info')
      return dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unavailable'
    } catch {
      return 'unavailable'
    }
  })
  console.log(`[${name}] renderer: ${renderer}`)
  if (/swiftshader|llvmpipe/i.test(renderer)) {
    console.error(
      `ABORT [${name}]: software renderer detected (${renderer}) — this probe requires the real GPU, aborting this browser`,
    )
    await browser.close()
    return { name, browser: null, page: null, renderer, aborted: true }
  }
  return { name, browser, page, renderer, aborted: false }
}

const results = {} // results[browser][mode] = { renderer, p50, p90, gapP50, gapMax, pixelRatio, bufPx, crop, screenshot }

for (const name of BROWSERS) {
  const boot = await bootBrowser(name)
  if (boot.aborted) continue
  const { page, browser, renderer } = boot
  results[name] = {}
  for (const mode of MODES) {
    await page.evaluate((m) => window.__store.getState().setQualityTier(m), mode)
    await new Promise((r) => setTimeout(r, 4000))
    // Pin `deviceClass` the playbook way: call the real setter once, THEN
    // overwrite it with a no-op so the adaptive ladder cannot re-demote it.
    await page.evaluate(() => {
      window.__store.getState().setDeviceClass('capable')
      window.__store.setState({ setDeviceClass: () => {} })
    })
    const reached = await page
      .waitForFunction(
        () => {
          const gl3 = window.__three?.gl
          if (!gl3) return false
          const ctx = gl3.getContext()
          return (
            gl3.getPixelRatio() === 1 &&
            ctx.drawingBufferWidth === 1280 &&
            ctx.drawingBufferHeight === 800
          )
        },
        { timeout: 10000 },
      )
      .then(() => true)
      .catch(() => false)
    const raster = await page.evaluate(() => {
      const gl3 = window.__three.gl
      const ctx = gl3.getContext()
      return {
        pixelRatio: gl3.getPixelRatio(),
        bufPx: `${ctx.drawingBufferWidth}x${ctx.drawingBufferHeight}`,
      }
    })
    console.log(
      `[${name}/${mode}] pixelRatio=${raster.pixelRatio} drawingBuffer=${raster.bufPx}` +
        (reached ? '' : '  WARNING: did not settle to 1x/1280x800 within 10s'),
    )

    const cost = await measureFence(page, FRAMES)
    console.log(
      `[${name}/${mode}] fence n=${cost.n} p50=${cost.p50}ms p90=${cost.p90}ms  pollGap p50=${cost.gapP50}ms max=${cost.gapMax}ms` +
        (cost.fenceFails ? `  fenceFails=${cost.fenceFails}` : '') +
        (cost.glErrors ? `  glErrors=${cost.glErrors}` : ''),
    )

    const screenshot = path.join(OUT_DIR, `${name}-${mode}.png`)
    await page.screenshot({ path: screenshot })

    results[name][mode] = { renderer, ...raster, ...cost, screenshot }
  }
  await browser.close()
}

/** Rec.709 luminance percentiles + mean HSV saturation over the interior crop. */
async function cropStats(pngPath) {
  const croppedPath = pngPath.replace(/\.png$/, '-crop.png')
  execFileSync('node', [
    CROP,
    pngPath,
    croppedPath,
    String(CROP_RECT.left),
    String(CROP_RECT.top),
    String(CROP_RECT.width),
    String(CROP_RECT.height),
  ])
  const { data } = await sharp(croppedPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lums = []
  let satSum = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    lums.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    satSum += max === 0 ? 0 : (max - min) / max
  }
  lums.sort((a, b) => a - b)
  const q = (p) => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))]
  return {
    p05: +q(0.05).toFixed(1),
    p25: +q(0.25).toFixed(1),
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    meanSat: +(satSum / n).toFixed(3),
  }
}

for (const name of Object.keys(results)) {
  for (const mode of MODES) {
    const r = results[name][mode]
    if (!r) continue
    r.crop = await cropStats(r.screenshot)
  }
}

// ---- Report -----------------------------------------------------------

console.log('\n=== BROWSER x MODE ===')
console.log(
  `${'browser'.padEnd(9)}${'mode'.padEnd(13)}${'fence p50/p90'.padEnd(16)}${'pollGap p50/max'.padEnd(18)}${'crop p05/p25/p50/p95'.padEnd(24)}${'sat'.padEnd(7)}renderer`,
)
for (const name of Object.keys(results)) {
  for (const mode of MODES) {
    const r = results[name][mode]
    if (!r) continue
    console.log(
      `${name.padEnd(9)}${mode.padEnd(13)}${`${r.p50}/${r.p90}`.padEnd(16)}${`${r.gapP50}/${r.gapMax}`.padEnd(18)}${`${r.crop.p05}/${r.crop.p25}/${r.crop.p50}/${r.crop.p95}`.padEnd(24)}${String(r.crop.meanSat).padEnd(7)}${r.renderer}`,
    )
  }
}

console.log('\n=== CROSS-BROWSER DIFF PER MODE ===')
const browserNames = Object.keys(results)
if (browserNames.length === 2) {
  const [a, b] = browserNames
  for (const mode of MODES) {
    const ra = results[a][mode]
    const rb = results[b][mode]
    if (!ra || !rb) {
      console.log(`[${mode}] skipped — missing capture for ${!ra ? a : b}`)
      continue
    }
    console.log(`\n[${mode}] ${a} vs ${b} — whole frame:`)
    console.log(
      execFileSync('node', [IMG_DIFF, ra.screenshot, rb.screenshot], { encoding: 'utf8' }),
    )
    console.log(
      `[${mode}] crop delta (${b} - ${a}): p05 ${(rb.crop.p05 - ra.crop.p05).toFixed(1)}  ` +
        `p25 ${(rb.crop.p25 - ra.crop.p25).toFixed(1)}  p50 ${(rb.crop.p50 - ra.crop.p50).toFixed(1)}  ` +
        `p95 ${(rb.crop.p95 - ra.crop.p95).toFixed(1)}  sat ${(rb.crop.meanSat - ra.crop.meanSat).toFixed(3)}`,
    )
  }
} else {
  console.log(`(only ${browserNames.length} browser(s) captured — no cross-browser diff possible)`)
}

console.log(`\npageerrors (${pageErrors.length}):`)
for (const e of pageErrors) console.log(`  [${e.browser}] ${e.message}`)

if (pageErrors.length > 0) {
  console.error('FAIL: at least one pageerror occurred')
  process.exit(1)
}
