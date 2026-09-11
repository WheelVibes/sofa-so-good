/**
 * LIGHTMAP-AB — render the SAME poses under two baked lightmap sets, so a human can look at
 * them side by side and decide which is right.
 *
 * Arms are selected with the existing `?aoDir=` DEV seam (`VisibilityLightmaps.tsx`), which
 * redirects BOTH the index fetch and the map `baseUrl`. The shipped set is never overwritten.
 *
 * **The load assertion is the point of this probe, not decoration.** `v0.31.7.90`-`.93` compared
 * three irradiance bakes and got statistics identical to the decimal, because the maps were never
 * actually loaded: the index resolved, materials were patched, and the map files 404'd. So each
 * arm asserts that patched materials carry a texture with real image data AND that no `/assets/`
 * PNG request failed, and it REFUSES to report numbers otherwise.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/lightmap-ab.mjs --out /tmp/lm-ab
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'
import { MIN_CLEARANCE, WALK_POSES } from './view-matrix.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function boot(browser, dir, tier, hour) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
  const failed = []
  // `applyLightmapsFromIndex`'s own summary line. The `patched` COUNT below is not a substitute:
  // it is a walk of the live graph and is unstable across runs, while this is the applier saying
  // what it did. Report both and believe this one.
  const applied = []
  page.on('console', (m) => {
    const t = m.text()
    if (/applied to \d+\/\d+ candidates/.test(t)) applied.push(t)
  })
  page.on('response', (r) => {
    if (r.url().includes('/assets/') && r.url().endsWith('.png') && !r.ok()) failed.push(r.url())
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  const sep = appUrl().includes('?') ? '&' : '?'
  await page.goto(`${appUrl()}${sep}aoDir=${dir}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.evaluate(
    ({ t, h }) => {
      const s = window.__store.getState()
      s.endTour?.()
      s.setOnboardingOpen?.(false)
      s.dismissLocationPrompt?.()
      s.dismissChecklist?.()
      s.setManualHour?.(h)
      s.setTimeMode?.('manual')
      s.setQualityTier?.(t)
      s.hideLoading?.()
      s.setFeatureFlag?.('interactiveDegrade', false)
      s.setWalkFov?.(50)
    },
    { t: tier, h: hour },
  )
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await sleep(7000)
  return { page, failed, applied }
}

/** Walk the live graph and report whether the baked maps really reached the materials. */
async function loadReport(page) {
  return page.evaluate(() => {
    const out = { patched: 0, withImage: 0, withoutImage: 0, sample: null }
    const seen = new Set()
    const t = window.__three
    const visit = (o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        if (!m || seen.has(m.uuid)) continue
        seen.add(m.uuid)
        const probe = m.__visMapForProbe
        if (!probe) continue
        out.patched++
        const img = probe.image
        const w = img?.width ?? 0
        const h = img?.height ?? 0
        if (w > 0 && h > 0) {
          out.withImage++
          if (!out.sample)
            out.sample = {
              w,
              h,
              src: String(img?.src ?? '')
                .split('/')
                .pop(),
            }
        } else out.withoutImage++
      }
      for (const c of o.children ?? []) visit(c)
    }
    visit(t.scene)
    return out
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/lm-ab'
  const hour = args.includes('--hour') ? Number(args[args.indexOf('--hour') + 1]) : 13
  const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : 'realistic'
  const dirs = (
    args.includes('--dirs') ? args[args.indexOf('--dirs') + 1] : 'lightmaps,lightmaps-rebake4'
  ).split(',')
  fs.mkdirSync(out, { recursive: true })
  const summary = []
  for (const dir of dirs) {
    console.log(`\n== ${dir} ==`)
    // ONE BROWSER PER ARM, and this is NOT tidiness (measured v0.34.1.x, rebake6 round).
    // Booting a second arm in a browser that has already loaded a different set renders a
    // DIFFERENT PICTURE from the same set booted alone: `lightmaps-rebake6` as the second arm
    // applied to 161 materials and put the right-hand living-room wall at RGB 80.5/99.8/104.1,
    // while the same set alone applied to 185 and put it at 123.6/131.7/132.4 — reproducibly,
    // three independent single-arm runs agreeing to 0.1 count. It is worse than the 404 trap the
    // load assertion already catches, because NOTHING fails: no PNG 404s, every patched material
    // carries real image data, and the frame is simply wrong. Every A/B verdict taken from a
    // second arm in a shared browser is therefore void.
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=metal',
        '--enable-gpu',
        '--enable-webgl',
      ],
    })
    const { page, failed, applied } = await boot(browser, dir, tier, hour)
    const live = await page.evaluate(() => window.__store.getState().qualityTier)
    const load = await loadReport(page)
    console.log(
      `  tier=${live} patched=${load.patched} withImage=${load.withImage} ` +
        `withoutImage=${load.withoutImage} failedPng=${failed.length} sample=${JSON.stringify(load.sample)}`,
    )
    for (const line of applied) console.log(`  applier: ${line}`)
    if (load.patched === 0)
      throw new Error(`${dir}: no material was patched — the set never loaded`)
    if (load.withoutImage > 0 || failed.length > 0)
      throw new Error(
        `${dir}: ${load.withoutImage} patched materials have no image and ${failed.length} PNG ` +
          `requests failed — this arm's pixels are NOT this set (see the v0.31.7.90 trap)`,
      )

    // orbit / dollhouse (boot framing)
    await page.evaluate(() => window.__store.getState().setCameraMode('orbit'))
    await sleep(3500)
    await assertSceneAlive(page, `${dir}__orbit`)
    await page.screenshot({ path: path.join(out, `${dir}__orbit.png`) })
    console.log('    orbit')

    // walk poses
    await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
    await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
      timeout: 20000,
    })
    await sleep(4500)
    await page.evaluate(() => {
      const s = window.__store.getState()
      s.hideLoading?.()
      s.dismissCallout?.('walk-mode')
      s.setWalkFov?.(50)
    })
    for (const { name, p } of WALK_POSES) {
      await page.evaluate((q) => {
        const l = window.__walkLook
        l.setPosition(q[0], q[1])
        l.setYaw(q[2])
        l.setPitch(q[3])
      }, p)
      await sleep(2200)
      // MIN_CLEARANCE, carried over from view-matrix.mjs. A pose with no room in front of it is
      // not a view of a room, and it does not LOOK wrong in the numbers -- it quietly dominates
      // the comparison. `corridor-along` reported a -43 count "change" between two lightmap sets
      // purely because the camera was clipped into a cabinet; that is the same failure the
      // `corridor-west` pose caused before it was deleted. Skip rather than throw, so one bad
      // pose cannot abort a long A/B, but say so loudly.
      const clearance = await page.evaluate(() => {
        const t = window.__three
        const cam = t.camera
        const ray = t.raycaster
        const dir = cam.getWorldDirection(cam.position.clone())
        ray.set(cam.position.clone(), dir.normalize())
        ray.near = 0.01
        ray.far = 50
        const hits = ray.intersectObjects(t.scene.children, true).filter((h) => h.object.visible)
        return hits.length ? +hits[0].distance.toFixed(3) : 99
      })
      if (clearance < MIN_CLEARANCE) {
        console.log(
          `    SKIP ${name} — clearance ${clearance} m < ${MIN_CLEARANCE} (camera in geometry)`,
        )
        continue
      }
      await assertSceneAlive(page, `${dir}__${name}`)
      await page.screenshot({ path: path.join(out, `${dir}__${name}.png`) })
      console.log('   ', name)
    }
    summary.push({ dir, tier: live, load, failedPng: failed.length, applied })
    await page.close()
    await browser.close()
  }
  fs.writeFileSync(path.join(out, 'ab.json'), JSON.stringify(summary, null, 2))
  console.log('\nframes ->', out)
}
