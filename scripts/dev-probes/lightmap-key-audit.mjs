/**
 * LIGHTMAP-KEY-AUDIT — how many baked maps still match live geometry, and how many are ORPHANED.
 *
 * `lightmapKey` hashes a mesh's **world-space** vertices, so any change to the shell — a wall join,
 * a door opening, a re-scaled fitting — produces a new key and silently orphans the map that was
 * baked for the old geometry. Nothing fails when that happens: the applier logs its hit rate and
 * sets a `suspect` flag, and the render simply falls back to the flat analytic fill on those
 * surfaces. The result looks fine and is 19 counts too dark (LIGHTMAP-COVERAGE, v0.34.1.7).
 *
 * Measured on the default 4-room flat, `TIER=realistic`:
 *
 *   index          195 maps / 195 unique keys   (baked at v0.31.7.251, `min_area 1.5`, `limit 400`)
 *   claimed        155
 *   **ORPHANED      40 (20.5 %)**  -- baked geometry that no longer exists at that position
 *
 * And this branch is the cause: **HDB-SCALE-AUDIT** (`v0.33.2.10`, blast door 800x2100 -> 700x1900
 * and three other fitting dimensions) and **WALL-COLLINEAR-JOIN** (`v0.33.2.12`, mutual wall ends
 * butt instead of mitring) both move shell vertices. The shell got measurably more accurate and
 * took a fifth of its own baked GI with it.
 *
 * **Reading the output.** `unmatchedMeshes` is NOT a defect count — it is dominated by the HDB
 * estate backdrop (`n3-res`, `road-0`, `s1-roof`: thousands of m2 of exterior scenery that is
 * correctly never baked), and by meshes under the bake's own 1.5 m2 threshold. The number that
 * means something is `orphanMaps`: a map with no live claimant is wasted bake AND a surface now
 * running on the fill.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/lightmap-key-audit.mjs
 *
 * Run it after ANY change to `src/apartment/` geometry, and re-bake when it climbs.
 */
import puppeteer from 'puppeteer'
import { appUrl } from './lib.mjs'

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)))
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
  s.setQualityTier?.('realistic')
  s.hideLoading?.()
})
await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
await new Promise((r) => setTimeout(r, 8000))
const out = await page.evaluate(async () => {
  const keyMod = await import('/src/scene/lightmapKey.ts')
  const idxRes = await fetch('/assets/lightmaps/index.json')
  if (!idxRes.ok) return { error: `index.json ${idxRes.status}` }
  const idx = await idxRes.json()
  const entries = idx.maps || []
  const indexKeys = new Set(entries.map((e) => e.key))
  // Re-key every visible mesh the same way the applier does: WORLD-space positions.
  const liveKeys = new Map()
  const unmatched = []
  window.__three.scene.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return
    const g = o.geometry.attributes?.position
    if (!g) return
    o.updateWorldMatrix(true, false)
    const arr = new Float32Array(g.count * 3)
    const v = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < g.count; i++) {
      v.x = g.getX(i)
      v.y = g.getY(i)
      v.z = g.getZ(i)
      const e = o.matrixWorld.elements
      const x = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]
      const y = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]
      const z = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z
    }
    let k = null
    try {
      k = keyMod.lightmapKey(arr)
    } catch {}
    if (!k) return
    liveKeys.set(k, (liveKeys.get(k) || 0) + 1)
    if (!indexKeys.has(k)) {
      // Rough world area, so the misses can be ranked by how much of the room they are.
      o.geometry.computeBoundingBox()
      const b = o.geometry.boundingBox,
        s = o.scale
      const dx = (b.max.x - b.min.x) * s.x,
        dy = (b.max.y - b.min.y) * s.y,
        dz = (b.max.z - b.min.z) * s.z
      const dims = [dx, dy, dz].sort((a, c) => c - a)
      unmatched.push({
        name: o.name || o.parent?.name || 'unnamed',
        area: +(dims[0] * dims[1]).toFixed(2),
      })
    }
  })
  const claimed = new Set([...liveKeys.keys()].filter((k) => indexKeys.has(k)))
  const orphans = entries.filter((e) => !liveKeys.has(e.key))
  unmatched.sort((a, b) => b.area - a.area)
  return {
    indexEntries: entries.length,
    indexUniqueKeys: indexKeys.size,
    liveMeshes: [...liveKeys.values()].reduce((a, b) => a + b, 0),
    liveUniqueKeys: liveKeys.size,
    claimedKeys: claimed.size,
    orphanMaps: orphans.length,
    orphanSample: orphans.slice(0, 5).map((e) => e.file || e.key),
    unmatchedMeshes: unmatched.length,
    topUnmatched: unmatched.slice(0, 12),
    unmatchedAreaTotal: +unmatched.reduce((s, u) => s + u.area, 0).toFixed(1),
    uv: idx.uv,
    pass: idx.pass,
    contexts: Object.keys(idx.contexts || {}),
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
