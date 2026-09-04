/**
 * GUARD: does the shipped lightmap index still match the scene it ships with?
 *
 * **The degradation this catches.** Keys hash world-space geometry, so any change to a surface —
 * a wall's height, a new curtain, a moved template opening — silently stops its key matching and
 * its map is never applied. The map still downloads. Nothing warns. `v0.31.7.232` found **14 of
 * the shipped set's 111 keys no longer match**, from this session's own template edits, and the
 * only reason anyone noticed was a re-bake run for a different purpose.
 *
 * This turns that into a number with a floor. It boots the app, waits for the maps to attach, and
 * reports how many of the keyed candidates actually received one. Exits NON-ZERO when the count
 * falls below `MIN_APPLIED`, so a geometry change that quietly costs coverage fails here instead
 * of being discovered rounds later.
 *
 * **Why a probe and not a unit test.** The keys are hashes of the LIVE scene's world positions, so
 * reproducing them needs the render graph, three.js and a GPU context. There is no way to assert
 * this in `vitest`; the check has to run the app.
 *
 * MIN_APPLIED is the count measured today, less a small margin for the furniture maps that come
 * and go with layout (`v0.31.7.233`: the furniture half of coverage is fragile by design, since
 * dragging an item stops its key matching — only the SHELL half is stable, and that is what this
 * floor is really protecting).
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

/**
 * Measured `v0.31.7.252` on the 195-map set: **179 mapped — 141 shell + 38 furniture**, matching
 * the `applied to 179/386 candidates` the app logs itself. Was 107 (98 + 9) on the 111-map set.
 *
 * The floor is **130**, raised from 95 with the set. It sits below the 141 SHELL maps on purpose:
 * the 38 furniture maps are fragile by construction (`v0.31.7.233` — dragging an item stops its key
 * matching), so a floor above the shell count would fail on a layout change instead of on a
 * regression. 130 is tight enough to catch a real loss of shell coverage and loose enough to ignore
 * furniture churn.
 *
 * That is deliberately a different number from `gi-material-census.mjs`'s 101, and the difference
 * is not a discrepancy: this walks EVERY mesh, while the census counts only VISIBLE ones. Six maps
 * therefore sit on meshes hidden at the moment of measurement (a culled level, an occluded face).
 * A staleness guard wants the full count, because a hidden mesh's key going stale is the same
 * regression as a visible one's — it just has not been looked at yet.
 */
const MIN_APPLIED = Number(process.env.MIN_APPLIED || 130)
const TIER = process.env.TIER || 'realistic'

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  defaultViewport: { width: 900, height: 600, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const lines = []
page.on('console', (m) => {
  const t = m.text()
  if (/lightmap/i.test(t)) lines.push(t)
})
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 16000))
await assertSceneAlive(page, 'after attach')

// Counted from the SCENE, not parsed out of the log line: `v0.31.7.226` found that line reports
// key LOOKUPS at twice the mesh count, and a guard should not depend on a figure that was
// mislabelled for forty commits.
const applied = await page.evaluate(() => {
  let shell = 0
  let item = 0
  window.__three.scene.traverse((o) => {
    if (!o.isMesh) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (!m?.userData?.visMapUrl) return
    let id = null
    let q = o
    while (q && !id) {
      id = q.userData?.itemId ?? null
      q = q.parent
    }
    if (id) item += 1
    else shell += 1
  })
  return { shell, item, total: shell + item }
})
for (const l of lines) console.log(`  app: ${l}`)
console.log(
  `  counted from the scene: ${applied.total} mapped (${applied.shell} shell + ${applied.item} furniture), floor ${MIN_APPLIED}`,
)
await browser.close()
if (applied.total < MIN_APPLIED) {
  console.error(
    `STALE INDEX: ${applied.total} maps applied, below the ${MIN_APPLIED} floor. Geometry changed ` +
      'since the shipped bake, so some surfaces render unmapped while their maps still download. ' +
      'Re-bake (see the invocation recorded in v0.31.7.228) or lower the floor deliberately.',
  )
  process.exit(1)
}
console.log('  OK — the shipped index still matches this scene')
