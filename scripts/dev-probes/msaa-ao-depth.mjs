/**
 * MSAA-AO-DEPTH — does hardware MSAA still corrupt the frame now that `postprocessing`
 * carries the #745 depth-format fix?
 *
 * Answers exactly two questions, both as numbers, both with an **in-session control**:
 *
 *  1. **`GL_INVALID_OPERATION` blit errors.** Not scraped from the console — Chrome
 *     rate-limits and dedupes WebGL logging, so "the log looks clean" is not a count.
 *     `getError()` is polled off the render path (see {@link instrument} for why it may
 *     NOT be read inside the blit) and Chrome's own log lines are counted separately as
 *     a second, independent signal. `renderbufferStorageMultisample` is logged too,
 *     which is the direct evidence that MSAA was actually allocated and at what depth
 *     format — an arm that silently ran with 0 samples would otherwise look like a pass.
 *  2. **Luma at the poses that moved.** The ~20% mid-tone dimming and the clipped night
 *     kitchen ceiling (200 → 254) were measured on a 390x844 DSF-3 phone at
 *     `realistic`/`weak`. Same viewport, same tier, same pinned clock here.
 *
 * ## Rules this probe follows, because breaking them is how the last measurement lied
 *
 *  - **Never compare against a saved reference.** Both arms run in ONE browser session,
 *    interleaved `off → on → off`, and the two `off` arms are printed against each other
 *    as a drift check. A number that differs between the two controls invalidates the run.
 *  - **The clock is pinned** (`setTimeMode('manual')` + an explicit hour) and **every
 *    clip names its camera pose** — walk position, yaw and pitch, never "wherever boot
 *    left the camera".
 *  - **The arm is verified, not assumed.** Each arm reports the resolved tier, device
 *    class, and the sample counts actually seen at the driver.
 *  - **Browser budget.** Waits until at most one other browser is running before
 *    launching, and always closes its own.
 *
 * Usage (needs `npm run dev`, or a probe server — see `lib.mjs:appUrl`):
 *
 *   SSG_URL=http://localhost:5173/ node scripts/dev-probes/msaa-ao-depth.mjs
 *
 * Env: `OUT` (default `/tmp/ssg-msaa-ao-depth`), `ARMS` (default `off,on,off`),
 * `HOURS_DAY` / `HOURS_NIGHT`, `NO_GL_TRACE=1` to drop the in-page instrumentation.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive, frameStats } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-msaa-ao-depth'
const ARMS = (process.env.ARMS || 'off,on,off').split(',')
const HOUR_DAY = Number(process.env.HOURS_DAY || 13)
const HOUR_NIGHT = Number(process.env.HOURS_NIGHT || 2.4)
const GL_TRACE = process.env.NO_GL_TRACE !== '1'
const VP = { width: 390, height: 844, deviceScaleFactor: 3 }

/** Clips. Every one names a pose: `[x, z, yaw, pitch]` in three space (see
 *  `view-matrix.mjs:WALK_POSES`), plus the hour it is read at. */
const CLIPS = [
  { name: 'living-far-day', hour: HOUR_DAY, p: [10.9, 5.2, 0, -0.02] },
  { name: 'kitchen-east-day', hour: HOUR_DAY, p: [3.6, 7.2, Math.PI / 2, -0.05] },
  // The two reads the regression was measured on: a ceiling-ward pitch in the kitchen
  // at night is where MSAA-on clipped 200 -> 254.
  { name: 'kitchen-ceiling-night', hour: HOUR_NIGHT, p: [3.6, 7.2, Math.PI / 2, 0.55] },
  { name: 'living-far-night', hour: HOUR_NIGHT, p: [10.9, 5.2, 0, -0.02] },
]

/**
 * Count BROWSER INSTANCES, not processes.
 *
 * A single Chrome is a tree of a dozen helpers and puppeteer's headless shell spawns
 * four children of the same binary, so a naive `pgrep | wc -l` reads 5 browsers where
 * there is one. Counts only matching processes whose parent is not itself a matching
 * process, and filters out the `pgrep`/`ps` invocation itself (a probe that matches its
 * own command line waits forever).
 */
function browserInstances() {
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  const rows = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    const cmd = m[3]
    if (!/(Google Chrome|Chromium|chrome-headless-shell)/.test(cmd)) continue
    if (/\b(ps|pgrep|grep|node)\b/.test(cmd.split(' ')[0])) continue
    if (/Helper|crashpad|chrome-native-host/.test(cmd)) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), cmd })
  }
  const pids = new Set(rows.map((r) => r.pid))
  return rows.filter((r) => !pids.has(r.ppid))
}

