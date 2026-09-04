/**
 * Export the LIVE scene to a GLB plus a Blender-ready manifest, in one reproducible step.
 *
 * The arc's app-vs-Cycles comparisons all need the same thing: the exact scene the app just
 * measured, in a form `render_still.py` can render, aimed at the same pose. Until now that GLB was
 * produced ad hoc — `/tmp/bref/scene.glb` exists with no probe that made it, at a camera pose
 * unrelated to any current measurement and a furniture state nobody recorded. Reusing it would
 * risk exactly the mismatch class that cost this arc two wrong conclusions (`.214`'s wrong patch,
 * `.217`'s exposure mismatch), so the export becomes a probe.
 *
 * It uses the app's OWN `buildExportRoot` + `exportGlb`, so it cannot drift from what the product
 * exports, and it records the STATE the export was taken in — hour, lights, tier, exposure — next
 * to the geometry. A reference render is only comparable if that state is known.
 *
 * POSE is `label:x,z,yaw,pitch` in the same form `aim-look.mjs` takes, so a pose that was verified
 * by raycast there can be handed to Blender here without retyping numbers. Camera positions are
 * emitted in three's world axes (`--cam-space three`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-glb'
const TIER = process.env.TIER || 'realistic'
const HOUR = Number(process.env.HOUR || 13)
const POSES = (process.env.POSES || 'ceiling:10.8,4.1,0,1.15').split(';').map((s) => {
  const [label, rest] = s.split(':')
  const [x, z, yaw, pitch] = rest.split(',').map(Number)
  return { label, x, z, yaw, pitch }
})

mkdirSync(OUT, { recursive: true })
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
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
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
await page.evaluate((h) => {
  const st = window.__store.getState()
  st.setTimeMode('manual')
  st.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))

// DROP_DEFIDS=<a,b,c> deletes items by catalog id before exporting — a targeted control for
// "does THIS furniture change the bake". Added to test whether the 66 curtains this session seeded
// are what dropped 64 of 97 baked scales below the shipped set's (`v0.31.7.239`/`.240`): a curtain
// exported as a panel across its window blocks the bake regardless of `drawAmount`.
if (process.env.DROP_DEFIDS) {
  const dropped = await page.evaluate((csv) => {
    const ids = new Set(csv.split(',').map((s) => s.trim()))
    const st = window.__store.getState()
    const hit = st.items.filter((it) => ids.has(it.defId)).map((it) => it.id)
    for (const id of hit) st.removeItem?.(id)
    return { asked: [...ids], removed: hit.length, left: window.__store.getState().items.length }
  }, process.env.DROP_DEFIDS)
  console.log(
    `DROP_DEFIDS=${process.env.DROP_DEFIDS}  removed ${dropped.removed}, ${dropped.left} items left`,
  )
  await new Promise((r) => setTimeout(r, 2000))
}
if (process.env.LIGHTS === 'off') {
  const flipped = await page.evaluate(() => {
    const st = window.__store.getState()
    const on = st.items.filter((it) => it.props?.lightOn !== 'no').map((it) => it.id)
    let k = 0
    for (const id of on) {
      st.toggleLightPower(id)
      if (window.__store.getState().items.find((it) => it.id === id)?.props?.lightOn === 'no') k++
    }
    return { candidates: on.length, flipped: k }
  })
  console.log(`LIGHTS=off  flipped ${flipped.flipped} of ${flipped.candidates} candidates`)
}
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))
await assertSceneAlive(page, 'before export')

// Poses resolved by the APP, not recomputed here: teleport, read back the real camera basis, and
// derive the target from its own matrix. Deriving the forward vector by hand from yaw/pitch is how
// a pose gets quietly mis-stated (`aim-look.mjs` had exactly that with `setPitch`).
const cams = []
for (const p of POSES) {
  await page.evaluate(async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.x, q.z, q.yaw)
  }, p)
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate((q) => window.__walkLook?.setPitch(q.pitch), p)
  await new Promise((r) => setTimeout(r, 1000))
  cams.push(
    await page.evaluate((label) => {
      const c = window.__three.camera
      c.updateMatrixWorld()
      const e = c.matrixWorld.elements
      const pos = [e[12], e[13], e[14]]
      const fwd = [-e[8], -e[9], -e[10]]
      return {
        label,
        space: 'three',
        position: pos.map((v) => +v.toFixed(4)),
        forward: fwd.map((v) => +v.toFixed(5)),
        target: pos.map((v, i) => +(v + fwd[i]).toFixed(4)),
        fovVerticalDeg: c.fov,
        aspect: c.aspect,
      }
    }, p.label),
  )
}

const state = await page.evaluate(() => {
  const st = window.__store.getState()
  const gl = window.__three.gl
  const sun = []
  window.__three.scene.traverse((o) => {
    if (o.isDirectionalLight) {
      o.updateMatrixWorld()
      sun.push({
        intensity: o.intensity,
        color: [o.color.r, o.color.g, o.color.b].map((v) => +v.toFixed(4)),
        // Direction of TRAVEL (from the light toward its target), which is what
        // `render_still.py --sun-dir` expects.
        travel: [
          o.target.position.x - o.position.x,
          o.target.position.y - o.position.y,
          o.target.position.z - o.position.z,
        ].map((v) => +v.toFixed(5)),
      })
    }
  })
  return {
    tier: st.qualityTier,
    hour: st.manualHour,
    timeMode: st.timeMode,
    lightsMode: st.lightsMode,
    toneMapping: gl.toneMapping,
    toneMappingExposure: gl.toneMappingExposure,
    sun,
  }
})

// SKIP_GLB=1 emits the manifest ONLY. The geometry and materials do not depend on the hour, so a
// sun-altitude sweep needs one export and N manifests — re-exporting 70 MB per hour is pure waste.
let bytes = 0
if (process.env.SKIP_GLB === '1') {
  console.log('SKIP_GLB=1 — manifest only, reusing an existing scene.glb')
} else {
  // The GLB comes back over CDP as a download rather than a serialised array: a whole home is tens of
  // megabytes and JSON-encoding that through `evaluate` is minutes of overhead.
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: OUT,
    eventsEnabled: true,
  })
  bytes = await page.evaluate(async () => {
    const [{ buildExportRoot }, { exportGlb }] = await Promise.all([
      import('/src/export/sceneGltf.ts'),
      import('/src/furniture/convert/toGlb.ts'),
    ])
    const root = buildExportRoot(window.__three.scene)
    const buf = await exportGlb(root)
    const blob = new Blob([buf], { type: 'model/gltf-binary' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'scene.glb'
    document.body.appendChild(a)
    a.click()
    return buf.byteLength
  })
  console.log(`export: ${(bytes / 1e6).toFixed(1)} MB -> ${OUT}/scene.glb`)
  // Poll for the file rather than a fixed sleep: a 40 MB blob write is not instant.
  const { statSync } = await import('node:fs')
  for (let i = 0; i < 120; i++) {
    try {
      if (statSync(`${OUT}/scene.glb`).size >= bytes) break
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
}
// The manifest is written in the shape the BLENDER scripts already consume, not a shape of this
// probe's own invention: `bake_material.py --pass irradiance` reads `lights.directional` to place
// the sun and raises without it, and `render_from_manifest.py` reads `camera` + `lights`. Emitting
// a private shape cost a launched bake that died on `--pass irradiance needs --dir`.
const manifest = {
  glb: 'scene.glb',
  camera: cams[0]
    ? {
        space: 'three',
        position: cams[0].position,
        forward: cams[0].forward,
        target: cams[0].target,
        fovVerticalDeg: cams[0].fovVerticalDeg,
        aspect: cams[0].aspect,
      }
    : null,
  lights: { directional: state.sun },
  // Everything this probe adds on top, kept under its own keys so it cannot collide with a field
  // the Blender side expects.
  state,
  cams,
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(
  `state: tier ${state.tier} hour ${state.hour} lights ${state.lightsMode} exposure ${state.toneMappingExposure}`,
)
for (const c of cams) {
  console.log(
    `  ${c.label.padEnd(10)} pos ${c.position.join(',')} -> ${c.target.join(',')}  fov ${c.fovVerticalDeg}`,
  )
}
await browser.close()
