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
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
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
// Pin the CLOCK before anything else. `setManualHour(h)` is NOT a side-effect-free
// redraw nudge — it switches `timeMode` to manual and jumps the scene to
// `manualHour`. This probe used it purely as an invalidate and never pinned the
// time, so its first capture was the live clock (night, at the hour this ran) and
// the second was daylight: a whole-frame day/night flip that read as
// "pixels>8 = 98.97%, meanAbsDiff 96.37" and looked like a colossal metalness
// effect. It even ticked the onboarding checklist's "Scrub the time of day".
await page.evaluate(
  (h) => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(h)
  },
  Number(process.env.HOUR || 13),
)
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
      // The actual offenders, so the fix targets measured materials rather than a
      // grep's guess about which `metalness:` literals matter.
      offenders: hi.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`),
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
if (!after.env && after.offenders.length) {
  console.log('  offenders (colour@metalness x meshes) — no environment to reflect:')
  for (const o of after.offenders) console.log(`    ${o}`)
}
// Does the REMAINING over-cap band actually matter? A threshold violation is not
// a defect: the cap exists because a fully metallic surface has no diffuse term
// and renders black, but at metalness 0.35 the diffuse term is still 65%. So
// measure it — cap every offender live and diff the frame, pose-independently.
const capImpact = await (async () => {
  const box = { left: 320, top: 144, width: 640, height: 440 } // centre slab, DOM-free
  const shot = async () => {
    await new Promise((r) => setTimeout(r, 1200))
    return page.screenshot({ type: 'png' })
  }
  const raw = async (buf) => await sharp(buf).extract(box).removeAlpha().raw().toBuffer()
  const bufA = await shot()
  fs.writeFileSync('/tmp/ssg-metal/capA.png', bufA)
  const a = await raw(bufA)
  const n = await page.evaluate((cap) => {
    let touched = 0
    window.__three.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.metalness != null && m.metalness > cap) {
          m.metalness = cap
          m.needsUpdate = true
          touched++
        }
      }
    })
    const st = window.__store.getState()
    st.setManualHour(st.manualHour)
    return touched
  }, 0.25)
  const bufB = await shot()
  fs.writeFileSync('/tmp/ssg-metal/capB.png', bufB)
  const b = await raw(bufB)
  let changedPx = 0
  let abs = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    abs += d
    if (d > 8) changedPx++
  }
  return { touched: n, pct: (100 * changedPx) / a.length, mean: abs / a.length }
})()
console.log(
  `\ncapping the remaining ${capImpact.touched} over-cap materials live, at ${THEN}:` +
    `  pixels>8=${capImpact.pct.toFixed(2)}%  meanAbsDiff=${capImpact.mean.toFixed(2)}`,
)

const changed = JSON.stringify(before.item) !== JSON.stringify(after.item)
console.log(
  `\nitem metalness ${changed ? 'UPDATED' : 'UNCHANGED'} across the tier switch` +
    (changed ? '' : ' — the cap is stale (materials keep the boot-time IBL state)'),
)
await browser.close()
