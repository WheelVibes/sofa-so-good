/**
 * BLOOM-THRESHOLD — does Bloom smear NON-EMISSIVE surfaces at night?
 *
 * At 21:00 with the fixtures on, the Maximum frame carries soft white haloes along
 * the wall top caps that Medium (AO-only composer, no Bloom) does not. RD-409's
 * contract says Bloom exists to glow genuinely-emissive fixtures and that
 * `look.BLOOM.luminanceThreshold` (1.35) sits ABOVE broad lit surfaces and BELOW the
 * `fixtureGlow` emitter peaks. So the falsifiable question is narrow: do ordinary
 * painted wall caps CLEAR 1.35 in scene-referred HDR at night?
 *
 * Toggling Bloom is not the way to ask. The effect instance is not reachable from
 * `window.__three`, mutating `look.BLOOM` does nothing because `EffectsImpl`
 * re-renders zero times during a session, and dropping the whole post stack would
 * change AO and the tone mapper too — three different ways to measure the wrong
 * thing. Instead this reads the domain the threshold actually tests: the scene is
 * rendered into a FLOAT render target, and three applies tone mapping ONLY when
 * `_currentRenderTarget === null` (TONE-POST), so that target holds raw
 * scene-referred linear HDR — the same values Bloom's luminance test sees, since
 * Bloom runs before the tone mapper on scene-referred input.
 *
 * Pixels are bucketed by a GEOMETRIC mask (meta-rule xii), not by eye:
 *   cap     — world normal up, hit above CAP_MIN_Y, on a mesh whose bounding box is
 *             wall-shaped (~2.6 m tall and thin), which excludes floors, worktops
 *             and wardrobe tops, the other up-facing surfaces at that height.
 *   wall    — near-vertical normal.
 *   emitter — a material with a non-black emissive; the population Bloom is FOR,
 *             and the reference that proves the threshold is being cleared by
 *             something.
 * Reported as p50/p90/p99 and a fraction over threshold, never a mean (meta-rule xv).
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'medium'
const HOUR = Number(process.env.HOUR || 13)

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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
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
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const LIGHTS = process.env.LIGHTS || 'on'
const GRID_W = Number(process.env.GRID_W || 220)
const GRID_H = Number(process.env.GRID_H || 140)
const CAP_MIN_Y = Number(process.env.CAP_MIN_Y || 2.0)
const THRESHOLD = Number(process.env.THRESHOLD || 1.35)

await page.evaluate((m) => window.__store.getState().setLightsMode(m), LIGHTS)
await new Promise((r) => setTimeout(r, 2500))
await assertSceneAlive(page, 'lights on')

const result = await page.evaluate(
  async ({ gw, gh, capMinY, threshold }) => {
    const { scene, camera, gl } = window.__three
    // Vite serves node_modules in dev; try the usual specifiers in turn so this
    // does not silently depend on one build layout.
    let THREE = null
    for (const spec of [
      '/node_modules/three/build/three.module.js',
      '/node_modules/.vite/deps/three.js',
      'three',
    ]) {
      try {
        THREE = await import(/* @vite-ignore */ spec)
        if (THREE?.WebGLRenderTarget) break
      } catch {}
    }
    if (!THREE?.WebGLRenderTarget) return { error: 'could not import three' }

    const w = Math.min(1280, gl.domElement.width)
    const h = Math.min(800, gl.domElement.height)
    // FloatType + no tone mapping: `WebGLRenderer.getProgram` only applies
    // `renderer.toneMapping` when the render target is null, so this target holds
    // raw scene-referred linear HDR.
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.FloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    })
    const prevTarget = gl.getRenderTarget()
    gl.setRenderTarget(rt)
    gl.render(scene, camera)
    gl.setRenderTarget(prevTarget)
    const buf = new Float32Array(w * h * 4)
    gl.readRenderTargetPixels(rt, 0, 0, w, h, buf)
    rt.dispose()

    const rc = new window.__three.raycaster.constructor()
    const n = new camera.position.constructor()
    const buckets = { cap: [], wall: [], emitter: [] }
    let capMeshes = 0
    // Live fixture lights, so an over-threshold surface pixel can be attributed:
    // three's pointLight is a DELTA light (irradiance ~ 1/d^2 with no bulb radius),
    // so a surface a few cm from one is unboundedly bright. That is a very
    // different cause — and a different fix — from a light misplaced inside a wall.
    const lights = []
    scene.traverse((o) => {
      if ((o.isPointLight || o.isSpotLight) && o.intensity > 0) {
        lights.push({ p: o.getWorldPosition(new camera.position.constructor()), i: o.intensity })
      }
    })
    const hot = []
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const sx = (i + 0.5) / gw
        const sy = (j + 0.5) / gh
        rc.setFromCamera({ x: sx * 2 - 1, y: 1 - sy * 2 }, camera)
        const r = rc.intersectObjects(scene.children, true)
        const hit = r.find((k) => k.object.visible && k.object.material?.colorWrite !== false)
        if (!hit?.face) continue
        n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)

        // readRenderTargetPixels has its origin at the BOTTOM-left.
        const px = Math.min(w - 1, Math.floor(sx * w))
        const py = Math.min(h - 1, Math.floor((1 - sy) * h))
        const o = (py * w + px) * 4
        const lum = 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2]
        if (!Number.isFinite(lum)) continue

        const mat = hit.object.material
        const em = mat?.emissive
        const emissive = em ? em.r + em.g + em.b : 0
        if (emissive > 0.01 && (mat.emissiveIntensity ?? 1) > 0) {
          buckets.emitter.push(lum)
          continue
        }

        if (lum > threshold) {
          let best = Infinity
          let bi = 0
          for (const L of lights) {
            const d = L.p.distanceTo(hit.point)
            if (d < best) {
              best = d
              bi = L.i
            }
          }
          hot.push({ lum: +lum.toFixed(2), d: +best.toFixed(3), li: +bi.toFixed(1) })
        }
        if (n.y > 0.9 && hit.point.y > capMinY) {
          // Wall-shaped only: ~2.6 m tall and thin. Without this the bucket also
          // collects wardrobe tops and high shelves, which are up-facing at the
          // same height and are NOT the surface under investigation.
          const g = hit.object.geometry
          g.computeBoundingBox?.()
          const bb = g.boundingBox
          if (!bb) continue
          const dy = bb.max.y - bb.min.y
          const dx = bb.max.x - bb.min.x
          const dz = bb.max.z - bb.min.z
          const thin = Math.min(dx, dz) < 0.4
          if (Math.abs(dy - 2.6) < 0.2 && thin) {
            buckets.cap.push(lum)
            capMeshes++
          }
        } else if (Math.abs(n.y) < 0.2) {
          buckets.wall.push(lum)
        }
      }
    }
    const stat = (a) => {
      const s = a.slice().sort((x, y) => x - y)
      const q = (p) =>
        s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3) : 0
      return {
        n: a.length,
        p50: q(0.5),
        p90: q(0.9),
        p99: q(0.99),
        max: s.length ? +s[s.length - 1].toFixed(3) : 0,
        over: a.length ? +((a.filter((v) => v > threshold).length / a.length) * 100).toFixed(2) : 0,
      }
    }
    return {
      cap: stat(buckets.cap),
      wall: stat(buckets.wall),
      emitter: stat(buckets.emitter),
      capMeshes,
      lightCount: lights.length,
      hot: hot.sort((a, b) => b.lum - a.lum).slice(0, 12),
      hotNearDist: (() => {
        const d = hot.map((h) => h.d).sort((a, b) => a - b)
        const q = (pp) => (d.length ? +d[Math.floor(d.length * pp)].toFixed(3) : 0)
        return { n: d.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) }
      })(),
    }
  },
  { gw: GRID_W, gh: GRID_H, capMinY: CAP_MIN_Y, threshold: THRESHOLD },
)

console.log(
  `tier=${TIER} hour=${HOUR} lights=${LIGHTS} — scene-referred HDR, threshold ${THRESHOLD}\n`,
)
if (result.error) {
  console.log(`FAILED: ${result.error}`)
} else {
  console.log('bucket      n     p50     p90     p99     max   over%')
  for (const k of ['cap', 'wall', 'emitter']) {
    const s = result[k]
    console.log(
      `${k.padEnd(9)} ${String(s.n).padStart(4)} ${String(s.p50).padStart(7)} ` +
        `${String(s.p90).padStart(7)} ${String(s.p99).padStart(7)} ${String(s.max).padStart(7)} ` +
        `${String(s.over).padStart(7)}`,
    )
  }
  console.log(
    `\n${result.lightCount} live lights — distance from each OVER-THRESHOLD pixel to its nearest light:`,
  )
  const hd = result.hotNearDist
  console.log(`  n=${hd.n}  p10=${hd.p10}m  p50=${hd.p50}m  p90=${hd.p90}m`)
  console.log(
    '  hottest pixels (scene-referred lum, distance to nearest light, that light intensity):',
  )
  for (const h of result.hot) console.log(`    lum=${h.lum}  d=${h.d}m  I=${h.li}`)
}
await browser.close()