async function waitForBrowserSlot({ max = 1, timeoutMs = 20 * 60_000 } = {}) {
  const t0 = Date.now()
  for (;;) {
    const live = browserInstances()
    if (live.length <= max) {
      console.log(`browser budget OK — ${live.length} other instance(s) running`)
      return
    }
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `browser budget never freed: ${live.length} instances still up after ${Math.round((Date.now() - t0) / 1000)}s`,
      )
    }
    console.log(`waiting for a browser slot — ${live.length} running, need <= ${max}`)
    await new Promise((r) => setTimeout(r, 15_000))
  }
}

/**
 * Installed at document start so it is in place before three ever creates a context.
 *
 * **Deliberately NOT a wrapper on `blitFramebuffer`.** The obvious instrument — wrap the
 * call, read `getError()` around it, attribute the failure to the exact blit — was tried
 * first and it BREAKS THE RENDER: the canvas comes back as the flat page background, 0
 * blits recorded, and every clip reads an identical ~221. A synchronous `getError()` in
 * the composer's hot path stalls the command buffer hard enough that the demand
 * frameloop never lands a frame, so the instrument destroys the thing it measures. That
 * failure is silent and looks exactly like "stable, comparable numbers" — the whole
 * reason both a flat-luma check and an explicit MSAA-allocation check are reported below.
 *
 * What is safe, and sufficient:
 *  - `getContext` is wrapped (once, at creation) to keep a handle on the live context.
 *  - `renderbufferStorageMultisample` is logged — a pass-through, no GL round trip. This
 *    is the direct evidence that MSAA was really allocated and at WHAT DEPTH FORMAT,
 *    which is the entire subject of pmndrs/postprocessing #745.
 *  - `getError()` is polled off the render path at 4 Hz. WebGL keeps the error flag set
 *    until it is read, so a per-frame flood cannot hide between polls — it can only be
 *    under-counted, never missed. The node-side console listener counts Chrome's own
 *    `GL_INVALID_OPERATION` lines as an independent second signal.
 */
function instrument() {
  const G = /** @type {any} */ (window)
  G.__gl = { errors: [], msaa: [], ctx: null, polls: 0 }
  const names = {
    33190: 'DEPTH_COMPONENT24',
    36012: 'DEPTH_COMPONENT32F',
    35056: 'DEPTH24_STENCIL8',
    36013: 'DEPTH32F_STENCIL8',
    33189: 'DEPTH_COMPONENT16',
  }
  const errs = { 1280: 'INVALID_ENUM', 1281: 'INVALID_VALUE', 1282: 'INVALID_OPERATION' }
  const C = G.WebGL2RenderingContext
  if (!C) return
  const rbsm = C.prototype.renderbufferStorageMultisample
  // SIGNATURE: (target, samples, internalformat, width, height) — FIVE arguments, the
  // first being the target, not the sample count. Getting that wrong swallows `height`,
  // so every multisampled renderbuffer is allocated at the wrong size: no GL error
  // anywhere, and the frame comes back as flat page background. Forwarded with `apply`
  // so the call is a true pass-through whatever the arity.
  C.prototype.renderbufferStorageMultisample = function (...a) {
    const [, samples, fmt, w, h] = a
    if (G.__gl.msaa.length < 400)
      G.__gl.msaa.push({ samples, format: names[fmt] || `0x${fmt.toString(16)}`, w, h })
    return rbsm.apply(this, a)
  }
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest)
    if (ctx && type === 'webgl2' && !G.__gl.ctx) G.__gl.ctx = ctx
    return ctx
  }
  setInterval(() => {
    const gl = G.__gl.ctx
    if (!gl) return
    G.__gl.polls += 1
    for (let i = 0; i < 8; i += 1) {
      const e = gl.getError()
      if (e === 0) break
      if (G.__gl.errors.length < 500) G.__gl.errors.push(errs[e] || e)
    }
  }, 250)
}

