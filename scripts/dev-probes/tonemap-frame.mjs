/**
 * The FULL-PIPELINE transfer curve: known linear radiance in, SCREENSHOT byte out.
 *
 * `v0.31.7.212` measured the renderer's tone mapping with `gl.render` and flagged the obvious hole:
 * Medium and up tone map in the POST COMPOSER, which that call bypasses. Reading
 * `toneMappingPost.ts` narrows the worry — `postprocessing`'s tone-mapping shader `#include`s
 * three's OWN `<tonemapping_pars_fragment>` chunk and reads the same `toneMappingExposure` uniform,
 * so the operator is shared source rather than a second implementation. But the composer also runs
 * bloom, hue/saturation, vignette, grain and SMAA, and every one of those moves the final byte.
 *
 * So this measures the thing that actually matters. Every figure in the GI ceiling thread came from
 * a SCREENSHOT of the running app, including the 85.7 the whole 16.8x rests on. Measuring through
 * `page.screenshot()` means the instrument and the quantity share a path, and no cross-path
 * calibration is needed — which is what went wrong when the renderer curve stood in for it.
 *
 * Method. An emissive quad is parented to the live camera at local z = -0.5, so it fills the frame
 * from any pose: `color` black and no light reaching it, `emissive` set through `Color.setRGB` (in
 * three's working space, i.e. linear), and `toneMapped` left alone so it takes the app's real path.
 * `advance()` drives r3f's synchronous pipeline WITH the composer (`gl.render` would skip it). The
 * patch is read from the frame CENTRE because vignette darkens the edges by design.
 *
 * Guards: emissive 0 must read near 0 (bloom and grain can lift it a little, so the threshold is
 * stated rather than assumed to be exact), and the curve must be monotonic or no inversion built
 * on it is well defined.
 */
import { writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'realistic'
const VALUES = (
  process.env.VALUES || '0,0.002,0.005,0.01,0.02,0.03,0.05,0.065,0.08,0.1,0.15,0.3,0.6,1'
)
  .split(',')
  .map(Number)

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
  defaultViewport: { width: 800, height: 500, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))
await page.waitForFunction(() => !!window.__three?.advance, { timeout: 30000 })

const setup = await page.evaluate(() => {
  const { scene, camera } = window.__three
  let donor = null
  scene.traverse((o) => {
    if (donor) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (o.isMesh && m?.isMeshStandardMaterial) donor = o
  })
  if (!donor) return { error: 'no MeshStandardMaterial to clone' }
  const Mesh = donor.constructor
  const Geometry = donor.geometry.constructor
  const Attribute = donor.geometry.attributes.position.constructor
  const mat = (Array.isArray(donor.material) ? donor.material[0] : donor.material).clone()
  for (const k of [
    'map',
    'aoMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'lightMap',
    'envMap',
  ]) {
    mat[k] = null
  }
  mat.color.setRGB(0, 0, 0)
  // envMapIntensity 0 as well as a null envMap: `scene.environment` reaches a MeshStandardMaterial
  // regardless of `material.envMap`, and at metalness 0 the F0 = 0.04 specular term against a
  // bright sky is not negligible — it put a 127.55-count pedestal under the whole curve, which
  // the emissive-0 guard caught.
  mat.envMapIntensity = 0
  // DoubleSide (2): with a hand-built two-triangle quad only HALF the frame was covered — see
  // the note where the coverage is asserted. Cheaper to render both faces than to reason about
  // winding for geometry this probe builds itself.
  mat.side = 2
  mat.metalness = 0
  mat.roughness = 1
  mat.emissiveIntensity = 1
  mat.transparent = false
  mat.opacity = 1
  // Depth ON and the quad parked just past the near plane, so it occludes by DEPTH rather than by
  // draw order. With depthTest off the quad was drawn but the opaque scene painted over it, so the
  // frame showed the dollhouse against a black sky — the quad was measuring the sky region only.
  mat.depthTest = true
  mat.depthWrite = true
  mat.onBeforeCompile = () => {}
  mat.customProgramCacheKey = () => 'tonemap-frame'
  mat.needsUpdate = true
  const g = new Geometry()
  // `donor.geometry.constructor` is whatever SUBCLASS the donor used — BoxGeometry, PlaneGeometry,
  // an extrusion — and `new` on those builds their own INDEX and attributes. Replacing only the
  // attributes left that index in place, pointing at vertices that no longer exist: exactly one
  // valid triangle survived, and being oversized its hypotenuse cut a diagonal across the frame.
  // That is what produced the "exactly 0.5" reading `v0.31.7.212` reported as an unexplained
  // readout scale. Strip the index and every inherited attribute first.
  g.setIndex(null)
  for (const k of Object.keys(g.attributes)) g.deleteAttribute(k)
  const s = 4
  g.setAttribute(
    'position',
    new Attribute(
      new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, -s, 0, s, s, 0, -s, s, 0]),
      3,
    ),
  )
  g.setAttribute(
    'normal',
    new Attribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  )
  g.setAttribute('uv', new Attribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2))
  const quad = new Mesh(g, mat)
  quad.position.set(0, 0, -0.15)
  quad.renderOrder = 9999
  quad.frustumCulled = false
  // Parented to the CAMERA so it fills the frame from any pose. The camera may not itself be in
  // the scene graph under r3f, so make sure it is or the child never renders.
  if (!camera.parent) scene.add(camera)
  camera.add(quad)
  window.__toneQuad = { quad, mat }
  return {
    donor: donor.name || donor.type,
    toneMapping: window.__three.gl.toneMapping,
    exposure: window.__three.gl.toneMappingExposure,
    look: window.__store.getState().toneMappingMode ?? '(default)',
  }
})
if (setup.error) throw new Error(setup.error)
console.log(
  `tier ${TIER}   gl.toneMapping ${setup.toneMapping}   exposure ${setup.exposure}   look ${setup.look}   donor ${setup.donor}`,
)

