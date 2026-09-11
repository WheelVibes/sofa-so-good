/**
 * FILL-CHROMA-AB — how much of the app's chroma compression is the NEUTRAL half of the fill?
 *
 * `v0.34.1.3` measured the app's indirect term against a physical Cycles reference: its chroma
 * range is 35 % narrower than physics, it renders about half the sky-bounce blue, and it adds
 * chroma to surfaces that should have almost none. One cause covers that and the luminance
 * compression — a flat achromatic term added to every surface.
 *
 * The app's fill is TWO lights (`Lighting.tsx`), and only one of them is flat:
 *
 *   hemisphereLight  intensity = ambient * 1.1  · skyColor [0.55,0.66,0.92], ground [0.42,0.38,0.34]
 *   ambientLight     intensity = ambient * 0.35 · white-balance only — NO colour, NO direction
 *
 * At 13:00 `ambient` is 0.6, so **24 % of the fill is the pure-neutral light**. This probe asks
 * what happens if that share moves into the hemisphere at CONSTANT TOTAL — the sum is pinned, so
 * the arms differ in distribution only and a level change cannot be mistaken for a chroma win.
 *
 * Why the hemisphere is the right home indoors, which is not obvious: three lights an UP-facing
 * normal with `skyColor` and a DOWN-facing one with `groundColor`. In a room the floor is what
 * receives skylight through the window (blue) and the ceiling is what receives bounce off the
 * floor (warm oak). The mapping lands the right way round by construction.
 *
 * Intensities are pinned with `Object.defineProperty`, not assignment: `Lighting.tsx` rewrites
 * both every frame inside `useFrame`, so a plain write is gone before the next screenshot.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/fill-chroma-ab.mjs --ref /tmp/bref-real
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

/**
 * Arms as (hemisphere, ambient) multipliers on `cur.ambient`. The shipped pair sums to 1.45 and
 * every arm holds that sum, so any difference is redistribution, never gain.
 */
export const ARMS = [
  { name: 'A-shipped', hemi: 1.1, amb: 0.35 },
  { name: 'B-half-moved', hemi: 1.275, amb: 0.175 },
  { name: 'C-all-chromatic', hemi: 1.45, amb: 0.0 },
  // The opposite direction, because an arm set that only moves one way cannot show a trend is
  // monotone rather than an artefact of the endpoint.
  { name: 'D-more-neutral', hemi: 0.75, amb: 0.7 },
]

export function armTotal(arm) {
  return +(arm.hemi + arm.amb).toFixed(6)
}