/**
 * Luma over the canvas centre slab plus three horizontal bands.
 *
 * `box` is in DEVICE pixels, which is the trap this probe fell into once: a
 * screenshot at `deviceScaleFactor: 3` is 1170x2532 while `getBoundingClientRect()`
 * reports 390x844, so CSS-pixel rects sample the top-left twelfth of the frame — the
 * toolbar. Every clip then reads the same flat ~221 and the run looks stable and
 * comparable while measuring no render at all.
 *
 * Bands, top to bottom at a walk pose: `ceiling` (the surface the ~20% dimming was
 * quoted on), `mid` (eye level — the window wall, the highest-contrast geometry in the
 * frame and so the most MSAA-sensitive), `floor`.
 */
async function readLuma(buf, box) {
  const b = (fy, fh) => ({
    x: box.x + box.w * 0.22,
    y: box.y + box.h * fy,
    w: box.w * 0.56,
    h: box.h * fh,
  })
  const [slab, ceiling, mid, floor] = await Promise.all([
    frameStats(buf, b(0.18, 0.55)),
    frameStats(buf, b(0.16, 0.14)),
    frameStats(buf, b(0.42, 0.14)),
    frameStats(buf, b(0.68, 0.14)),
  ])
  return {
    slab: slab.mean,
    sd: slab.sd,
    clipped: slab.clipped,
    ceiling: ceiling.mean,
    ceilingClipped: ceiling.clipped,
    mid: mid.mean,
    floor: floor.mean,
  }
}

async function runArm(browser, arm, index) {
  const label = `${index}-${arm}`
  const url = arm === 'on' ? `${appUrl()}?ff=mobileMsaa:on` : appUrl()
  const page = await browser.newPage()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport(VP)
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  if (GL_TRACE) await page.evaluateOnNewDocument(instrument)
  let consoleGl = 0
  page.on('console', (m) => {
    if (/GL_INVALID_OPERATION|blitFramebuffer/i.test(m.text())) consoleGl += 1
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60_000 })
  await page.waitForFunction(() => !!window.__store, { timeout: 30_000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.endTour?.()
    s.setOnboardingOpen?.(false)
    s.dismissLocationPrompt?.()
    s.dismissChecklist?.()
    s.hideLoading?.()
    // Pinned OFF: a long frame must not halve the canvas mid-capture — resolution moves
    // every luma read and would look exactly like the effect under test.
    s.setFeatureFlag?.('interactiveDegrade', false)
  })
  await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 120_000 })
  // Order matters: the device class must be weak BEFORE the full stack first mounts,
  // because `Effects.tsx` freezes the sample count at that render (MSAA-FREEZE).
  await page.evaluate(() => window.__store.getState().setDeviceClass('weak'))
  await page.evaluate(() => window.__store.getState().setQualityTier('realistic'))
  await page.evaluate(() => window.__store.getState().setLightsMode('on'))
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60_000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 6000))
  await assertSceneAlive(page, label)

  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20_000,
  })
  await new Promise((r) => setTimeout(r, 4000))
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.hideLoading?.()
    s.dismissCallout?.('walk-mode')
    s.setWalkFov?.(50)
  })

  const env = await page.evaluate(() => {
    const s = window.__store.getState()
    return {
      tier: s.qualityTier,
      deviceClass: s.deviceClass,
      softwareRenderer: s.softwareRenderer,
      flag: s.featureFlags?.mobileMsaa ?? null,
      dpr: window.devicePixelRatio,
    }
  })
  // DEVICE pixels — see `readLuma`. `getBoundingClientRect()` is CSS pixels and the
  // screenshot is not.
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    const d = window.devicePixelRatio
    return { x: r.x * d, y: r.y * d, w: r.width * d, h: r.height * d }
  })

  // Reset the counters AFTER boot: context creation and the loader legitimately touch
  // GL state, and a boot-time count would swamp the steady-state signal under test.
  if (GL_TRACE) await page.evaluate(() => window.__gl.errors.splice(0))
  consoleGl = 0

  const rows = []
  for (const clip of CLIPS) {
    await page.evaluate((h) => {
      const s = window.__store.getState()
      s.setTimeMode('manual')
      s.setManualHour(h)
    }, clip.hour)
    await page.evaluate((q) => {
      const l = window.__walkLook
      l.setPosition(q[0], q[1])
      l.setYaw(q[2])
      l.setPitch(q[3])
    }, clip.p)
    await new Promise((r) => setTimeout(r, 2500))
    await assertSceneAlive(page, `${label}/${clip.name}`)
    const buf = await page.screenshot({ type: 'png' })
    fs.writeFileSync(path.join(OUT, `${label}__${clip.name}.png`), buf)
    rows.push({ clip: clip.name, ...(await readLuma(buf, box)) })
  }

  const gl = GL_TRACE
    ? await page.evaluate(() => ({
        polls: window.__gl.polls,
        errors: window.__gl.errors.length,
        sample: [...new Set(window.__gl.errors)].slice(0, 3),
        msaa: window.__gl.msaa,
      }))
    : { polls: null, errors: null, sample: [], msaa: [] }
  await page.close()

  const depthMsaa = gl.msaa.filter((m) => m.samples > 0 && /DEPTH/.test(m.format))
  return { label, arm, env, rows, gl: { ...gl, consoleGl, depthMsaa } }
}

