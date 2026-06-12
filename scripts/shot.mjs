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

// ──────────────────────────────────────────────────────────────────────────────
// Launch browser (shared by both modes)
// ──────────────────────────────────────────────────────────────────────────────

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

// SHOT_URL overrides the target (e.g. a parallel worktree's dev server on
// another port); SHOT_NAV_TIMEOUT (ms) extends the load timeout when the
// machine is busy (cold Vite transforms under parallel jobs easily pass 60 s).
// Precedence: SHOT_URL env > scenario url > default — scenarios written in one
// worktree hardcode that worktree's port, so the runner's env must win or the
// scenario is not portable across servers.
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
