/**
 * Which PBR maps are ACTUALLY bound in the live scene, per tier?
 *
 * With lighting and ambient occlusion now sound, surfaces are the likeliest
 * remaining source of "doesn't look real" — walls read as flat cream in every
 * still. A material can silently fall back to a solid colour (no `map`, no
 * `normalMap`, no `roughnessMap`) and nothing errors; it just looks like paint.
 * This walks the scene graph and reports what is bound, so "are the textures
 * even there" stops being a guess.
 *
 * Also reports: texture resolutions actually uploaded, anisotropy (the
 * AnisotropyController is supposed to raise it), and any failed network request,
 * since a 403/404 on the ambientCG/R2 texture prefix would degrade to solids
 * without any visible error.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'medium'

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
const failed = new Map()
page.on('response', (r) => {
  if (r.status() >= 400) failed.set(r.url(), r.status())
})
page.on('requestfailed', (r) => failed.set(r.url(), r.failure()?.errorText || 'failed'))
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
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
// Give texture streaming time to finish — a material audit taken mid-stream
// under-reports maps that are still loading.
await new Promise((r) => setTimeout(r, 9000))
await assertSceneAlive(page, 'after tier set')

const audit = await page.evaluate(() => {
  const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'envMap']
  const byMat = new Map()
  const texSizes = new Map()
  let anisoMin = Number.POSITIVE_INFINITY
  let anisoMax = 0
  let meshes = 0
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    meshes++
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const key = `${m.type}|${m.name || '(unnamed)'}`
      let e = byMat.get(key)
      if (!e) {
        e = { key, count: 0, maps: {} }
        for (const k of MAPS) e.maps[k] = 0
        byMat.set(key, e)
      }
      e.count++
      for (const k of MAPS) {
        const t = m[k]
        if (t) {
          e.maps[k]++
          const img = t.image
          if (img?.width) {
            const s = `${img.width}x${img.height}`
            texSizes.set(s, (texSizes.get(s) || 0) + 1)
          }
          if (typeof t.anisotropy === 'number') {
            anisoMin = Math.min(anisoMin, t.anisotropy)
            anisoMax = Math.max(anisoMax, t.anisotropy)
          }
        }
      }
    }
  })
  // Classify GEOMETRICALLY. r3f meshes carry no `name`, so a name-based
  // classifier reports every surface as "other" and the question "do the WALLS
  // have textures" stays unanswered. World bounding boxes are reliable here:
  // the shell is axis-aligned boxes in real metres.
  const classes = new Map()
  const box = new (
    Object.getPrototypeOf(window.__three.scene).constructor === Object
      ? Object
      : window.__three.camera.position.constructor
  )()
  void box
  const classify = (o) => {
    const b = o.geometry?.boundingBox
    if (!o.geometry) return 'other'
    if (!b) o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox
    if (!bb) return 'other'
    // Local extents scaled to world (shell geometry is axis-aligned).
    // Reuse one vector per mesh rather than allocating per traversal.
    if (!o.userData.__s) o.userData.__s = new o.position.constructor()
    if (!o.userData.__p) o.userData.__p = new o.position.constructor()
    const s = o.getWorldScale(o.userData.__s)
    const w = (bb.max.x - bb.min.x) * Math.abs(s.x)
    const h = (bb.max.y - bb.min.y) * Math.abs(s.y)
    const d = (bb.max.z - bb.min.z) * Math.abs(s.z)
    const p = o.getWorldPosition(o.userData.__p)
    const footprint = Math.max(w, d) * Math.min(w, d)
    const thin = Math.min(w, d)
    if (h > 1.6 && thin < 0.45 && Math.max(w, d) > 0.8) return 'wall'
    if (h < 0.35 && footprint > 2 && p.y < 0.6) return 'floor'
    if (h < 0.35 && footprint > 2 && p.y > 1.9) return 'ceiling'
    if (h < 0.35 && footprint > 0.2 && p.y < 0.35) return 'floor-ish'
    return 'furniture/other'
  }
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const cls = classify(o)
    let e = classes.get(cls)
    if (!e) {
      e = { cls, count: 0, withMap: 0, withNormal: 0, withRough: 0, withAo: 0, colors: new Set() }
      classes.set(cls, e)
    }
    e.count++
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (m.map) e.withMap++
    if (m.normalMap) e.withNormal++
    if (m.roughnessMap) e.withRough++
    if (m.aoMap) e.withAo++
    if (m.color && e.colors.size < 4) e.colors.add(`#${m.color.getHexString()}`)
  })
  return {
    byClass: [...classes.values()].map((e) => ({ ...e, colors: [...e.colors] })),
    meshes,
    materials: [...byMat.values()].sort((a, b) => b.count - a.count).slice(0, 14),
    texSizes: [...texSizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    aniso: { min: Number.isFinite(anisoMin) ? anisoMin : null, max: anisoMax },
    envIntensity: window.__three.scene.environmentIntensity,
    hasEnv: !!window.__three.scene.environment,
  }
})

console.log(
  `tier=${TIER}  meshes=${audit.meshes}  scene.environment=${audit.hasEnv} (intensity ${audit.envIntensity?.toFixed?.(3)})`,
)
console.log(`texture anisotropy: min=${audit.aniso.min} max=${audit.aniso.max}`)
console.log(`\nmaterial (type|name)                              n   map norm rough metal   ao`)
for (const m of audit.materials) {
  const g = (k) => String(m.maps[k]).padStart(4)
  console.log(
    `${m.key.slice(0, 48).padEnd(48)} ${String(m.count).padStart(4)} ${g('map')} ${g('normalMap')} ${g('roughnessMap')} ${g('metalnessMap')} ${g('aoMap')}`,
  )
}
console.log(`\nby surface class:      n  map norm rough  ao   sample colours`)
for (const c of audit.byClass.sort((a, b) => b.count - a.count)) {
  const g = (v) => String(v).padStart(4)
  console.log(
    `  ${c.cls.padEnd(10)} ${String(c.count).padStart(5)} ${g(c.withMap)} ${g(c.withNormal)} ${g(c.withRough)} ${g(c.withAo)}   ${c.colors.join(' ')}`,
  )
}
console.log(`\nuploaded texture sizes: ${audit.texSizes.map(([s, n]) => `${s}x${n}`).join('  ')}`)
const tex = [...failed].filter(([u]) => !/font|woff|\/api\//.test(u))
console.log(`\nfailed non-font requests: ${tex.length}`)
for (const [u, st] of tex.slice(0, 8)) console.log(`  ${st}  ${u.slice(0, 120)}`)
await browser.close()
