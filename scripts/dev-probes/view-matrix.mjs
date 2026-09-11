/**
 * VIEW-MATRIX — capture every (quality tier x camera mode) the app ships, at matched poses.
 *
 * SHOWROOM-PARITY (`v0.34.1.12`) measured the app against a corpus of real interiors and found it
 * has no dark end and ~4x too little micro-detail — but it measured **walk mode on `realistic`
 * only**. That is one cell of a six-cell matrix, and `performance` is the tier a weak device BOOTS
 * into, so it is what most users would actually see.
 *
 * | | walk (firstPerson) | orbit / dollhouse | room editor |
 * | --- | --- | --- | --- |
 * | `performance` | ? | ? | ? |
 * | `realistic` | measured | excluded as invalid | ? |
 *
 * **What each cell may legitimately be compared against, which is not the same for all three.**
 *
 * - **Walk** is an eye-level view from inside a room, so the photograph corpus applies.
 * - **Orbit/dollhouse** is a section cut of the whole flat seen from OUTSIDE it. No photograph of a
 *   real apartment looks like that, and `showroom-parity.mjs` excludes orbit frames for exactly
 *   this reason — including four of them moved three metrics. Its valid references are the app
 *   against ITSELF across tiers, and a Cycles render at the same pose.
 * - **Room editor** is a single room with the shell cut away (`roomEditorShell.ts`). Same argument:
 *   no photographic equivalent, so tier-vs-tier and Cycles are the honest comparisons.
 *
 * So this probe CAPTURES the matrix; it deliberately does not tell you that an orbit frame is
 * "wrong" against a photograph, because that comparison would not mean anything.
 *
 * **Known limitation.** The orbit azimuth call is optional-chained (`window.__orbit?.setAzimuth?.`)
 * and silently no-ops when that handle is absent, so the three orbit frames may be one pose
 * repeated. Do not rest an orbit claim on spread across them until that is wired.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/view-matrix.mjs --out /tmp/view-matrix
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

/** Walk poses: `[x, z, yaw, pitch]` in three space, spread across rooms rather than clustered. */
export const WALK_POSES = [
  { name: 'living-far', p: [10.9, 5.2, 0, -0.02] },
  { name: 'living-window', p: [10.87, 6.475, 0, -0.06] },
  { name: 'corridor-west', p: [7.4, 5.9, Math.PI / 2, -0.03] },
  { name: 'bedroom2-door', p: [5.2, 4.6, 0, -0.05] },
  { name: 'kitchen-east', p: [3.6, 7.2, Math.PI / 2, -0.05] },
]

/** Orbit azimuths, in degrees around the flat. */
export const ORBIT_YAWS = [0, 120, 240]

/** Rooms to open in the per-room editor. */
export const EDITOR_ROOMS = ['livingDining', 'mainBedroom', 'kitchen']

export const TIERS = ['performance', 'realistic']

async function boot(browser, tier, hour) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => {
    throw e
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
    } catch {}
  })
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
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
      // Pinned OFF so a long frame cannot halve the canvas mid-capture and change every metric
      // that depends on resolution -- `localContrast` above all.
      s.setFeatureFlag?.('interactiveDegrade', false)
      s.setWalkFov?.(50)
    },
    { t: tier, h: hour },
  )
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  // Lights off the way the reference exports do it: `setLightsMode` alone does NOT flip them.
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await new Promise((r) => setTimeout(r, 7000))
  return page
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/view-matrix'
  const hour = args.includes('--hour') ? Number(args[args.indexOf('--hour') + 1]) : 13
  fs.mkdirSync(out, { recursive: true })
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
  })
  const shot = async (page, name) => {
    await assertSceneAlive(page, name)
    await new Promise((r) => setTimeout(r, 1800))
    await page.screenshot({ path: path.join(out, `${name}.png`) })
    console.log('   ', name)
  }
  for (const tier of TIERS) {
    console.log(`\n== ${tier} ==`)
    const page = await boot(browser, tier, hour)
    const live = await page.evaluate(() => window.__store.getState().qualityTier)
    // The tier is REPORTED back, because `setQualityTier` can be overridden by the adaptive ladder
    // and a silently demoted arm would look like a rendering difference.
    console.log(`  resolved tier: ${live}`)

    // --- orbit / dollhouse ---
    await page.evaluate(() => window.__store.getState().setCameraMode('orbit'))
    await new Promise((r) => setTimeout(r, 3500))
    for (const yaw of ORBIT_YAWS) {
      await page.evaluate((y) => window.__orbit?.setAzimuth?.((y * Math.PI) / 180), yaw)
      await shot(page, `${tier}__orbit__yaw${yaw}`)
    }

    // --- per-room editor (requires orbit; `canEditScene` gates on it) ---
    for (const room of EDITOR_ROOMS) {
      const ok = await page.evaluate((r) => {
        const s = window.__store.getState()
        if (!s.enterRoomEditor) return false
        s.enterRoomEditor(r)
        return window.__store.getState().roomEditor?.active === true
      }, room)
      if (!ok) {
        console.log(`    (room editor unavailable for ${room})`)
        continue
      }
      await new Promise((r) => setTimeout(r, 3000))
      await shot(page, `${tier}__editor__${room}`)
      await page.evaluate(() => window.__store.getState().exitRoomEditor?.())
      await new Promise((r) => setTimeout(r, 1500))
    }

    // --- walk ---
    await page.evaluate(() => window.__store.getState().setCameraMode('firstPerson'))
    await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
      timeout: 20000,
    })
    await new Promise((r) => setTimeout(r, 4500))
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
      await shot(page, `${tier}__walk__${name}`)
    }
    await page.close()
  }
  await browser.close()
  console.log(`\ncaptured -> ${out}`)
}
