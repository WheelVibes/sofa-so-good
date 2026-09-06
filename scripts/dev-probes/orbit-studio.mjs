/**
 * ORBIT-STUDIO — does the orbit dollhouse have the shadow depth an architectural
 * visualisation has?
 *
 * The whole measurement in ONE run, at the canonical orbit pose (13:00, camera
 * (18,12,16) → target (6.3,0.8,4.5)), so an arm's numbers and its frames cannot
 * come from two different states (meta-rule iv — the run prints its resolved
 * tier/hour/lights/flag):
 *
 *   1. **Luminance percentiles over the flat's own crop** (`left 470 top 230
 *      width 830 height 600` at 1600×1000), Rec.709 luma on sRGB bytes — the same
 *      statistic the reference photograph was measured with, so the two are
 *      comparable. p05/p25 are the shadow-depth signal; p95 is the guard that a
 *      change bought depth rather than just dimming the frame.
 *   2. **The floor under the living-room sofa against the open floor beside it**
 *      (`underside-shadow.mjs`'s metric, re-masked for an orbit camera). Same
 *      material both sides, so the ratio is a SHADOW measurement and not an
 *      albedo one. Reference photographs: 0.579–0.725.
 *   3. **The 20:00 blow-out control**: the share of the same crop brighter than
 *      luma 235. An added light must not make the night dollhouse bloom, and that
 *      is the statistic ORBIT-NIGHT-CAPS used for the same question.
 *
 * The mask is GEOMETRIC, never a screen rectangle: a screen band over "the
 * floor" is furniture half the time (the trap `.181` spent two rounds in). A ray
 * is kept only when it lands on an up-facing surface at floor height, and it is
 * classified by casting a second ray UP — `under` if furniture sits within
 * `OCCLUDE_M` of it, `open` otherwise. `OCCLUDE_M` must stay below ceiling
 * height or the ceiling classifies every sample as `under` and the ratio
 * silently becomes 1.
 *
 * Arms are driven by URL, not by code: `QS=studioKey=1.1&studioFill=0.55`, or
 * `QS=ff=orbitStudioLook:off` for the flag-off twin. The DEV seams are read at
 * page load (`Lighting.tsx:studioDevSeam`, `EffectsImpl.tsx:aoDevSeam`), so a
 * post-boot store write cannot set them.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/photoreal/orbit-studio'
const TIER = process.env.TIER || 'realistic'
const LABEL = process.env.LABEL || 'arm'
const QS = process.env.QS || ''
/** The flat's own region at 1600×1000, the crop the reference table uses. */
const CROP = (process.env.CROP || '470,230,830,600').split(',').map(Number)
const GRID = Number(process.env.GRID || 220)
/** Below ceiling height — see the header. */
const OCCLUDE_M = Number(process.env.OCCLUDE || 1.5)
/** The living-room sofa's neighbourhood, in plan metres: only floor inside this
 *  box is pooled, so "open floor" is floor in the SAME room under the SAME light
 *  rather than a sunlit strip by a window in another room. */
const REGION = (process.env.REGION || '9.125,1.3,12.525,6.975').split(',').map(Number)
/**
 * `EXTRA=<png>[,<png>]` measures further images through the SAME crop and the
 * SAME geometric floor mask this run derived from the live scene. That is what
 * makes a Cycles reference comparable: `render_from_manifest.py` renders the
 * identical pose, FOV, aspect and resolution, so the app's NDC sample list
 * addresses the same floor points in the traced frame — the mask does not have
 * to be re-derived (and could not be, outside the app).
 */
const EXTRA = (process.env.EXTRA || '').split(',').filter(Boolean)

fs.mkdirSync(OUT, { recursive: true })

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
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
const url = appUrl() + (QS ? (appUrl().includes('?') ? '&' : '?') + QS : '')
await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => {
  const s = window.__store.getState()
  s.endTour?.()
  s.setOnboardingOpen?.(false)
  s.dismissLocationPrompt?.()
  s.dismissChecklist?.()
  s.setTimeMode?.('manual')
  s.setLightsMode?.('on')
  s.setQualityTier?.(t)
  s.setDeviceClass?.('capable')
  s.setCameraMode?.('orbit')
  s.hideLoading?.()
  s.setFeatureFlag?.('interactiveDegrade', false)
}, TIER)
// Pin the device class: the adaptive ladder walks it, and an arm that slid to
// `weak` mid-run would be measuring a different shadow map than it reported.
await page.evaluate(() => {
  const s = window.__store
  s.getState().setDeviceClass('capable')
  s.setState({ setDeviceClass: () => {} })
})
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 120000 })
await new Promise((r) => setTimeout(r, 5000))

async function poseOrbit(hour) {
  await page.evaluate((h) => window.__store.getState().setManualHour(h), hour)
  await new Promise((r) => setTimeout(r, 1500))
  await page.evaluate(() => {
    const { camera, controls, invalidate, advance } = window.__three
    if (controls) controls.enableDamping = false
    camera.position.set(18, 12, 16)
    controls?.target?.set(6.3, 0.8, 4.5)
    camera.lookAt(6.3, 0.8, 4.5)
    controls?.update?.()
    controls?.update?.()
    invalidate?.()
    advance?.(performance.now())
  })
  await new Promise((r) => setTimeout(r, 3500))
  await assertSceneAlive(page, `orbit ${hour}`)
}

