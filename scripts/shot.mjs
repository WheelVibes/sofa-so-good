// Screenshot + interaction harness for the HDB sandbox. Software-WebGL via SwiftShader.
//
// ── LEGACY MODE (backward-compatible) ──────────────────────────────────────────────
//   node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]
//   actionsJson: JSON array of action objects — see docs/visual-verification-playbook.md
//
// ── SCENARIO MODE (recommended for multi-step journeys) ────────────────────────────
//   node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]
//   A scenario is a JSON/mjs file with { name, steps: [...] }.
//   See docs/visual-verification-playbook.md for the full step reference.
//
// Env vars (both modes):
//   SHOT_VIEWPORT="W,H"        viewport override (default 1600,1000)
//   SHOT_TOUCH=1               emulate touch device (isMobile+hasTouch)
//   SHOT_INIT_LS='{…}'         seed localStorage before page load
//   SHOT_KEEP_FIRSTRUN=1       DON'T auto-dismiss onboarding + location prompt
//                              (default: both are dismissed so they can't block
//                              the canvas; set this to screenshot those flows)
//   SHOT_URL                   target URL (default http://localhost:5173/)
//   SHOT_NAV_TIMEOUT           navigation timeout ms (default 60000)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer'
import { runSteps } from './lib/interact.mjs'
import { normaliseScenario } from './lib/validate.mjs'

// ──────────────────────────────────────────────────────────────────────────────
// Parse CLI arguments
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

let scenarioFile = null
let outDir = null
let legacyMode = false

// Check for scenario mode first
const scenarioIdx = args.indexOf('--scenario')
if (scenarioIdx !== -1) {
  scenarioFile = args[scenarioIdx + 1]
  if (!scenarioFile || scenarioFile.startsWith('-')) {
    console.error('shot.mjs: --scenario requires a file path')
    process.exit(2)
  }
  const outDirIdx = args.indexOf('--out-dir')
  outDir = outDirIdx !== -1 ? args[outDirIdx + 1] : '/tmp/scenario-out'
} else {
  legacyMode = true
}

// ──────────────────────────────────────────────────────────────────────────────
// Legacy mode: guard the output path (kept exactly as before)
// ──────────────────────────────────────────────────────────────────────────────

const legacyOut = args[0] || '/tmp/shot.png'
const legacyWaitMs = Number(args[1] || 6000)
const legacyEvalFile = args[2]
const legacyActionsArg = args[3]

if (legacyMode) {
  if (legacyOut.startsWith('-') || !legacyOut.toLowerCase().endsWith('.png')) {
    console.error(
      `shot.mjs: invalid output path ${JSON.stringify(legacyOut)} — expected a .png file path.\n` +
        'Usage: node scripts/shot.mjs <out.png> [waitMs] [evalScriptFile] [actionsJson]\n' +
        '       node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]',
    )
    process.exit(2)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Load and validate scenario (scenario mode only)
// ──────────────────────────────────────────────────────────────────────────────

let scenario = null
if (!legacyMode) {
  const absScenario = path.resolve(scenarioFile)
  if (!fs.existsSync(absScenario)) {
    console.error(`shot.mjs: scenario file not found: ${absScenario}`)
    process.exit(2)
  }

  let raw
  if (absScenario.endsWith('.mjs') || absScenario.endsWith('.js')) {
    const mod = await import(pathToFileURL(absScenario).href)
    raw = mod.default ?? mod
  } else {
    raw = JSON.parse(fs.readFileSync(absScenario, 'utf8'))
  }

  try {
    scenario = normaliseScenario(raw)
  } catch (err) {
    console.error(`shot.mjs: scenario validation failed — ${err.message}`)
    process.exit(2)
  }

  console.log(`Running scenario: "${scenario.name}" (${scenario.steps.length} steps)`)
  console.log(`Output directory: ${outDir}`)
  fs.mkdirSync(outDir, { recursive: true })
}

// Keep the first-run onboarding + location prompt (rather than auto-dismissing
// them) when the env flag is set OR the scenario opts in — so the first-run
// scenarios can still walk those flows.
const keepFirstRun = !!process.env.SHOT_KEEP_FIRSTRUN || scenario?.keepFirstRun === true

// ──────────────────────────────────────────────────────────────────────────────
// Launch browser (shared by both modes)
// ──────────────────────────────────────────────────────────────────────────────

// Machine-wide harness mutex: SwiftShader Chromium instances are the heaviest
// processes in this sandbox (1–2 GB each); concurrent runs have coincided with
// container-level restarts that silently kill the running process. Serialize ALL
// shot.mjs invocations by re-exec'ing under `flock` — the kernel releases the lock
// when the holder dies, so no stale-lock handling is needed. Waits up to 15 min
// for the lock, then fails loudly.
if (!process.env.SHOT_HARNESS_LOCKED) {
  const { spawnSync } = await import('node:child_process')
  const t0 = Date.now()
  const res = spawnSync(
    'flock',
    ['-w', '900', '/tmp/sofa-shot-harness.lock', process.execPath, ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, SHOT_HARNESS_LOCKED: '1' } },
  )
  if (res.status === 1 && Date.now() - t0 > 890_000) {
    console.error('shot.mjs: harness lock not acquired within 15 min — another run is stuck')
  }
  process.exit(res.status ?? 1)
}

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--window-size=1600,1000',
  ],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')

