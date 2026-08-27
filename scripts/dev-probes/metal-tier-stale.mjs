/**
 * Does a tier change update the metalness cap on already-built materials?
 *
 * `materials/iblSignal.ts` exists because a fully metallic PBR surface has no
 * diffuse term: with `scene.environment === null` it has nothing to reflect and
 * renders black. So `getSolidMaterial` / `getMetalMaterial` cap metalness at
 * `NO_IBL_METALNESS` (0.25) while `isIblActive()` is false — the flat
 * `performance` tier has no IBL.
 *
 * The catch is WHEN that is read. `isIblActive()` is called once, inside the
 * factory, at material-creation time, and the result is baked into both the
 * material AND its cache key. Only `MetalMaterial.tsx` subscribes to
 * `subscribeIbl`; the plain factories do not, and nothing re-invokes them on a
 * tier change. That matters because the tier is NOT static: TIER-ADAPTIVE walks
 * the ladder at runtime (medium -> high on capable hardware, down to performance
 * on weak), so a material built at one IBL state can outlive it.
 *
 * Two failure directions, both checked here by switching the tier live and
 * re-reading the SAME material instances:
 *   performance -> medium   metals stay capped at 0.25 and look too matte
 *   medium -> performance   metals stay at 0.75 with nothing to reflect, i.e.
 *                           the black-slab defect the cap was added to prevent
 *
 * Reports the metalness of every distinct material reachable from the default
 * flat's wardrobes (whose sliding-door "aluminium frame" is a ~1 m2 panel at
 * metalness 0.75) plus a scene-wide census, before and after each switch.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const DEF = process.env.DEF || 'wardrobe-3door'
const START = process.env.START || 'performance'
const THEN = process.env.THEN || 'medium'

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
// Pin the tier BEFORE the furniture materials are first built, so the starting
// IBL state is the one baked into them.
await page.evaluate((t) => window.__store.getState().setQualityTier(t), START)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 6000))
await assertSceneAlive(page, 'after boot')

/** Metalness census over the target item's materials + the whole scene. */
async function census(def) {
  return page.evaluate((d) => {
    const ids = new Set(
      window.__store
        .getState()
        .items.filter((i) => i.defId === d)
        .map((i) => i.id),
    )
    const item = new Map()
    const all = new Map()
    window.__three.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      let node = o
      let mine = false
      while (node && !mine) {
        if (node.userData?.itemId && ids.has(node.userData.itemId)) mine = true
        node = node.parent
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.metalness == null) continue
        const k = `#${m.color?.getHexString?.() ?? '------'}@${m.metalness.toFixed(2)}`
        all.set(k, (all.get(k) ?? 0) + 1)
        if (mine) item.set(k, (item.get(k) ?? 0) + 1)
      }
    })
    const hi = [...all.entries()].filter(([k]) => Number(k.split('@')[1]) > 0.25)
    return {
      item: [...item.entries()].sort(),
      highMetalMeshes: hi.reduce((a, [, n]) => a + n, 0),
      highMetalKinds: hi.length,
      env: !!window.__three.scene.environment,
    }
  }, def)
}

console.log(`ibl-stale check — ${START} -> ${THEN}, item defId=${DEF}\n`)
const before = await census(DEF)
console.log(`at ${START}: scene.environment=${before.env}`)
console.log(`  ${DEF} materials (colour@metalness x meshes): ${JSON.stringify(before.item)}`)
console.log(
  `  scene-wide: ${before.highMetalMeshes} meshes across ${before.highMetalKinds} material kinds above the 0.25 cap`,
)

await page.evaluate((t) => window.__store.getState().setQualityTier(t), THEN)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 6000))
await assertSceneAlive(page, `after switch to ${THEN}`)

const after = await census(DEF)
console.log(`\nafter switching to ${THEN}: scene.environment=${after.env}`)
console.log(`  ${DEF} materials (colour@metalness x meshes): ${JSON.stringify(after.item)}`)
console.log(
  `  scene-wide: ${after.highMetalMeshes} meshes across ${after.highMetalKinds} material kinds above the 0.25 cap`,
)
const changed = JSON.stringify(before.item) !== JSON.stringify(after.item)
console.log(
  `\nitem metalness ${changed ? 'UPDATED' : 'UNCHANGED'} across the tier switch` +
    (changed ? '' : ' — the cap is stale (materials keep the boot-time IBL state)'),
)
await browser.close()
