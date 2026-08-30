/**
 * GRAIN-SCALE — is the same wood rendered at the same PHYSICAL grain period
 * across a piece of furniture, or does every panel get its own scale?
 *
 * A box face's UVs run 0→1 regardless of the face's real size, and the furniture
 * material factories take ONE isotropic `repeat`. So the metres-per-tile a
 * texture actually lands at is `faceSize / repeat` — which means a carcass, its
 * drawer fronts and its 20 mm panel edges, all sharing one cached material, are
 * drawn at wildly different grain scales. Real furniture has one grain scale.
 *
 * For every mesh under the walk camera's view this dumps the mesh's world-space
 * box dimensions, the material's `map.repeat`, and the implied metres-per-tile on
 * each axis, grouped by material so the spread within one material is obvious.
 * A spread of more than ~2x within a single material is a visible tell.
 *
 * NOTE: a material whose grain has been quarter-turned (`getSurfaceMaterialForBox`
 * on a wide-short panel) samples texture-u from the mesh's v axis, so its `repeat`
 * pair is SWAPPED relative to the mesh axes. The key prints `rot=90` for those —
 * read their u and v columns the other way round.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const TIER = process.env.TIER || 'maximum'
const LIMIT = Number(process.env.LIMIT || 40)

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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
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
await page.evaluate(
  ({ h, t }) => {
    const s = window.__store.getState()
    s.setTimeMode('manual')
    s.setManualHour(h)
    s.setQualityTier(t)
  },
  { h: HOUR, t: TIER },
)
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const out = await page.evaluate(async () => {
  const three = window.__three
  const items = window.__store.getState().items ?? []
  const byMat = new Map()
  three.scene.traverse((o) => {
    const m = o.material
    if (!m || Array.isArray(m) || !m.map || !o.geometry) return
    // Which catalogue item this mesh belongs to, by walking up to a tagged group.
    let node = o
    let itemId = null
    while (node && !itemId) {
      itemId = node.userData?.itemId ?? null
      node = node.parent
    }
    const it = items.find((x) => x.id === itemId)
    o.geometry.computeBoundingBox?.()
    const bb = o.geometry.boundingBox
    if (!bb) return
    const sx = (bb.max.x - bb.min.x) * o.scale.x
    const sy = (bb.max.y - bb.min.y) * o.scale.y
    const sz = (bb.max.z - bb.min.z) * o.scale.z
    if (!Number.isFinite(sx) || sx <= 0) return
    const ru = m.map.repeat.x || 1
    const rv = m.map.repeat.y || 1
    const rot = Math.round(((m.map.rotation || 0) * 180) / Math.PI)
    const key = `${m.uuid.slice(0, 8)}|${m.color?.getHexString?.()}|r=${ru.toFixed(2)}x${rv.toFixed(2)}${rot ? `|rot=${rot}` : ''}`
    if (!byMat.has(key)) byMat.set(key, [])
    byMat.get(key).push({
      def: it?.defId ?? '(unowned)',
      dims: [+sx.toFixed(3), +sy.toFixed(3), +sz.toFixed(3)],
      // metres per texture tile on the front face (u→x, v→y) and the side (u→z).
      mptFrontU: +(sx / ru).toFixed(3),
      mptFrontV: +(sy / rv).toFixed(3),
      mptSideU: +(sz / ru).toFixed(3),
    })
  })
  return [...byMat.entries()].map(([k, v]) => ({ key: k, meshes: v }))
})

console.log(`grain-scale  tier=${TIER} hour=${HOUR}\n`)
const rows = out
  .map((g) => {
    const vals = g.meshes
      .flatMap((m) => [m.mptFrontU, m.mptFrontV, m.mptSideU])
      .filter((v) => v > 0)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    return { ...g, lo, hi, spread: hi / lo }
  })
  .sort((a, b) => b.spread - a.spread)
  .slice(0, LIMIT)
for (const r of rows) {
  console.log(
    `${r.key}  meshes=${String(r.meshes.length).padStart(3)}  metres-per-tile ${r.lo.toFixed(3)} … ${r.hi.toFixed(3)}  SPREAD ${r.spread.toFixed(1)}x`,
  )
  const defs = [...new Set(r.meshes.map((m) => m.def))].slice(0, 6).join(', ')
  console.log(`    defs: ${defs}`)
  for (const m of r.meshes.slice(0, 4)) {
    console.log(
      `      ${m.def.padEnd(20)} dims=${JSON.stringify(m.dims)}  mpt u/v/side = ${m.mptFrontU} / ${m.mptFrontV} / ${m.mptSideU}`,
    )
  }
}
await browser.close()
