/**
 * Why do interiors cast no shadows? — an isolating ladder.
 *
 * Established over earlier rounds: the sun is the ONLY shadow-casting light
 * (hemisphere / ambient / IBL probe are all non-directional fill that casts
 * nothing), and the invisible virtual ceiling occluder blocks the sun over every
 * room footprint. So the leading hypothesis is "no sun indoors → nothing to
 * shadow". But that has never actually been isolated, and there are other
 * candidates: furniture not flagged `castShadow`, the floor not
 * `receiveShadow`, or wall cutouts not letting sun through the window reveals.
 *
 * The ladder separates them without touching app code — the occluder meshes are
 * identifiable at runtime (their material is the only one with
 * `colorWrite: false` AND `opacity: 0`), so their `castShadow` can be toggled
 * live:
 *
 *   A  baseline                      occluder casts, sun shadows on
 *   B  occluder not casting          sun floods in from above, shadows on
 *   C  occluder not casting + no map sun floods in, shadows OFF
 *   D  baseline repeated             the noise floor
 *
 * Read it like this:
 *   B vs C  = what sun shadows are worth WHEN THE SUN REACHES INSIDE. If this is
 *             ~noise, the problem is NOT the occluder — casters/receivers are
 *             broken and no amount of letting light in will help.
 *   A vs B  = how much the occluder is actually blocking.
 *   A vs D  = the noise floor to judge both against.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/ssg-intshadow'
const TIER = process.env.TIER || 'maximum'
const DSF = Number(process.env.DSF || 2)
const HOUR = Number(process.env.HOUR || 9)
const MODE = process.env.MODE || 'walk' // 'walk' | 'orbit'
fs.mkdirSync(OUT, { recursive: true })

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
if (MODE === 'walk') {
  await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
  await new Promise((r) => setTimeout(r, 3500))
}
await assertSceneAlive(page, 'after setup')

// Report the scene's shadow wiring once — if casters/receivers are missing, the
// whole occluder theory is beside the point.
const wiring = await page.evaluate(() => {
  let casters = 0
  let receivers = 0
  let occluders = 0
  let sun = null
  window.__three.scene.traverse((o) => {
    if (o.isDirectionalLight) {
      sun = {
        intensity: +o.intensity.toFixed(3),
        castShadow: o.castShadow,
        map: o.shadow?.mapSize?.x,
      }
    }
    if (!o.isMesh) return
    if (o.castShadow) casters++
    if (o.receiveShadow) receivers++
    const m = o.material
    if (m && m.colorWrite === false && m.opacity === 0) occluders++
  })
  return { casters, receivers, occluders, sun }
})
console.log(`mode=${MODE} tier=${TIER} hour=${HOUR}`)
console.log(`wiring: ${JSON.stringify(wiring)}\n`)

const VIEW =
  MODE === 'walk'
    ? { pos: [11.0, 1.6, 5.6], look: [11.0, 0.1, 3.6] }
    : { pos: [12, 8, 12], look: [0, 0, 0] }

async function settle(occluderCasts, shadowsOn, forceShadowUpdate = false) {
  await page.evaluate(
    (o, s, force) => {
      // Occluder meshes: the ONLY material in the scene with colorWrite false
      // and opacity 0 (see apartment/ceiling/CeilingOccluder.tsx).
      window.__three.scene.traverse((n) => {
        const m = n.material
        if (n.isMesh && m && m.colorWrite === false && m.opacity === 0) n.castShadow = o
      })
      const st = window.__store.getState()
      st.resetQualityOverrides()
      if (!s) window.__store.getState().setQualityOverride('shadowMapSize', 0)
      // PERF-MAX-1 sets `shadow.autoUpdate = false` and only flags `needsUpdate`
      // on specific signals. If the map was captured before the furniture GLBs
      // finished streaming and never refreshed since, it contains no furniture —
      // and no amount of light will produce a furniture shadow. Undoing the
      // freeze is the decisive test for that.
      if (force) {
        window.__three.scene.traverse((n) => {
          if (n.isDirectionalLight && n.shadow) {
            n.shadow.autoUpdate = true
            n.shadow.needsUpdate = true
          }
        })
      }
      window.__store.getState().setManualHour(st.manualHour)
    },
    occluderCasts,
    shadowsOn,
    forceShadowUpdate,
  )
  await new Promise((r) => setTimeout(r, 3000))
  await page.evaluate((v) => {
    const { camera } = window.__three
    camera.position.set(...v.pos)
    camera.lookAt(...v.look)
    camera.updateMatrixWorld()
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
  }, VIEW)
  await new Promise((r) => setTimeout(r, 2500))
  await assertSceneAlive(page)
  return page.screenshot({ type: 'png' })
}

async function centre(buf) {
  const w = 1280 * DSF
  const h = 800 * DSF
  return sharp(buf)
    .extract({
      left: Math.round(w * 0.25),
      top: Math.round(h * 0.3),
      width: Math.round(w * 0.5),
      height: Math.round(h * 0.42),
    })
    .removeAlpha()
    .raw()
    .toBuffer()
}

function diff(a, b) {
  let changed = 0
  let abs = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    abs += d
    if (d > 8) changed++
  }
  return { pct: (100 * changed) / a.length, mean: abs / a.length }
}

const CASES = [
  { key: 'A', label: 'baseline (occluder casts, shadows on)', occ: true, sh: true },
  { key: 'B', label: 'occluder NOT casting, shadows on', occ: false, sh: true },
  { key: 'C', label: 'occluder NOT casting, shadows OFF', occ: false, sh: false },
  { key: 'D', label: 'baseline repeated (noise floor)', occ: true, sh: true },
  {
    key: 'E',
    label: 'occluder off, shadows on, FORCED map update',
    occ: false,
    sh: true,
    force: true,
  },
  {
    key: 'F',
    label: 'occluder off, shadows OFF, forced update',
    occ: false,
    sh: false,
    force: true,
  },
  {
    key: 'G',
    label: 'occluder ON, shadows on, FORCED map update',
    occ: true,
    sh: true,
    force: true,
  },
]
const px = {}
for (const c of CASES) {
  const buf = await settle(c.occ, c.sh, c.force === true)
  fs.writeFileSync(`${OUT}/${MODE}-${c.key}.png`, buf)
  px[c.key] = await centre(buf)
  console.log(`${c.key}: ${c.label}`)
}
const show = (l, d) =>
  console.log(`  ${l.padEnd(46)} pixels>8=${d.pct.toFixed(2)}%  meanAbsDiff=${d.mean.toFixed(2)}`)
console.log('')
show('A vs D  (noise floor)', diff(px.A, px.D))
show('B vs C  (shadows worth, WITH sun indoors)', diff(px.B, px.C))
show('A vs B  (what the occluder blocks)', diff(px.A, px.B))
show('E vs F  (shadows worth, map FORCED fresh)', diff(px.E, px.F))
show('A vs G  (frozen map vs forced-fresh map)', diff(px.A, px.G))
console.log('\nB vs C ~noise but E vs F large  => the FROZEN shadow map is the bug (PERF-MAX-1).')
await browser.close()