// Viewport defaults to 1600×1000; override with SHOT_VIEWPORT="W,H" to test
// responsive breakpoints (e.g. "390,844" for a phone, "834,1112" tablet).
// SHOT_TOUCH=1 emulates a touch device (isMobile + hasTouch) so `(pointer:
// coarse)` matches — needed to exercise touch-gated handlers (long-press).
const vp = (process.env.SHOT_VIEWPORT || '1600,1000').split(',').map(Number)
const touch = process.env.SHOT_TOUCH === '1'
await page.setViewport({
  width: vp[0] || 1600,
  height: vp[1] || 1000,
  deviceScaleFactor: 1,
  isMobile: touch,
  hasTouch: touch,
})

// ──────────────────────────────────────────────────────────────────────────────
// Seed localStorage — scenario mode starts with CLEAN state by default so
// first-run flows (onboarding, tour) are triggered. In legacy mode we keep
// the old default (dismisses help hint). Both are overridable via SHOT_INIT_LS.
// ──────────────────────────────────────────────────────────────────────────────
{
  let initLs
  if (process.env.SHOT_INIT_LS) {
    initLs = JSON.parse(process.env.SHOT_INIT_LS)
  } else if (legacyMode) {
    // Legacy default: dismiss the help hint only (preserves old behavior)
    initLs = { 'sofa.helpHint.dismissed': '1' }
  } else {
    // Scenario default: truly empty storage — let first-run flows trigger.
    // An individual scenario can inject items via eval steps if needed.
    initLs = {}
  }

  // Always dismiss the first-run onboarding carousel so it can't cover the
  // canvas (the location prompt is handled after load — it's a store flag, not
  // localStorage). Set SHOT_KEEP_FIRSTRUN=1 to test the onboarding flow itself.
  if (!process.env.SHOT_INIT_LS && !keepFirstRun) {
    initLs.hdb_onboarded = '1'
  }

  await page.evaluateOnNewDocument((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  }, initLs)
}

const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

// ──────────────────────────────────────────────────────────────────────────────
// Navigate to the app
// ──────────────────────────────────────────────────────────────────────────────

// SHOT_URL overrides the target (e.g. a dev server on another port);
// SHOT_NAV_TIMEOUT (ms) extends the load timeout when the machine is busy (cold
// Vite transforms easily pass 60 s). Precedence: SHOT_URL env > scenario url >
// default — so a scenario that hardcodes a port stays portable across servers.
const url = process.env.SHOT_URL ?? scenario?.url ?? 'http://localhost:5173/'
const navTimeout = Number(process.env.SHOT_NAV_TIMEOUT || 60000)
try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: navTimeout })
} catch (err) {
  // In an offline sandbox, hung third-party fetches keep the network busy so
  // networkidle2 never fires even though the app booted fine — continue and
  // rely on waitMs/waitFor below. Anything else is a real failure.
  if (!String(err).includes('Navigation timeout')) throw err
  logs.push('[harness] goto networkidle2 timed out; continuing with waitMs')
}

