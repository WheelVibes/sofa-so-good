/**
 * Attributes an orbit frame's GPU work to each individual `renderer.render()`
 * call, so "the post tiers draw the scene ~5 times" becomes a named list rather
 * than a guess.
 *
 * three resets `renderer.info.render` at the start of every `render()`, so
 * reading it immediately AFTER each call gives that call's own draw/triangle
 * count. Each call is also tagged with the render target it drew into (size +
 * whether it was the screen), which is what identifies the pass.
 */
import puppeteer from 'puppeteer'

const TIER = process.env.TIER || 'high'
const DSF = Number(process.env.DSF || 2)

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
await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'domcontentloaded' })
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
await new Promise((r) => setTimeout(r, 5000))

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2

await page.evaluate(() => {
  const gl = window.__three.gl
  window.__ra = { seq: [], stacks: [], capturing: false }
  const orig = gl.render.bind(gl)
  window.__raRestore = () => {
    gl.render = orig
  }
  gl.render = (scene, cam) => {
    const rt = gl.getRenderTarget()
    // Capture the caller BEFORE rendering (info is only valid after).
    if (window.__ra.capturing) {
      window.__ra.stacks.push(
        new Error().stack
          .split('\n')
          .slice(1, 7)
          .map((l) => l.trim().replace(/^at /, ''))
          .join(' | '),
      )
    }
    const r = orig(scene, cam)
    if (window.__ra.capturing) {
      const calls = gl.info.render.calls
      window.__ra.seq.push({
        target: rt === null ? 'SCREEN' : `${rt.width}x${rt.height}`,
        texName: rt?.texture?.name || '',
        samples: rt?.samples ?? 0,
        calls,
        tris: gl.info.render.triangles,
        camType: cam?.type || '?',
        isMainCam: cam === window.__three.camera,
        // Only trace the expensive passes — a stack per fullscreen quad is noise.
        stack: calls > 100 ? window.__ra.stacks.shift() || '' : '',
      })
    }
    return r
  }
})

// Capture exactly one animation frame's worth of render() calls, mid-gesture.
await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 0; i < 20; i++) {
  await page.mouse.move(cx + i * 12, cy + Math.sin(i / 4) * 8, { steps: 1 })
  await new Promise((r) => setTimeout(r, 16))
}
await page.evaluate(
  () =>
    new Promise((res) => {
      // Open the window for one rAF, then close it on the next.
      requestAnimationFrame(() => {
        window.__ra.capturing = true
        requestAnimationFrame(() => {
          window.__ra.capturing = false
          res()
        })
      })
    }),
)
await page.mouse.up()

const seq = await page.evaluate(() => {
  window.__raRestore()
  return window.__ra.seq
})
console.log(`\n=== ${TIER}: renderer.render() calls in ONE orbit frame (${seq.length} total) ===`)
let total = 0
for (const [i, s] of seq.entries()) {
  total += s.calls
  if (s.calls <= 100) continue
  console.log(
    `${String(i).padStart(2)}  target=${s.target.padEnd(11)} name="${s.texName}" msaa=${s.samples} cam=${s.camType} main=${s.isMainCam}  drawcalls=${s.calls}  tris=${s.tris}`,
  )
  console.log(`     via: ${s.stack}`)
}
console.log(`total draw calls this frame: ${total}`)
console.log(`full-scene passes: ${seq.filter((s) => s.calls > 100).length}`)
await browser.close()