/** Rec.709 percentiles + the >235 share over the crop. */
async function cropStats(buf) {
  const [left, top, width, height] = CROP
  const { data } = await sharp(buf)
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const n = data.length / 3
  const lum = new Float64Array(n)
  let sat = 0
  let rb = 0
  let over = 0
  for (let i = 0; i < n; i++) {
    const r = data[i * 3]
    const g = data[i * 3 + 1]
    const b = data[i * 3 + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lum[i] = l
    const mx = Math.max(r, g, b)
    sat += mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx
    rb += r - b
    if (l > 235) over++
  }
  const s = Array.from(lum).sort((a, b) => a - b)
  const p = (q) => +s[Math.min(n - 1, Math.floor(q * n))].toFixed(1)
  return {
    p05: p(0.05),
    p25: p(0.25),
    p50: p(0.5),
    p75: p(0.75),
    p95: p(0.95),
    mean: +(s.reduce((a, b) => a + b, 0) / n).toFixed(1),
    sat: +(sat / n).toFixed(3),
    rMinusB: +(rb / n).toFixed(1),
    over235pct: +((100 * over) / n).toFixed(3),
  }
}

/** Geometric floor mask from the ORBIT camera. See the header for why. */
function sampleFloor() {
  return page.evaluate(
    ({ g, occlude, region }) => {
      const { scene, camera } = window.__three
      const rc = new window.__three.raycaster.constructor()
      const V3 = camera.position.constructor
      const up = new V3(0, 1, 0)
      const n = new V3()
      const solid = (o) =>
        o.visible && o.material?.colorWrite !== false && o.material?.opacity !== 0
      const out = []
      for (let j = 0; j < g; j++) {
        for (let i = 0; i < g; i++) {
          const x = (i + 0.5) / g
          const y = (j + 0.5) / g
          rc.setFromCamera({ x: x * 2 - 1, y: 1 - y * 2 }, camera)
          const h = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          if (!h?.face) continue
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          if (n.y < 0.9 || h.point.y > 0.15) continue
          if (
            h.point.x < region[0] ||
            h.point.x > region[2] ||
            h.point.z < region[1] ||
            h.point.z > region[3]
          )
            continue
          rc.set(h.point.clone().addScaledVector(up, 0.02), up)
          rc.far = occlude
          const above = rc.intersectObjects(scene.children, true).find((k) => solid(k.object))
          rc.far = Number.POSITIVE_INFINITY
          out.push({ x, y, under: !!above })
        }
      }
      return out
    },
    { g: GRID, occlude: OCCLUDE_M, region: REGION },
  )
}

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  return {
    tier: st.qualityTier,
    device: st.deviceClass,
    lights: st.lightsMode,
    orbitStudioLook: st.featureFlags.orbitStudioLook,
    cameraMode: st.cameraMode,
    exposure: window.__three.gl.toneMappingExposure,
  }
})

// --- 13:00: percentiles + the sofa under/open ratio ---
await poseOrbit(13)
const day = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/${LABEL}-13-orbit.png`, day)
const dayStats = await cropStats(day)

let hits = []
for (let attempt = 1; attempt <= 4; attempt++) {
  hits = await sampleFloor()
  if (hits.length >= 60) break
  await new Promise((r) => setTimeout(r, 1500))
}
{
  const { data, info } = await sharp(day).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const under = []
  const open = []
  for (const h of hits) {
    const px = Math.min(info.width - 1, Math.floor(h.x * info.width))
    const py = Math.min(info.height - 1, Math.floor(h.y * info.height))
    const o = (py * info.width + px) * 3
    const l = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]
    ;(h.under ? under : open).push(l)
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN)
  dayStats.under = +mean(under).toFixed(1)
  dayStats.open = +mean(open).toFixed(1)
  dayStats.underOpen = +(mean(under) / mean(open)).toFixed(3)
  dayStats.nUnder = under.length
  dayStats.nOpen = open.length
}

// --- 20:00: the blow-out control ---
await poseOrbit(20)
const night = await page.screenshot({ type: 'png' })
fs.writeFileSync(`${OUT}/${LABEL}-20-orbit.png`, night)
const nightStats = await cropStats(night)

for (const f of EXTRA) {
  const buf = fs.readFileSync(f)
  const st = await cropStats(buf)
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const u = []
  const o = []
  for (const h of hits) {
    const px = Math.min(info.width - 1, Math.floor(h.x * info.width))
    const py = Math.min(info.height - 1, Math.floor(h.y * info.height))
    const k = (py * info.width + px) * 3
    const l = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]
    ;(h.under ? u : o).push(l)
  }
  const mean = (a) => (a.length ? a.reduce((s2, v) => s2 + v, 0) / a.length : Number.NaN)
  st.under = +mean(u).toFixed(1)
  st.open = +mean(o).toFixed(1)
  st.underOpen = +(mean(u) / mean(o)).toFixed(3)
  console.log(`  EXTRA ${f} ${JSON.stringify(st)}`)
}

console.log(`orbit-studio ${LABEL}  QS=${QS || '(none)'}`)
console.log(`  resolved ${JSON.stringify(resolved)}`)
console.log(`  13:00 ${JSON.stringify(dayStats)}`)
console.log(`  20:00 ${JSON.stringify(nightStats)}`)
console.log('  targets: p05 <= 90, p25 <= 140, p95 217-235, under/open 0.58-0.75')
if (dayStats.nUnder < 30 || dayStats.nOpen < 30)
  console.log('  WARNING: too few pooled floor samples — do not trust the ratio.')
await browser.close()