fs.mkdirSync(OUT, { recursive: true })
await waitForBrowserSlot()
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const results = []
try {
  for (const [i, arm] of ARMS.entries()) {
    console.log(`\n== arm ${i} :: mobileMsaa ${arm} ==`)
    const r = await runArm(browser, arm, i)
    results.push(r)
    console.log(
      `   env: tier=${r.env.tier} class=${r.env.deviceClass} sw=${r.env.softwareRenderer} flag=${r.env.flag} dpr=${r.env.dpr}`,
    )
    console.log(
      `   GL: errors=${r.gl.errors} (${r.gl.sample.join(',') || 'none'}) polls=${r.gl.polls} consoleGlLines=${r.gl.consoleGl}`,
    )
    const fmts = [...new Set(r.gl.depthMsaa.map((m) => `${m.samples}x ${m.format}`))]
    console.log(`   MSAA depth renderbuffers: ${fmts.length ? fmts.join(', ') : '(none)'}`)
    for (const row of r.rows)
      console.log(
        `   ${row.clip.padEnd(24)} slab=${String(row.slab).padStart(6)} ceil=${String(row.ceiling).padStart(6)}` +
          ` mid=${String(row.mid).padStart(6)} floor=${String(row.floor).padStart(6)}` +
          ` clip=${(row.clipped * 100).toFixed(2)}% ceilClip=${(row.ceilingClipped * 100).toFixed(2)}%`,
      )
  }
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT, 'msaa-ao-depth.json'), JSON.stringify(results, null, 2))

// --- paired report: on vs the MEAN of the controls, plus the control-drift check ---
const offs = results.filter((r) => r.arm === 'off')
const ons = results.filter((r) => r.arm === 'on')
if (offs.length && ons.length) {
  console.log('\n== paired deltas (on - off), with control drift ==')
  for (const clip of CLIPS.map((c) => c.name)) {
    const pick = (rs, k) => rs.map((r) => r.rows.find((x) => x.clip === clip)?.[k] ?? NaN)
    const line = (k) => {
      const o = pick(offs, k)
      const n = pick(ons, k)
      const offMean = o.reduce((a, b) => a + b, 0) / o.length
      const onMean = n.reduce((a, b) => a + b, 0) / n.length
      const drift = o.length > 1 ? Math.max(...o) - Math.min(...o) : 0
      return `${k}=${(onMean - offMean >= 0 ? '+' : '') + (onMean - offMean).toFixed(2)} (off ${offMean.toFixed(2)}, drift ${drift.toFixed(2)})`
    }
    console.log(`   ${clip.padEnd(24)} ${['slab', 'ceiling', 'mid', 'floor'].map(line).join('  ')}`)
  }
}
const totalErrors = results.reduce((a, r) => a + (r.gl.errors || 0) + r.gl.consoleGl, 0)
// An identical luma across every clip means the render never landed — a broken
// instrument, not a result. It reads as beautifully stable numbers, so it is asserted.
const flat = results.some((r) => new Set(r.rows.map((x) => x.slab)).size < r.rows.length)
// An `on` arm that allocated no multisampled depth attachment did not test MSAA at all.
const armedOn = results
  .filter((r) => r.arm === 'on')
  .every((r) => r.gl.depthMsaa.some((m) => m.samples > 0))
const verdict = flat
  ? 'INVALID — identical luma across clips, the render never landed'
  : !armedOn
    ? 'INVALID — the `on` arm allocated no multisampled depth attachment'
    : totalErrors === 0
      ? 'PASS'
      : 'FAIL'
console.log(`\nVERDICT: ${verdict} — ${totalErrors} GL error(s) total`)
console.log(`frames + json in ${OUT}`)
