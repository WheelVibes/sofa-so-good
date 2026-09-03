/**
 * Steady-state orbit FPS per render tier, with the tier PINNED (`qualityUserSet`)
 * so the adaptive guard can't move it mid-measurement. This is the data behind
 * the auto-detect ceiling: an auto-selected tier is only defensible if it holds
 * the 30fps floor on the hardware it is selected for.
 *
 * `AOSTRESS=<minSizeM>` attaches a DISTINCT baked-style `aoMap` (plus a `uv1` channel) to every
 * shell-sized mesh before measuring, so item (w)'s proposed fix can be **priced in frames
 * before it is built**. The arc has repeatedly claimed that fix is free — "one texture fetch in
 * a shader that already runs" — and that claim rests on an assumption worth testing: a distinct
 * map per wall means a distinct texture bind per wall, which would break batching if the walls
 * currently shared a material.
 *
 * The stress uses the mesh's existing UVs for `uv1`. That is deliberate: the *cost* of sampling
 * an `aoMap` does not depend on the UV values, only on the extra attribute, the bind and the
 * fetch — so this measures the shipped feature's frame cost exactly while needing none of its
 * correctness.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const TIERS = (process.env.TIERS || 'performance,realistic').split(',')
const DSF = Number(process.env.DSF || 2)
// Viewport in CSS px. The DPR ceiling (`dprMax`) caps the pixel RATIO but not
// the viewport SIZE, so a large display is the uncapped cost variable: a 5K iMac
// fullscreen at DPR 2 is ~14.7M drawing-buffer pixels against ~4.1M on a laptop.
const [VPW, VPH] = (process.env.VP || '1280,800').split(',').map(Number)
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
await page.setViewport({ width: VPW, height: VPH, deviceScaleFactor: DSF })
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
const b = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = b.x + b.w / 2,
  cy = b.y + b.h / 2
console.log(
  `viewport ${VPW}x${VPH} @ dpr ${DSF}  (drawing buffer ${VPW * DSF}x${VPH * DSF} = ${(
    (VPW * DSF * VPH * DSF) / 1e6
  ).toFixed(1)}M px)`,
)
for (const tier of TIERS) {
  // setQualityTier pins `qualityUserSet`, disabling the adaptive guard.
  await page.evaluate((t) => window.__store.getState().setQualityTier(t), tier)
  await page
    .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))
  if (process.env.AOSTRESS) {
    const applied = await page.evaluate((minSize) => {
      const { scene, gl } = window.__three
      // three is not a global in the page, so borrow a Texture constructor from whatever the
      // scene already holds. NOT `scene.background` alone: that is a canvas-backed equirect in
      // WALK mode only, and this harness measures ORBIT, where it is absent.
      let TextureCtor = null
      scene.traverse((o) => {
        if (TextureCtor) return
        const m = o.material
        for (const mm of Array.isArray(m) ? m : [m]) {
          if (mm?.map?.isTexture) {
            TextureCtor = mm.map.constructor
            return
          }
        }
      })
      TextureCtor = TextureCtor ?? scene.background?.constructor ?? scene.environment?.constructor
      if (typeof TextureCtor !== 'function') return { error: 'no Texture instance to borrow from' }
      const before = { calls: gl.info.render.calls, programs: gl.info.programs?.length ?? null }
      let n = 0
      scene.traverse((o) => {
        const g = o.geometry
        const m = o.material
        if (!g || !m || Array.isArray(m) || !('aoMap' in m) || m.aoMap) return
        if (!g.boundingBox) g.computeBoundingBox()
        const bb = g.boundingBox
        const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)
        if (span < minSize) return
        // A DISTINCT texture per mesh. Sharing one would measure the wrong thing entirely,
        // since the question is precisely whether per-wall maps cost extra binds.
        const S = 64
        const cv = document.createElement('canvas')
        cv.width = S
        cv.height = S
        const ctx = cv.getContext('2d')
        const img = ctx.createImageData(S, S)
        for (let i = 0; i < S * S; i++) {
          const v = (i * 7 + n * 13) % 256
          img.data[i * 4] = v
          img.data[i * 4 + 1] = v
          img.data[i * 4 + 2] = v
          img.data[i * 4 + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
        const tex = new TextureCtor(cv)
        tex.needsUpdate = true
        m.aoMap = tex
        m.aoMapIntensity = 0.7
        // `aoMap` samples uv1. Values are irrelevant to COST -- only the extra attribute,
        // the bind and the fetch are -- so the existing uv is reused deliberately.
        if (g.attributes.uv && !g.attributes.uv1) g.setAttribute('uv1', g.attributes.uv)
        m.needsUpdate = true
        n++
      })
      return { n, before }
    }, Number(process.env.AOSTRESS) || 1.5)
    if (applied.error) throw new Error(`AOSTRESS: ${applied.error}`)
    // WARM UP BEFORE MEASURING. Setting `needsUpdate` forces three to compile a new shader
    // variant per affected material, and the first run of this stress recorded a 216 ms worst
    // frame with programs going 133 -> 151: a compilation hitch, not a steady-state cost.
    // Shipped, these maps exist at first compile and that hitch never happens, so measuring it
    // would price a cost the feature does not have. (It is still a real constraint on the
    // DESIGN -- attach at material creation, never toggle at runtime -- which is why the
    // program count is reported rather than just waited out.)
    await page.evaluate(() => {
      for (let i = 0; i < 30; i += 1) window.__three.advance(performance.now() + i * 16)
    })
    await new Promise((r) => setTimeout(r, 4000))
    // Draw calls must be read straight after a render: `gl.info.render` is per-frame and reads
    // as a stale 1 outside one, which is what the first attempt reported.
    const after = await page.evaluate(() => {
      const { scene, gl } = window.__three
      let withAo = 0
      scene.traverse((o) => {
        const m = o.material
        if (m && !Array.isArray(m) && m.aoMap) withAo += 1
      })
      // NOTE: `gl.info.render.calls` is deliberately NOT reported. `advance()` does not leave
      // the counters readable from here -- it returns calls 1 / triangles 1, which is plainly
      // wrong for this scene -- and a number that is obviously bogus is still a number someone
      // will quote. `gl.info.programs` IS reliable and is the one that matters here anyway.
      return { withAo, programs: gl.info.programs?.length ?? null }
    })
    if (!after.withAo) throw new Error('AOSTRESS: no material kept an aoMap -- nothing measured')
    console.log(
      `  AOSTRESS attached ${applied.n} distinct aoMaps; still attached after settle: ${after.withAo}` +
        `  shader programs ${applied.before.programs} -> ${after.programs}`,
    )
  }
  await page.evaluate(() => {
    window.__f = { n: 0, t0: 0, worst: 0, last: 0 }
    const tick = (t) => {
      const f = window.__f
      if (f.t0 === 0) {
        f.t0 = t
        f.last = t
      } else {
        const d = t - f.last
        f.last = t
        if (d > f.worst) f.worst = d
        f.n++
      }
      f.raf = requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 140; i++) {
    await page.mouse.move(cx + Math.sin(i / 10) * 260, cy + Math.cos(i / 14) * 90, { steps: 1 })
    await new Promise((r) => setTimeout(r, 8))
  }
  await page.mouse.up()
  const r = await page.evaluate(() => {
    const f = window.__f
    cancelAnimationFrame(f.raf)
    const secs = (f.last - f.t0) / 1000
    return { fps: +(f.n / secs).toFixed(1), worstFrameMs: +f.worst.toFixed(1) }
  })
  console.log(
    `${tier.padEnd(12)} orbit fps=${String(r.fps).padStart(5)}  worst frame=${String(r.worstFrameMs).padStart(6)}ms  ${r.fps >= 30 ? 'OK' : 'BELOW 30fps FLOOR'}`,
  )
}
await browser.close()
