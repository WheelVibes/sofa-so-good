/**
 * How many MAPPED meshes share a material — the cause of `v0.31.7.174`'s black floor.
 *
 * **The defect it found.** `applyVisibilityLightmap` patches a **material**, not a mesh, while
 * `uv1` is built per **geometry**. When N meshes share one material the last apply wins, so every
 * mesh on that material samples ONE map — and any of them that was never keyed has no `uv1` at
 * all, so it samples undefined coordinates. In `'replace'` mode that is not a dim surface, it is
 * a cliff: `indirectDiffuse` is ASSIGNED, so the surface loses all its indirect light and goes
 * black. Measured: the bedroom3 wood floor at 126.7 counts with the feature off and **24.4** with
 * it on, warm cast gone (R−B +26.9 -> −4.5).
 *
 * **Why the earlier elimination missed it.** `v0.31.7.130` ruled out "per-map scale colliding on a
 * shared material — 0 of 175 materials". That asked whether two maps disagreed about a material's
 * SCALE. This asks how many meshes ride each patched material, which is a different question and
 * the one that matters: the collision is not in the scale, it is in the texture and the UVs.
 *
 * Reports the mesh-per-material distribution and, per shared material, how many of its meshes
 * actually carry `uv1` — that second number is the black-surface count.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

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
await page.evaluate(() => window.__store.getState().setQualityTier('realistic'))
await new Promise((r) => setTimeout(r, 5000))
await assertSceneAlive(page, 'after tier')
const out = await page.evaluate(() => {
  const scene = window.__three.scene
  const byMat = new Map()
  scene.traverse((o) => {
    if (!o.isMesh) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (!m?.userData?.visMapUrl) return
    if (!byMat.has(m)) byMat.set(m, { url: m.userData.visMapUrl, meshes: 0, uv1: 0 })
    const e = byMat.get(m)
    e.meshes += 1
    if (o.geometry?.attributes?.uv1) e.uv1 += 1
  })
  const rows = [...byMat.values()]
  return {
    materials: rows.length,
    meshes: rows.reduce((s, r) => s + r.meshes, 0),
    shared: rows.filter((r) => r.meshes > 1).length,
    meshesOnShared: rows.filter((r) => r.meshes > 1).reduce((s, r) => s + r.meshes, 0),
    worst: rows
      .sort((a, b) => b.meshes - a.meshes)
      .slice(0, 6)
      .map((r) => ({ n: r.meshes, uv1: r.uv1, url: r.url.split('/').pop() })),
  }
})
await browser.close()
console.log(JSON.stringify(out, null, 1))
