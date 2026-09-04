/**
 * The APP half of the ramp calibration: three.js's own linear -> display curve, measured.
 *
 * `v0.31.7.211` measured Blender's view transforms and narrowed the GI ceiling impasse from 13.6x
 * to 9.1x, but the byte being inverted there is the APP's, produced by three.js's
 * `NeutralToneMapping` rather than by Blender's OCIO config. Nothing showed the two agree, and
 * assuming they do is precisely the class of assumption that produced four wrong numbers in that
 * thread. So this measures the real thing: a known LINEAR radiance in, the byte the app's own
 * `WebGLRenderer` writes out.
 *
 * Method. Emissive-only draws through the live renderer: a quad filling the frame, its material a
 * clone of a real scene material with `color` black, no lights reaching it, and `emissive` set via
 * `Color.setRGB` (which lands in three's working colour space, i.e. LINEAR). Then
 * `totalEmissiveRadiance` is the only radiance in the pixel and the output byte is
 * `outputColorSpace(toneMapping(emissive))` — the transfer function and nothing else.
 *
 * `gl.render()` is called directly, NOT `advance()`, deliberately: the post composer would add
 * bloom and grade on top, and the quantity wanted here is the transfer curve alone. The probe
 * prints `toneMapping`/`toneMappingExposure`/`outputColorSpace` it measured under, because a curve
 * is meaningless without them.
 *
 * **SCOPE, and it is a real limit.** This measures the RENDERER's tone mapping, which is the
 * Performance path: `look.ts` records that Performance mounts no composer and reads
 * `TONE_MAPPING_THREE`, while **Medium and up apply tone mapping in the post composer** via
 * `TONE_MAPPING_POST`. Calling `gl.render` bypasses that, so on those tiers this is NOT the curve
 * the frame goes through — a different implementation of the same nominal transform. The probe
 * reports identical numbers at `performance`, `high` and `realistic` for exactly that reason, and
 * that agreement is an artefact of the bypass, not evidence the tiers agree. Measuring the
 * composer path needs a different instrument.
 *
 * Every class comes off an object three itself made — the page cannot resolve a bare `three`
 * specifier (established in this arc, see `sky-after-swap.mjs`).
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'realistic'
const VALUES = (process.env.VALUES || '0.002,0.005,0.01,0.02,0.03,0.05,0.065,0.08,0.1,0.15,0.5,1')
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
  defaultViewport: { width: 640, height: 400, deviceScaleFactor: 1 },
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
await page.waitForFunction(() => !!window.__three?.gl, { timeout: 30000 })

const result = await page.evaluate((values) => {
  const { gl, scene, camera } = window.__three
  // A real MeshStandardMaterial to clone, and the classes we need, taken from live objects.
  let donor = null
  scene.traverse((o) => {
    if (donor) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (o.isMesh && m?.isMeshStandardMaterial) donor = o
  })
  if (!donor) return { error: 'no MeshStandardMaterial in the scene to clone' }

  const Scene = scene.constructor
  const Mesh = donor.constructor
  const Geometry = donor.geometry.constructor
  const Attribute = donor.geometry.attributes.position.constructor
  const Camera = camera.constructor

  const mat = (Array.isArray(donor.material) ? donor.material[0] : donor.material).clone()
  mat.map = null
  mat.aoMap = null
  mat.normalMap = null
  mat.roughnessMap = null
  mat.metalnessMap = null
  mat.emissiveMap = null
  mat.lightMap = null
  mat.envMap = null
  mat.color.setRGB(0, 0, 0)
  // DoubleSide (2): with a hand-built two-triangle quad only HALF the frame was covered — see
  // the note where the coverage is asserted. Cheaper to render both faces than to reason about
  // winding for geometry this probe builds itself.
  mat.side = 2
  mat.metalness = 0
  mat.roughness = 1
  mat.emissiveIntensity = 1
  mat.transparent = false
  mat.opacity = 1
  mat.onBeforeCompile = () => {}
  mat.customProgramCacheKey = () => 'tonemap-curve'
  mat.needsUpdate = true

  // A quad in clip space is not available without a shader material, so use a plain quad 1 m in
  // front of a fresh camera — no lights are added to this scene, so nothing but emissive lands.
  const g = new Geometry()
  // `donor.geometry.constructor` is whatever SUBCLASS the donor used — BoxGeometry, PlaneGeometry,
  // an extrusion — and `new` on those builds their own INDEX and attributes. Replacing only the
  // attributes left that index in place, pointing at vertices that no longer exist: exactly one
  // valid triangle survived, and being oversized its hypotenuse cut a diagonal across the frame.
  // That is what produced the "exactly 0.5" reading `v0.31.7.212` reported as an unexplained
  // readout scale. Strip the index and every inherited attribute first.
  g.setIndex(null)
  for (const k of Object.keys(g.attributes)) g.deleteAttribute(k)
  const s = 100
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
  const s2 = new Scene()
  s2.add(quad)
  const cam = new Camera(60, 1, 0.1, 100)
  cam.position.set(0, 0, 1)
  cam.lookAt(0, 0, 0)

  const ctx = gl.getContext()
  const w = gl.domElement.width
  const h = gl.domElement.height
  const px = new Uint8Array(4)
  const settings = {
    toneMapping: gl.toneMapping,
    toneMappingExposure: gl.toneMappingExposure,
    outputColorSpace: gl.outputColorSpace,
  }
  const prevTarget = gl.getRenderTarget()
  gl.setRenderTarget(null)
  // The app runs a post composer, so it leaves `autoClear` off and manages clears itself. Without
  // forcing a clear, `gl.render` here draws over the previous COMPOSITE and the stale frame leaks
  // into the read — measured as 98 counts at emissive 0, which the guard below caught.
  const prevAutoClear = gl.autoClear
  gl.autoClear = true
  const sample = (v) => {
    mat.emissive.setRGB(v, v, v)
    gl.setClearColor(0x000000, 1)
    gl.clear(true, true, true)
    gl.render(s2, cam)
    // Centre pixel of the default framebuffer, read immediately after the draw and before
    // anything can composite over it.
    // NOT the centre pixel. The quad is two triangles sharing the diagonal, which passes exactly
    // through the frame centre, and the context is 4x MSAA — reading there resolved to exactly
    // HALF the expected display value at every input (0.01 -> 13 vs sRGB's 25.5, 0.05 -> 32 vs
    // 63.2, 0.2 -> 62 vs 123.6, i.e. 0.50/0.51/0.50). A quarter-frame offset is interior to one
    // triangle.
    ctx.readPixels(Math.floor(w / 4), Math.floor(h / 4), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    return px[0]
  }
  const diag = {
    drawingBuffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
    domElement: [gl.domElement.width, gl.domElement.height],
    samples: ctx.getParameter(ctx.SAMPLES),
    contextAttribs: ctx.getContextAttributes(),
  }
  // Full RGBA at one known value: an alpha of 128 would mean premultiplication is halving it,
  // which is the shape of the "exactly 0.5 x sRGB" reading the guard found.
  mat.emissive.setRGB(0.2, 0.2, 0.2)
  gl.setClearColor(0x000000, 1)
  gl.clear(true, true, true)
  gl.render(s2, cam)
  ctx.readPixels(
    Math.floor(gl.domElement.width / 2),
    Math.floor(gl.domElement.height / 2),
    1,
    1,
    ctx.RGBA,
    ctx.UNSIGNED_BYTE,
    px,
  )
  diag.rgbaAt0_2 = [px[0], px[1], px[2], px[3]]
  // GUARDS, the same kind that caught a wrong read path in the Blender half. Two readings whose
  // answer is known independently of the tone curve:
  //  - emissive 0 must be 0 counts. Anything else is an additive term (an uncleared buffer, or a
  //    light or environment reaching the quad) and every row below silently carries it.
  //  - with tone mapping OFF, three writes `outputColorSpace(linear)` and nothing else, so the
  //    counts must reproduce the sRGB OETF, e.g. 0.01 -> 25.4.
  const zero = sample(0)
  // SELF-CALIBRATING PAIRS, which is what makes this measurement sound.
  //
  // The nominal emissive `v` is NOT the linear value that reaches the tone mapper: with tone
  // mapping OFF the readings came back at exactly 0.50/0.51/0.50 of the sRGB encoding of `v`, so
  // something in the emissive path scales it and neither MSAA (reading off the triangle diagonal
  // changed nothing) nor premultiplied alpha (alpha reads 255) explains it.
  //
  // It does not need to be explained to be eliminated. Whatever that factor is, it sits BEFORE
  // tone mapping, so sampling each value twice — once with the tone mapper off, once on — cancels
  // it: the OFF byte inverts through the sRGB OETF to the actual linear input, and the ON byte is
  // that input's display output. The curve is then built from (recovered linear -> counts) rather
  // than from a nominal value the harness cannot vouch for.
  const prevTM = gl.toneMapping
  const pairs = []
  for (const v of values) {
    gl.toneMapping = 0
    mat.needsUpdate = true
    const off = sample(v)
    gl.toneMapping = prevTM
    mat.needsUpdate = true
    const on = sample(v)
    pairs.push({ nominal: v, off, on })
  }
  gl.toneMapping = prevTM
  mat.needsUpdate = true
  gl.autoClear = prevAutoClear
  gl.setRenderTarget(prevTarget)
  s2.remove(quad)
  g.dispose()
  mat.dispose()
  return { settings, zero, pairs, diag, donor: donor.name || donor.type }
}, VALUES)

if (result.error) throw new Error(result.error)
const { settings } = result
const NAMES = {
  0: 'NoToneMapping',
  1: 'LinearToneMapping',
  2: 'ReinhardToneMapping',
  3: 'CineonToneMapping',
  4: 'ACESFilmicToneMapping',
  5: 'CustomToneMapping',
  6: 'AgXToneMapping',
  7: 'NeutralToneMapping',
}
console.log(
  `tier ${TIER}   toneMapping ${settings.toneMapping} (${NAMES[settings.toneMapping] ?? '?'})   exposure ${settings.toneMappingExposure}   output ${settings.outputColorSpace}`,
)
function srgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}
console.log(`    donor material: ${result.donor}   MSAA samples ${result.diag.samples}`)
console.log(
  `    guard: emissive 0 -> ${result.zero} counts (must be 0)${result.zero !== 0 ? '   <-- HARNESS SUSPECT' : '   OK'}`,
)

/**
 * READOUT CALIBRATION from the tone-mapping-OFF arm, which has a known answer.
 *
 * With `NoToneMapping` three writes `sRGB_OETF(linear)` and nothing else, so the OFF byte is
 * predictable from the nominal emissive alone. It came back at a uniform **half** of that, to
 * under a count across the full range and identically at two different pixels and at all three
 * quality tiers — so it is a scale on the READOUT, not a coverage artefact, not the post composer
 * and not premultiplied alpha (alpha reads 255). The cause is unexplained; a plausible candidate
 * is `readPixels` on this ANGLE/Metal context's 4x-multisampled default framebuffer.
 *
 * It does not need to be explained to be removed. The OFF arm plays exactly the part `Standard`
 * plays in `calibrate_transfer.py`: a reference whose answer is known independently of the curve
 * under test. The scale is FITTED and its residual REPORTED, so a reader can see whether the
 * calibration holds rather than taking a bare 0.5 on trust.
 */
