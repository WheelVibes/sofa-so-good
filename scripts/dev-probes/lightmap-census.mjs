/**
 * WHICH meshes carry a baked lightmap, and which do not — with sizes, so the
 * unmapped ones can be identified by shape rather than by their `Mesh_NNN` name.
 *
 * **Why this exists.** `v0.31.7.130` parked the GI seam after six refutations,
 * one of them "mapped/unmapped boundary at low coverage", refuted by raising
 * coverage 10 % → 50 % with the artefact unchanged. That test varied the SIZE of
 * the map set. It could not refute the boundary hypothesis if a mesh is excluded
 * by CLASS rather than by budget — baking more maps never reaches a mesh nothing
 * intends to bake. `v0.31.7.164`'s difference image put the artefact exactly on
 * the silhouette of a mesh whose interior is bit-identical between the arms, i.e.
 * on an UNMAPPED mesh next to a mapped wall, so the distinction now matters.
 *
 * Reports the split and the largest unmapped meshes by screen-relevant size,
 * because "is it mapped" is a per-mesh fact the index cannot answer on its own:
 * the index says what was BAKED, and this says what the renderer actually BOUND.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const TIER = process.env.TIER || 'realistic'
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
await page.emulateTimezone('Asia/Singapore')
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 5000))
await assertSceneAlive(page, 'after tier')

const out = await page.evaluate(() => {
  const scene = window.__three?.scene
  if (!scene) throw new Error('__three.scene absent')
  const rows = []
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    // NOT `material.lightMap`: the GI is injected by a shader patch on
    // `diffuseColor`, so the standard slot is empty on every mesh and a census
    // that reads it reports `mapped=0` while the frame visibly changes. The
    // applier stamps `userData.visMapUrl` in DEV for exactly this purpose.
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const lm = mats.some((m) => m?.userData?.visMapUrl)
    o.geometry.computeBoundingBox?.()
    const bb = o.geometry.boundingBox
    const s = bb ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] : [0, 0, 0]
    const sc = o.scale
    const dim = [s[0] * sc.x, s[1] * sc.y, s[2] * sc.z].map((v) => Math.abs(v))
    rows.push({
      name: o.name || '(anon)',
      lm,
      hasUv1: !!o.geometry.attributes?.uv1,
      dim: dim.map((v) => Number(v.toFixed(2))),
      vol: Number((dim[0] * dim[1] * dim[2]).toFixed(3)),
      visible: o.visible,
      // The bake's own gate (`--min-area 3.0`) and the applier's (`MIN_SPAN_M
      // 1.5`) are both size filters, so record the span the applier tests.
      span: Number(Math.max(...[0, 1, 2].map((k) => dim[k])).toFixed(2)),
    })
  })
  return rows
})
await browser.close()

const mapped = out.filter((r) => r.lm)
const un = out.filter((r) => !r.lm)
console.log(`tier=${TIER}  meshes=${out.length}  mapped=${mapped.length}  unmapped=${un.length}`)
console.log(
  `  unmapped WITH a uv1 attribute (baked-for but not bound): ${un.filter((r) => r.hasUv1).length}`,
)
const byVol = un
  .filter((r) => r.visible)
  .sort((a, b) => b.vol - a.vol)
  .slice(0, 20)
console.log('\nlargest VISIBLE unmapped meshes (dim = world x,y,z):')
for (const r of byVol) {
  console.log(
    `  ${r.name.padEnd(22)} vol=${String(r.vol).padStart(8)}  dim=${r.dim.join(' x ')}  uv1=${r.hasUv1}`,
  )
}
