/**
 * PT-FEASIBILITY — can the HQ path tracer run under the headless probe rig?
 *
 * `.245` wants to settle a diagnosis this arc has leaned on for a dozen rounds:
 * that the wall-falloff gap (0.74 against a photographic 0.85-0.86) is caused by
 * absent inter-reflection. The app already owns a path tracer for HQ stills, so
 * rendering the SAME pose with real light transport would confirm or refute it
 * directly rather than by elimination.
 *
 * That is a multi-round build. This probe is only the go/no-go: open the modal,
 * start a short render, and report the phase it reaches. `hqRenderSession.ts`
 * carries a PT-BLANK-GUARD for drivers that compile a context but produce no
 * pixels, which is exactly the failure a headless GPU is prone to -- so if this
 * cannot render, the idea dies here and that is worth knowing cheaply.
 *
 * Uses the same ANGLE/Metal launch as `light-distribution.mjs` (`.218`: a probe
 * on swiftshader renders a different scene and its numbers are void).
 *
 * RESULT (`.245`): **GO.** The tracer builds and accumulates headlessly on
 * ANGLE/Metal -- 47 samples in 97 s, i.e. ~0.5 samples/s at 1920x1080, with real
 * pixels and no PT-BLANK-GUARD abort. A falloff measurement needs only a band
 * MEAN over thousands of pixels, so ~40-60 samples is ample; 256 is not required.
 *
 * CAVEAT, and it is the whole reason to read the frame rather than the log: this
 * probe does NOT enter walk mode or pose the camera, so it renders the ORBIT
 * DOLLHOUSE -- the same trap `.218` caught in three other probes. Whatever runs
 * the real experiment must pose first, which is why the next step is a `PT=1`
 * branch inside `light-distribution.mjs` (which already owns ~180 lines of
 * window-finding, standoff-clamping and arrival-checked teleport) rather than a
 * standalone probe that would have to duplicate them.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/pt-feasibility'
const WAIT_MS = Number(process.env.WAIT || 120000)
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
page.on('console', (m) => {
  const t = m.text()
  if (/pathtrace|tracer|PT-|WebGL|megakernel/i.test(t)) console.log('  [page]', t.slice(0, 160))
})

await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })

const flag = await page.evaluate(() => window.__store.getState().hqRenderOpen)
console.log('hqRenderOpen before:', flag)
await page.evaluate(() => window.__store.getState().setHqRenderOpen?.(true))
await new Promise((r) => setTimeout(r, 3000))

// Report what the modal actually offers, rather than guessing selectors.
const ui = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')]
    .map((b) => (b.textContent || '').trim())
    .filter(Boolean)
  const selects = [...document.querySelectorAll('select')].map((s) => ({
    value: s.value,
    options: [...s.options].map((o) => o.value),
  }))
  const canvases = [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`)
  return { buttons, selects, canvases, open: window.__store.getState().hqRenderOpen }
})
console.log('modal open:', ui.open)
console.log('buttons:', JSON.stringify(ui.buttons))
console.log('selects:', JSON.stringify(ui.selects))
console.log('canvases:', JSON.stringify(ui.canvases))
await page.screenshot({ path: `${OUT}/modal.png` })

// Go/no-go: start the render and watch the progress text. The modal's own
// phase machine ('building' | 'rendering' | 'denoising' | 'done' | 'error') is
// component state, so poll the visible label instead of reaching into React.
const started = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => (x.textContent || '').trim() === 'Start render',
  )
  if (!b) return false
  b.click()
  return true
})
console.log('clicked Start render:', started)

const t0 = Date.now()
let last = ''
while (Date.now() - t0 < WAIT_MS) {
  const state = await page.evaluate(() => {
    const txt = document.body.innerText || ''
    const m = txt.match(/(\d+)\s*\/\s*(\d+)\s*samples?/i)
    const err = /could not|failed|error/i.test(txt)
    return { progress: m ? `${m[1]}/${m[2]}` : null, err, snippet: txt.slice(0, 0) }
  })
  const line = state.progress ?? (state.err ? 'ERROR-TEXT' : 'no-progress-text')
  if (line !== last) {
    console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s  ${line}`)
    last = line
  }
  if (state.err) break
  await new Promise((r) => setTimeout(r, 4000))
}
await page.screenshot({ path: `${OUT}/after.png` })
console.log(`frames -> ${OUT}`)
await browser.close()
