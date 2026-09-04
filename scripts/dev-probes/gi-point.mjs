/**
 * CO-LOCATED SAMPLING — the baked irradiance at the exact point a reference measures.
 *
 * **Why this exists.** Four rounds (`v0.31.7.170`-`.172`, `.180`) failed to settle whether the GI's
 * ceiling deficit is the bake under-measuring or the app mis-rendering a correct map, and `.180`
 * finally named the reason: the bake reports statistics per **MESH** while every frame measurement
 * is per **PATCH**. For a wall those are different quantities — the mesh mean is inflated by texels
 * beside the window while the patch is a shaded region metres away — so every "N x discrepancy" in
 * that thread compared two things that were never comparable.
 *
 * This closes it by asking the only question that is well posed: **what does the map say AT THIS
 * POINT?** It casts a ray from a stated camera, takes the hit mesh's interpolated `uv1`, and reads
 * the map PNG on disk at those texels. `E_baked = texel * scale`.
 *
 * `?aoDebug=1` cannot do this: it writes the sampled value to `gl_FragColor`, but three's
 * `tonemapping_fragment` still runs afterwards, so the byte is tone-mapped and not invertible.
 * Reading the PNG off disk has no such problem.
 *
 * **No rendering is involved**, which is what makes it simple: a raycast needs only matrices, so
 * the camera can be stated outright instead of reproduced through walk-mode teleports and pitch
 * refs. Pass the SAME camera the Cycles reference used (a BLENDREF manifest records it) and the two
 * measurements land on the same surface point by construction.
 *
 * Also reports the hit material's `color`, because converting a rendered radiance back to
 * irradiance needs the albedo: `E_render = R * pi / rho`.
 *
 * Usage:
 *   node scripts/dev-probes/gi-point.mjs \
 *     --cam=7.325,1.6,3.4 --target=7.325,1.42012,0.4054 --fov=50 --aspect=1.6 \
 *     -- wall=-0.78,-0.43 ceiling=-0.66,0.89
 */
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const argOf = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`))
  return a ? a.slice(k.length + 3) : d
}
const nums = (s) => s.split(',').map(Number)
const CAM = nums(argOf('cam', '0,1.6,0'))
const TARGET = nums(argOf('target', '0,1.6,-1'))
const FOV = Number(argOf('fov', '50'))
const ASPECT = Number(argOf('aspect', '1.6'))
const TIER = process.env.TIER || 'realistic'
const points = process.argv.slice(process.argv.indexOf('--') + 1).map((s) => {
  const [label, xy] = s.split('=')
  const [x, y] = nums(xy)
  return { label, x, y }
})
if (!points.length) {
  console.error('give at least one `label=ndcX,ndcY` after --')
  process.exit(1)
}

// Camera basis, built here rather than in the page so the ray is reproducible from the CLI alone.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (v) => {
  const n = Math.hypot(...v) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const fwd = norm(sub(TARGET, CAM))
const right = norm(cross(fwd, [0, 1, 0]))
const up = cross(right, fwd)
const tanHalfV = Math.tan((FOV * Math.PI) / 360)
const rays = points.map((p) => {
  const cx = p.x * ASPECT * tanHalfV
  const cy = p.y * tanHalfV
  return {
    label: p.label,
    dir: norm([
      fwd[0] + right[0] * cx + up[0] * cy,
      fwd[1] + right[1] * cx + up[1] * cy,
      fwd[2] + right[2] * cx + up[2] * cy,
    ]),
  }
})

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await new Promise((r) => setTimeout(r, 5000))
await assertSceneAlive(page, 'after tier')

const hits = await page.evaluate(
  ({ origin, rays }) => {
    // Classes from objects three itself created — the page cannot resolve a bare `three`
    // specifier, and every probe in this arc that raycasts uses this idiom.
    const scene = window.__three.scene
    const rc = new window.__three.raycaster.constructor()
    const V3 = window.__three.camera.position.constructor
    rc.firstHitOnly = false
    const out = []
    for (const r of rays) {
      rc.set(new V3(...origin), new V3(...r.dir))
      // Opaque geometry only: a raycast that stops on the glass or a helper reports the wrong
      // surface, which is the same class of error as a mis-placed patch.
      const all = rc.intersectObjects(scene.children, true).filter((h) => {
        const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
        return h.object.visible && m && m.transparent !== true && m.opacity !== 0
      })
      const h = all[0]
      if (!h) {
        out.push({ label: r.label, miss: true })
        continue
      }
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
      // THE GAIN THE MATERIAL WILL ACTUALLY USE, read rather than recomputed.
      // `onBeforeCompile` is where the injection binds `visGain`, so invoking it with a stub
      // shader reports the value the draw call will see. `v0.31.7.188` left two candidates for a
      // 4-9x shortfall in the app's map application and this is the one that is directly
      // readable: if `visGain` is not `scaleFor * IRRADIANCE_GAIN`, nothing downstream can be
      // right. Same technique the unit tests use.
      let visGain = null
      try {
        const stub = {
          uniforms: {},
          vertexShader: 'void main() {\n#include <begin_vertex>\n}',
          fragmentShader:
            'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
        }
        m?.onBeforeCompile?.(stub, null)
        visGain = stub.uniforms?.visGain?.value ?? null
      } catch (e) {
        visGain = `ERR:${e.message}`
      }
      out.push({
        label: r.label,
        visGain,
        name: h.object.name || '(anon)',
        dist: Number(h.distance.toFixed(3)),
        point: [h.point.x, h.point.y, h.point.z].map((v) => Number(v.toFixed(3))),
        uv1: h.uv1 ? [Number(h.uv1.x.toFixed(5)), Number(h.uv1.y.toFixed(5))] : null,
        url: m?.userData?.visMapUrl ?? null,
        color: m?.color ? [m.color.r, m.color.g, m.color.b].map((v) => Number(v.toFixed(4))) : null,
      })
    }
    return out
  },
  { origin: CAM, rays },
)
await browser.close()

const idx = JSON.parse(readFileSync('public/assets/lightmaps/index.json', 'utf8'))
const scaleOf = new Map(idx.maps.map((m) => [m.file, m.scale]))

console.log(
  `cam=${CAM.join(',')} -> ${TARGET.join(',')}  fov=${FOV} aspect=${ASPECT}  tier=${TIER}`,
)
for (const h of hits) {
  if (h.miss) {
    console.log(`  ${h.label.padEnd(10)} MISS`)
    continue
  }
  let texel = null
  let scale = null
  if (h.url && h.uv1) {
    const file = `public/assets/${h.url.split('/assets/').pop()}`
    scale = scaleOf.get(file.split('/').pop()) ?? null
    const img = sharp(file).removeAlpha()
    const meta = await img.metadata()
    const data = await img.raw().toBuffer()
    // Nearest texel, matching how the sampler reads it closely enough for a point probe.
    // v flipped: glTF/three UV origin is bottom-left, image rows run top-down.
    const px = Math.min(meta.width - 1, Math.max(0, Math.round(h.uv1[0] * meta.width - 0.5)))
    const py = Math.min(
      meta.height - 1,
      Math.max(0, Math.round((1 - h.uv1[1]) * meta.height - 0.5)),
    )
    texel = data[(py * meta.width + px) * meta.channels] / 255
  }
  const rho = h.color ? (h.color[0] + h.color[1] + h.color[2]) / 3 : null
  const E = texel !== null && scale !== null ? texel * scale : null
  console.log(
    `  ${h.label.padEnd(10)} ${h.name.padEnd(12)} d=${String(h.dist).padStart(6)} at=${h.point.join(',')}  ` +
      `uv1=${h.uv1 ? h.uv1.join(',') : '(none)'}  map=${h.url ? h.url.split('/').pop() : '(none)'}\n` +
      `             texel=${texel === null ? '?' : texel.toFixed(4)}  scale=${scale === null ? '?' : scale.toFixed(4)}` +
      `  visGain=${h.visGain === null ? '?' : h.visGain}  expect=${scale === null ? '?' : (scale * 6).toFixed(4)}` +
      `  E_baked=${E === null ? '?' : E.toFixed(4)}  rho=${rho === null ? '?' : rho.toFixed(3)}`,
  )
}
