// Screenshot harness for the HDB sandbox. Software-WebGL via SwiftShader.
// Usage: node scripts/shot.mjs <outPath> [waitMs] [evalScriptFile] [actionsJson]
// actionsJson: JSON array of {type:'drag',from:[x,y],to:[x,y]} | {type:'wheel',x,y,dy} | {type:'click',x,y} | {type:'key',key} | {type:'type',x,y,text} | {type:'select',selector,value} | {type:'wait',ms}

import fs from 'node:fs'
import puppeteer from 'puppeteer'

const out = process.argv[2] || '/tmp/shot.png'
const waitMs = Number(process.argv[3] || 6000)
const evalFile = process.argv[4]
const actionsArg = process.argv[5]

// Guard the output path: a flag-like (`--help`) or non-`.png` first arg is almost
// certainly a mistake — passing it through once wrote a screenshot to a file
// literally named `--help` at the repo root, which then got committed. Fail loudly
// (before launching the browser) instead of silently producing a junk file.
if (out.startsWith('-') || !out.toLowerCase().endsWith('.png')) {
  console.error(
    `shot.mjs: invalid output path ${JSON.stringify(out)} — expected a .png file path.\n` +
      'Usage: node scripts/shot.mjs <out.png> [waitMs] [evalScriptFile] [actionsJson]',
  )
  process.exit(2)
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
// Seed localStorage before any app code runs so previews aren't covered by the
// first-run Controls overlay / location prompt. Override with SHOT_INIT_LS
// (JSON object of key→value). Defaults dismiss both first-run UIs.
{
  const initLs = process.env.SHOT_INIT_LS
    ? JSON.parse(process.env.SHOT_INIT_LS)
    : { 'sofa.helpHint.dismissed': '1' }
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

// SHOT_URL overrides the target (e.g. a parallel worktree's dev server on
// another port); SHOT_NAV_TIMEOUT (ms) extends the load timeout when the
// machine is busy (cold Vite transforms under parallel jobs easily pass 60 s).
const url = process.env.SHOT_URL || 'http://localhost:5173/'
const navTimeout = Number(process.env.SHOT_NAV_TIMEOUT || 60000)
await page.goto(url, { waitUntil: 'networkidle2', timeout: navTimeout })
await new Promise((r) => setTimeout(r, waitMs))

if (evalFile && evalFile !== '-') {
  await page.evaluate(fs.readFileSync(evalFile, 'utf8'))
  await new Promise((r) => setTimeout(r, 1500))
}

if (actionsArg) {
  const actions = JSON.parse(actionsArg)
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

await page.screenshot({ path: out })
console.log('SHOT_SAVED', out)
const fps = await page.evaluate(() => window.__lastFps ?? null)
if (fps != null) console.log('FPS', fps)
console.log('---CONSOLE---')
console.log(logs.slice(-30).join('\n'))
await browser.close()