const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
})

const rows = []
for (const v of VALUES) {
  await page.evaluate((val) => {
    window.__toneQuad.mat.emissive.setRGB(val, val, val)
    window.__three.advance(performance.now() / 1000)
  }, v)
  await new Promise((r) => setTimeout(r, 400))
  const shot = await page.screenshot({ type: 'png' })
  const png = `/tmp/tonemap-frame-${v}.png`
  writeFileSync(png, shot)
  // Centre patch only: the vignette pass darkens the frame edges deliberately.
  const cw = Math.floor(box.w / 4)
  const ch = Math.floor(box.h / 4)
  const { data, info } = await sharp(shot)
    .extract({
      left: box.x + Math.floor(box.w / 2 - cw / 2),
      top: box.y + Math.floor(box.h / 2 - ch / 2),
      width: cw,
      height: ch,
    })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  const px = info.width * info.height
  for (let i = 0; i < px; i++) sum += data[i * info.channels]
  // COVERAGE GUARD. The quad must fill the frame, and for one whole round it did not: an
  // inherited geometry index left a single oversized triangle whose hypotenuse cut the frame in
  // half, and the patch read a mixture of quad and scene. A flat emitter must give a FLAT patch,
  // so the spread inside it is the check — a diagonal edge through the patch shows up as a large
  // one immediately.
  let lo = 255
  let hi = 0
  for (let i = 0; i < px; i++) {
    const c = data[i * info.channels]
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  rows.push({ linear: v, counts: sum / px, spread: hi - lo })
}

console.log(
  `    ${'linear'.padStart(9)}  ${'counts'.padStart(8)}  ${'ratio'.padStart(7)}  ${'spread'.padStart(6)}`,
)
for (const r of rows) {
  console.log(
    `    ${r.linear.toFixed(4).padStart(9)}  ${r.counts.toFixed(2).padStart(8)}  ${(r.linear > 0 ? r.counts / (r.linear * 255) : Number.NaN).toFixed(3).padStart(7)}  ${String(r.spread).padStart(6)}`,
  )
}
const worstSpread = Math.max(...rows.map((r) => r.spread))
console.log(
  `\n    guard: worst in-patch spread ${worstSpread} counts` +
    (worstSpread > 12
      ? '   <-- the patch is NOT uniform, the quad may not cover it (see the coverage note)'
      : '   OK (flat emitter, flat patch)'),
)
const zero = rows.find((r) => r.linear === 0)
const bad = rows.filter((r, i) => i > 0 && r.counts < rows[i - 1].counts).length
console.log(
  `\n    guard: emissive 0 -> ${zero ? zero.counts.toFixed(2) : 'not sampled'} counts` +
    (zero && zero.counts > 3 ? '   <-- NOT dark, something else is lighting the patch' : '   OK'),
)
console.log(`    monotonic: ${bad === 0 ? 'yes' : `NO (${bad} inversions)`}`)
console.log(
  `    curve: ${JSON.stringify(rows.map((r) => ({ linear: r.linear, counts: +r.counts.toFixed(2) })))}`,
)
await assertSceneAlive(page)
await browser.close()
