/**
 * WHERE does an orbit frame's cost go, per tier?
 *
 * Reads three's own `renderer.info` around a single rendered frame — draw calls,
 * triangles, programs — plus how many times `renderer.render()` is invoked per
 * animation frame (the scene can be re-rendered several times: shadow map,
 * transmission pass, AO depth/normal prepass, then each composer pass). Cheap
 * counters only, so it doesn't perturb the timing the way GL-call wrapping does.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIERS = (process.env.TIERS || 'performance,medium,high,maximum').split(',')
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

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2,
  cy = box.y + box.h / 2

for (const tier of TIERS) {
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))

  // Instrument renderer.render to attribute work per animation frame. `info` is
  // reset by three at the start of each render(), so accumulate before it resets.
  await page.evaluate(() => {
    const gl = window.__three.gl
    window.__fc = { renders: 0, calls: 0, tris: 0, frames: 0, shadowRenders: 0 }
    const orig = gl.render.bind(gl)
    window.__fcRestore = () => {
      gl.render = orig
    }
    gl.render = (scene, cam) => {
      const r = orig(scene, cam)
      const f = window.__fc
      f.renders++
      f.calls += gl.info.render.calls
      f.tris += gl.info.render.triangles
      return r
    }
    const tick = () => {
      window.__fc.frames++
      window.__fc.raf = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 90; i++) {
    await page.mouse.move(cx + Math.sin(i / 9) * 250, cy + Math.cos(i / 13) * 85, { steps: 1 })
    await new Promise((r) => setTimeout(r, 10))
  }
  await page.mouse.up()

  const r = await page.evaluate(() => {
    const f = window.__fc
    cancelAnimationFrame(f.raf)
    window.__fcRestore()
    const gl = window.__three.gl
    return {
      rendersPerFrame: +(f.renders / f.frames).toFixed(1),
      callsPerFrame: Math.round(f.calls / f.frames),
      trisPerFrame: Math.round(f.tris / f.frames),
      programs: gl.info.programs?.length ?? -1,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    }
  })
  console.log(
    `${tier.padEnd(12)} render() calls/frame=${String(r.rendersPerFrame).padStart(5)}  drawcalls/frame=${String(r.callsPerFrame).padStart(5)}  tris/frame=${String(r.trisPerFrame).padStart(8)}  programs=${String(r.programs).padStart(4)}  geom=${r.geometries} tex=${r.textures}`,
  )
}
await browser.close()