// Dismiss the post-onboarding "Where are you?" location prompt so it can't block
// the view. It's a store flag (not localStorage), so seed it after boot via
// __store (dev), with a click-the-skip-button fallback for prod builds. Opt out
// with SHOT_KEEP_FIRSTRUN=1 to screenshot the location flow itself.
if (!keepFirstRun) {
  await page.waitForFunction(() => !!window.__store, { timeout: 5000 }).catch(() => {})
  await page
    .evaluate(() => {
      try {
        window.__store?.getState?.().dismissLocationPrompt?.()
      } catch {
        /* prod build: no __store */
      }
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /use default location|^\s*skip\b/i.test(b.textContent || ''),
      )
      btn?.click()
    })
    .catch(() => {})
  logs.push('[harness] dismissed first-run onboarding + location prompt')
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO MODE: run all steps
// ──────────────────────────────────────────────────────────────────────────────

if (!legacyMode) {
  const ctx = { logs, screenshotIndex: 1 }
  await runSteps(page, scenario.steps, outDir, ctx)

  console.log(
    `\nScenario "${scenario.name}" complete — ${ctx.screenshotIndex - 1} screenshot(s) saved to ${outDir}`,
  )
  console.log('---CONSOLE---')
  console.log(logs.slice(-30).join('\n'))
  await browser.close()
  process.exit(0)
}

// ──────────────────────────────────────────────────────────────────────────────
// LEGACY MODE (original shot.mjs behaviour, unchanged)
// ──────────────────────────────────────────────────────────────────────────────

await new Promise((r) => setTimeout(r, legacyWaitMs))

if (legacyEvalFile && legacyEvalFile !== '-') {
  await page.evaluate(fs.readFileSync(legacyEvalFile, 'utf8'))
  await new Promise((r) => setTimeout(r, 1500))
}

if (legacyActionsArg) {
  const actions = JSON.parse(legacyActionsArg)
  for (const a of actions) {
    if (a.type === 'drag') {
      await page.mouse.move(a.from[0], a.from[1])
      await page.mouse.down()
      const steps = 20
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          a.from[0] + ((a.to[0] - a.from[0]) * i) / steps,
          a.from[1] + ((a.to[1] - a.from[1]) * i) / steps,
        )
        await new Promise((r) => setTimeout(r, 8))
      }
      await page.mouse.up()
    } else if (a.type === 'rdrag') {
      await page.mouse.move(a.from[0], a.from[1])
      await page.mouse.down({ button: 'right' })
      const steps = 20
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          a.from[0] + ((a.to[0] - a.from[0]) * i) / steps,
          a.from[1] + ((a.to[1] - a.from[1]) * i) / steps,
        )
        await new Promise((r) => setTimeout(r, 8))
      }
      await page.mouse.up({ button: 'right' })
    } else if (a.type === 'wheel') {
      await page.mouse.move(a.x, a.y)
      await page.mouse.wheel({ deltaY: a.dy })
    } else if (a.type === 'click') {
      await page.mouse.click(a.x, a.y)
    } else if (a.type === 'key') {
      await page.keyboard.press(a.key)
    } else if (a.type === 'type') {
      await page.mouse.click(a.x, a.y)
      await page.keyboard.type(a.text, { delay: 20 })
    } else if (a.type === 'select') {
      // Set a native <select>'s value and fire its change event (React onChange).
      // {type:'select', selector, value} — selector defaults to the first <select>.
      await page.select(a.selector || 'select', String(a.value))
    } else if (a.type === 'wait') {
      await new Promise((r) => setTimeout(r, a.ms))
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  await new Promise((r) => setTimeout(r, 800))
}

await page.screenshot({ path: legacyOut })
console.log('SHOT_SAVED', legacyOut)
const fps = await page.evaluate(() => window.__lastFps ?? null)
if (fps != null) console.log('FPS', fps)
console.log('---CONSOLE---')
console.log(logs.slice(-30).join('\n'))
await browser.close()