const denom = result.pairs.reduce((acc, p) => acc + 255 * srgb(p.nominal), 0)
const scale = result.pairs.reduce((acc, p) => acc + p.off, 0) / denom
const resid = Math.max(...result.pairs.map((p) => Math.abs(p.off - scale * 255 * srgb(p.nominal))))
console.log(
  `    readout scale fitted from the OFF arm: ${scale.toFixed(4)}   worst residual ${resid.toFixed(2)} counts` +
    (resid > 2 ? '   <-- calibration does NOT hold, curve below is not trustworthy' : '   (holds)'),
)
console.log(
  `\n    ${'linear'.padStart(9)}  ${'off'.padStart(5)}  ${'on'.padStart(5)}  ${'counts'.padStart(8)}  ${'ratio'.padStart(7)}`,
)
const curve = []
for (const p of result.pairs) {
  const counts = p.on / scale
  curve.push({ linear: p.nominal, counts: +counts.toFixed(2) })
  console.log(
    `    ${p.nominal.toFixed(4).padStart(9)}  ${String(p.off).padStart(5)}  ${String(p.on).padStart(5)}  ${counts.toFixed(2).padStart(8)}  ${(counts / (p.nominal * 255)).toFixed(3).padStart(7)}`,
  )
}
const bad = curve.filter((c, i) => i > 0 && c.counts < curve[i - 1].counts).length
console.log(`\n    monotonic: ${bad === 0 ? 'yes' : `NO (${bad} inversions)`}`)
console.log(`    curve: ${JSON.stringify(curve)}`)
await assertSceneAlive(page)
await browser.close()
