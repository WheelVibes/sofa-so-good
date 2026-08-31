/**
 * STAGING-AUDIT — is the default flat STAGED, in the way render studios mean it?
 *
 * Interior-render writing is consistent about two finishing steps that separate a
 * photograph from a CG frame: rooms must be *decorated*, not merely furnished
 * (scattered cushions, books, trays — "empty or sparsely furnished interiors fail
 * to communicate scale, proportion and lifestyle"), and decor placement must be
 * "slightly varied to avoid an overly centred or staged feel". A layout produced
 * by an auto-arranger is the opposite of that by construction: everything flush,
 * axis-aligned, and centred to the millimetre.
 *
 * This dumps, for the booted default flat: the rotation histogram (how many items
 * sit at an exact multiple of 90°), the distribution of distances-to-wall, and
 * per-room item counts split into furniture vs decor, so "sparse" and "staged" are
 * numbers rather than impressions.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 900_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
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
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after boot')

const out = await page.evaluate(async () => {
  const st = window.__store.getState()
  const items = st.items ?? []
  const plan = st.floorPlan
  const { BUILTIN_CATALOG } = await import('/src/furniture/builtinCatalog.ts')
  const defOf = (id) => BUILTIN_CATALOG?.[id] ?? null
  const rot = {}
  let offAxis = 0
  for (const it of items) {
    const deg = (((((it.rotation ?? 0) * 180) / Math.PI) % 360) + 360) % 360
    const near = Math.round(deg / 90) * 90
    const err = Math.abs(deg - (near % 360))
    const bucket = Math.abs(err) < 0.5 ? `${near % 360}` : 'off-axis'
    rot[bucket] = (rot[bucket] ?? 0) + 1
    if (bucket === 'off-axis') offAxis++
  }
  const rooms = {}
  for (const r of plan.rooms ?? []) rooms[r.id] = { name: r.name ?? r.id, items: [], cats: {} }
  const inRoom = (x, z) =>
    (plan.rooms ?? []).find(
      (r) =>
        x >= r.origin[0] &&
        x <= r.origin[0] + r.width &&
        z >= r.origin[1] &&
        z <= r.origin[1] + r.depth,
    )
  for (const it of items) {
    // `PlacedItem.position` is [x, z] on the floor plane — NOT a 3-vector.
    const r = inRoom(it.position?.[0] ?? 0, it.position?.[1] ?? 0)
    if (!r) continue
    const d = defOf(it.defId)
    const cat = d?.category ?? 'unknown'
    rooms[r.id].items.push(it.defId)
    rooms[r.id].cats[cat] = (rooms[r.id].cats[cat] ?? 0) + 1
  }
  return { total: items.length, rot, offAxis, rooms }
})

console.log(`staging-audit  ${out.total} items\n`)
console.log('rotation histogram (exact multiples of 90 deg vs anything else):')
for (const [k, v] of Object.entries(out.rot).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padStart(8)}  ${v}`)
}
console.log(
  `  -> ${out.offAxis}/${out.total} items sit off the cardinal axes (${((out.offAxis / out.total) * 100).toFixed(1)}%)\n`,
)
const allCats = {}
for (const r of Object.values(out.rooms))
  for (const [c, n] of Object.entries(r.cats)) allCats[c] = (allCats[c] ?? 0) + n
console.log('categories across the flat:')
for (const [c, n] of Object.entries(allCats).sort((a, b) => b[1] - a[1]))
  console.log(`  ${c.padEnd(14)} ${n}`)
console.log('')
console.log('per room: item count and categories')
for (const r of Object.values(out.rooms)) {
  const cats = Object.entries(r.cats)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}:${n}`)
    .join(' ')
  console.log(`  ${r.name.padEnd(18)} ${String(r.items.length).padStart(3)}  ${cats}`)
}
await browser.close()