const args = process.argv.slice(2)
const refDir = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : '/tmp/bref-real'
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/fill-chroma'

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = JSON.parse(fs.readFileSync(path.join(refDir, 'manifest.json'), 'utf8'))
  if (manifest.scene?.tier !== 'realistic')
    throw new Error(`reference was exported at tier=${manifest.scene?.tier}, need realistic`)
  const cam = manifest.camera
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => {
    throw e
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.endTour?.()
    s.setOnboardingOpen?.(false)
    s.dismissLocationPrompt?.()
    s.dismissChecklist?.()
    s.setManualHour?.(13)
    s.setTimeMode?.('manual')
    s.setLightsMode?.('off')
    s.setQualityTier?.('realistic')
    // `light-distribution.mjs` pins the walk FOV to 50 (its WALKFOV default) and the manifest
    // records THAT. The app's own walk FOV is viewport-aware and lands on 70 at 1280x800, so
    // without this the arms are framed 20 degrees wider than the reference. The pose assertion
    // below is what caught it -- position was exact to 0.000 m and the picture was still wrong.
    s.setWalkFov?.(50)
    s.hideLoading?.()
    s.setFeatureFlag?.('interactiveDegrade', false)
  })
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  // LIGHTS=off the way `light-distribution.mjs` does it: `setLightsMode('off')` is NOT enough --
  // the reference export flips each item's `lightOn` prop, and a burning ceiling light dilutes the
  // very fill share this probe is measuring. The first run of this probe missed it, and the frame
  // gave it away: the interaction pill read "Turn OFF ceiling light".
  const flipped = await page.evaluate(() => {
    const s = window.__store.getState()
    const on = s.items.filter((it) => it.props?.lightOn !== 'no').map((it) => it.id)
    let k = 0
    for (const id of on) {
      s.toggleLightPower(id)
      if (window.__store.getState().items.find((it) => it.id === id)?.props?.lightOn === 'no') k++
    }
    return { candidates: on.length, flipped: k }
  })
  console.log(`lights off: flipped ${flipped.flipped} of ${flipped.candidates}`)
  await new Promise((r) => setTimeout(r, 6000))
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20000,
  })
  await new Promise((r) => setTimeout(r, 4000))
  await page.evaluate((c) => {
    const l = window.__walkLook
    // The manifest camera is in three space; walk takes (x, z) and derives height itself.
    l.setPosition(c.position[0], c.position[2])
    l.setYaw(0)
    l.setPitch(Math.asin(c.forward[1]))
    const s = window.__store.getState()
    s.hideLoading?.()
    s.dismissCallout?.('walk-mode')
  }, cam)
  await assertSceneAlive(page, 'pose')
  await new Promise((r) => setTimeout(r, 3000))

  /**
   * ASSERT the pose rather than trusting the setter.
   *
   * `blender.md` records that a mis-transcribed pose is the most expensive error class in this
   * arc, and the first run of this probe proved it again: `setPosition` was called with the right
   * numbers and the frame still came back from somewhere else, which only showed up as a 33-count
   * mean difference against the reference raster. A screenshot of the wrong place looks completely
   * fine.
   */
  const posed = await page.evaluate(() => {
    const c = window.__three.camera
    return { position: [c.position.x, c.position.y, c.position.z], fov: c.fov, aspect: c.aspect }
  })
  const drift = Math.hypot(posed.position[0] - cam.position[0], posed.position[2] - cam.position[2])
  console.log(
    `posed at [${posed.position.map((v) => v.toFixed(3)).join(', ')}] fov ${posed.fov.toFixed(2)} aspect ${posed.aspect.toFixed(3)} ` +
      `| manifest [${cam.position.join(', ')}] fov ${cam.fovVerticalDeg} aspect ${cam.aspect} | drift ${drift.toFixed(3)} m`,
  )
  if (drift > 0.05)
    throw new Error(
      `pose drift ${drift.toFixed(3)} m from the manifest camera — the arms would be measured at a ` +
        'different viewpoint than the reference was rendered at',
    )
  if (Math.abs(posed.fov - cam.fovVerticalDeg) > 0.5)
    throw new Error(
      `fov ${posed.fov} != manifest ${cam.fovVerticalDeg} — different framing, not comparable`,
    )

  // Read the live baseline so the arms are expressed against what actually shipped, not against
  // the constants read out of the source.
  const base = await page.evaluate(() => {
    let hemi = null
    let amb = null
    window.__three.scene.traverse((o) => {
      if (o.isHemisphereLight && !hemi) hemi = o
      if (o.isAmbientLight && !amb) amb = o
    })
    if (!hemi || !amb) throw new Error('fill lights not found')
    window.__fill = { hemi, amb }
    return { hemi: hemi.intensity, amb: amb.intensity, ratio: hemi.intensity / amb.intensity }
  })
  console.log(
    `live fill: hemi ${base.hemi.toFixed(4)}  ambient ${base.amb.toFixed(4)}  ratio ${base.ratio.toFixed(3)}`,
  )
  // ratio 1.1/0.35 = 3.143 confirms which constants are live before anything is changed.
  const unit = base.hemi / 1.1

  for (const arm of ARMS) {
    await page.evaluate(
      (a, u) => {
        for (const [key, mult] of [
          ['hemi', a.hemi],
          ['amb', a.amb],
        ]) {
          const light = window.__fill[key]
          const value = mult * u
          // `Lighting.tsx` writes `intensity` every frame, so pin it with a getter that ignores
          // the write. A plain assignment is overwritten before the next frame is drawn.
          Object.defineProperty(light, 'intensity', {
            configurable: true,
            get: () => value,
            set: () => {},
          })
        }
      },
      arm,
      unit,
    )
    await new Promise((r) => setTimeout(r, 2500))
    await assertSceneAlive(page, arm.name)
    const file = path.join(outDir, `${arm.name}.png`)
    await page.screenshot({ path: file })
    console.log(
      `  ${arm.name.padEnd(18)} hemi ${(arm.hemi * unit).toFixed(4)} amb ${(arm.amb * unit).toFixed(4)} total ${(armTotal(arm) * unit).toFixed(4)} -> ${file}`,
    )
  }
  await browser.close()
  console.log(
    `\nnow: node scripts/dev-probes/ref-linear-compare.mjs --dir ${refDir} --chroma  (per arm, see README of this file)`,
  )
}
