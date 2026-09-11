/**
 * WEATHER-APP — does picking a weather condition change the render, and is `clear` untouched?
 *
 * Two questions in one run, because they need the same session and the same poses:
 *
 * 1. **The SAFETY property.** `'clear'` is the default condition, so a user who never opens the
 *    picker must get exactly the shipped render. The control is the feature FLAG off — same scene,
 *    same clock, same pose, `weatherConditions: false` — and the arm is the flag ON with `'clear'`
 *    selected. A difference there is a regression in the default look.
 * 2. **The EFFECT.** `partlyCloudy` / `overcast` / `rain` must move the frame, and move it the way
 *    `weather.ts` says: darker and flatter under a deck, with the beam gone.
 *
 * **The noise floor is measured, not assumed.** The flag-off arm is captured TWICE, at the start
 * and at the end of each cell, and the diff between those two identical captures is the floor.
 * `feature-price.mjs` records why: a repeated baseline reads `meanAbsDiff 0.27` on this stack, so a
 * 0.6 looks meaningful until you see the floor beside it. Every number below is quoted against it.
 *
 * **Poses come from `view-matrix.mjs`**, including its `MIN_CLEARANCE` raycast guard — a
 * hand-written pose list contains a bad pose and it does not look like one in the numbers (that
 * probe lost a tier comparison to a camera pressed against a wall). The guard THROWS rather than
 * capturing.
 *
 * **The room editor needs its own cell.** `RoomEditorScene` is a SECOND canvas over the same store
 * and its `cameraMode` is also `'orbit'`, so orbit and editor cannot be told apart by mode — they
 * are entered and exited explicitly here, the same way `view-matrix.mjs` does it.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/weather-app.mjs --out /tmp/weather/app
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'
import { CROP, metrics, ROOM_CROP } from './showroom-parity.mjs'
import { MIN_CLEARANCE, WALK_POSES } from './view-matrix.mjs'

export const CONDITIONS = ['clear', 'partlyCloudy', 'overcast', 'rain']
export const TIERS = ['performance', 'realistic']
/** A subset of `view-matrix.mjs`'s poses — one deep room view and one small room. */
export const POSES = WALK_POSES.filter((p) => ['living-far', 'kitchen-east'].includes(p.name))

/**
 * Rectangles holding a CONTINUOUSLY ANIMATING object, per view, as frame fractions.
 *
 * The default flat's living/dining ceiling fan spins under `frameloop="demand"`, so two captures
 * seconds apart catch it at unrelated blade angles. `src/scene/CLAUDE.md` records this exactly —
 * *"a whole-frame day diff is dominated by the CEILING FAN's blade angle, so localise one before
 * believing it"* — and it is the whole of the residual here: the amplified diff of the flag-off
 * control against the flag-on `clear` arm is the five blades on pure black, everything else
 * bit-clean. Both numbers are reported, because excluding a region silently is how a real
 * difference gets hidden inside a rectangle drawn to make a result look good.
 */
export const ANIMATED = {
  'walk-living-far': [{ name: 'ceiling-fan', x: 0.2, y: 0.0, w: 0.46, h: 0.34 }],
}

/** Per-pixel diff of two same-size PNGs: mean |Δ| over channels and the fraction past a threshold.
 *  `exclude` rectangles (frame fractions) are dropped from BOTH the sums and the pixel count. */
export async function diff(a, b, threshold = 2, exclude = []) {
  const sharp = (await import('sharp')).default
  const ra = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const rb = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  if (ra.data.length !== rb.data.length) throw new Error(`size mismatch: ${a} vs ${b}`)
  const { width: w, height: h } = ra.info
  const keep = new Uint8Array(w * h).fill(1)
  for (const r of exclude) {
    const x0 = Math.round(r.x * w)
    const y0 = Math.round(r.y * h)
    const x1 = Math.min(w, x0 + Math.round(r.w * w))
    const y1 = Math.min(h, y0 + Math.round(r.h * h))
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) keep[y * w + x] = 0
  }
  let sum = 0
  let over = 0
  let max = 0
  let n = 0
  for (let p = 0; p < w * h; p++) {
    if (!keep[p]) continue
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(ra.data[p * 3 + c] - rb.data[p * 3 + c])
      sum += d
      if (d > threshold) over++
      if (d > max) max = d
      n++
    }
  }
  return {
    meanAbsDiff: +(sum / n).toFixed(3),
    pctOver: +((100 * over) / n).toFixed(3),
    maxDiff: max,
    channels: n,
  }
}

async function boot(browser, tier) {
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
  await page.evaluate((t) => {
    const s = window.__store.getState()
    s.endTour?.()
    s.setOnboardingOpen?.(false)
    s.dismissLocationPrompt?.()
    s.dismissChecklist?.()
    s.setTimeMode?.('manual')
    s.setManualHour?.(13)
    s.setQualityTier?.(t)
    s.hideLoading?.()
    // Pinned OFF so a long frame cannot halve the pixel ratio mid-capture: every metric here
    // depends on resolution, and a degrade would read as a weather effect.
    s.setFeatureFlag?.('interactiveDegrade', false)
    s.setWalkFov?.(50)
  }, tier)
  await page.waitForFunction('window.__store.getState().sceneReady === true', { timeout: 90000 })
  // The device class has to be PINNED, not just set: the adaptive ladder re-demotes it a few
  // seconds after scene-ready even on real hardware (playbook, "the adaptive quality ladder
  // demotes deviceClass in headless runs"). Call the real setter once, then neuter it.
  await page.evaluate(() => {
    const s = window.__store
    s.getState().setDeviceClass('capable')
    s.setState({ setDeviceClass: () => {} })
  })
  // Lamps off the way the reference exports do it — `setLightsMode` alone does NOT flip them.
  // Weather is a DAYLIGHT question, and a lamp-lit room is the same in every sky.
  await page.evaluate(() => {
    const s = window.__store.getState()
    for (const id of s.items.filter((i) => i.props?.lightOn !== 'no').map((i) => i.id))
      s.toggleLightPower(id)
  })
  await new Promise((r) => setTimeout(r, 7000))
  return page
}

async function setArm(page, arm) {
  await page.evaluate(({ flag, weather }) => {
    const s = window.__store.getState()
    s.setFeatureFlag('weatherConditions', flag)
    s.setWeather(weather)
  }, arm)
  await new Promise((r) => setTimeout(r, 1600))
}

async function shot(page, out, name) {
  await assertSceneAlive(page, name)
  await new Promise((r) => setTimeout(r, 900))
  const file = path.join(out, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}

async function enterWalk(page, pose) {
  await page.evaluate(() => {
    const s = window.__store.getState()
    s.setCameraMode('firstPerson')
    s.dismissCallout?.('walk-mode')
  })
  await page.waitForFunction("window.__store.getState().cameraMode === 'firstPerson'", {
    timeout: 20000,
  })
  await new Promise((r) => setTimeout(r, 3500))
  await page.evaluate(() => window.__store.getState().setWalkFov?.(50))
  await page.evaluate((q) => {
    const l = window.__walkLook
    l.setPosition(q[0], q[1])
    l.setYaw(q[2])
    l.setPitch(q[3])
  }, pose.p)
  await new Promise((r) => setTimeout(r, 1200))
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
  if (clearance < MIN_CLEARANCE)
    throw new Error(
      `pose ${pose.name}: only ${clearance} m of clear space ahead (need ${MIN_CLEARANCE})`,
    )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/weather/app'
  const tiers = args.includes('--tiers') ? args[args.indexOf('--tiers') + 1].split(',') : TIERS
  fs.mkdirSync(out, { recursive: true })
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--enable-webgl'],
  })
  const report = []

  for (const tier of tiers) {
    const page = await boot(browser, tier)
    const live = await page.evaluate(() => {
      const s = window.__store.getState()
      return { tier: s.qualityTier, device: s.deviceClass, hour: s.manualHour, mode: s.uiMode }
    })
    console.log(
      `\n== ${tier}  (resolved ${live.tier}/${live.device}, hour ${live.hour}, ${live.mode})`,
    )

    const cells = [
      {
        view: 'orbit',
        enter: async () => {
          await page.evaluate(() => window.__store.getState().setCameraMode('orbit'))
          await new Promise((r) => setTimeout(r, 3500))
        },
      },
      {
        view: 'editor',
        enter: async () => {
          await page.evaluate(() => window.__store.getState().setCameraMode('orbit'))
          await new Promise((r) => setTimeout(r, 2500))
          const ok = await page.evaluate(() => {
            const s = window.__store.getState()
            s.enterRoomEditor?.('livingDining')
            return window.__store.getState().roomEditor?.active === true
          })
          if (!ok) throw new Error('room editor did not open')
          await new Promise((r) => setTimeout(r, 3000))
        },
        leave: async () => {
          await page.evaluate(() => window.__store.getState().exitRoomEditor?.())
          await new Promise((r) => setTimeout(r, 1800))
        },
      },
      ...POSES.map((p) => ({ view: `walk-${p.name}`, enter: () => enterWalk(page, p) })),
    ]

    for (const cell of cells) {
      await cell.enter()
      const files = {}
      // Flag OFF first and last: the pair is the NOISE FLOOR for this exact cell.
      await setArm(page, { flag: false, weather: 'clear' })
      files.offA = await shot(page, out, `${tier}__${cell.view}__off-a`)
      for (const c of CONDITIONS) {
        await setArm(page, { flag: true, weather: c })
        files[c] = await shot(page, out, `${tier}__${cell.view}__${c}`)
      }
      await setArm(page, { flag: false, weather: 'clear' })
      files.offB = await shot(page, out, `${tier}__${cell.view}__off-b`)
      await cell.leave?.()

      // ROOM_CROP for the editor, and this is not cosmetic: in the editor the room floats in a
      // large flat backdrop and occupies ~35 % of the frame, so `CROP` measures mostly backdrop.
      // `v0.34.1.13` published a false editor finding on exactly that (saturation 0.038 against
      // 0.059 cropped to the room). `showroom-parity.mjs` documents the trap; this honours it.
      const crop = cell.view === 'editor' ? ROOM_CROP : CROP
      const stat = (f) => metrics(f, crop)
      const animated = ANIMATED[cell.view] ?? []
      const floor = await diff(files.offA, files.offB)
      const floorStill = await diff(files.offA, files.offB, 2, animated)
      const row = {
        tier,
        view: cell.view,
        floor,
        floorStill,
        animated,
        arms: {},
        armsStill: {},
        stats: {},
      }
      for (const c of CONDITIONS) {
        row.arms[c] = await diff(files.offA, files[c])
        row.armsStill[c] = await diff(files.offA, files[c], 2, animated)
        row.stats[c] = await stat(files[c])
      }
      row.stats.off = await stat(files.offA)
      row.crop = crop
      report.push(row)
      console.log(
        `  ${cell.view.padEnd(20)} noise floor ${row.floor.meanAbsDiff} / ${row.floor.pctOver}%  ` +
          CONDITIONS.map((c) => `${c}=${row.arms[c].meanAbsDiff}`).join('  '),
      )
    }
    await page.close()
  }
  await browser.close()

  console.log('\n=== BYTE-IDENTICAL CHECK: flag-on `clear` against the flag-off control ===')
  console.log(
    'cell'.padEnd(30) +
      'floor'.padStart(9) +
      'clear'.padStart(9) +
      ' | '.padStart(4) +
      'floor*'.padStart(9) +
      'clear*'.padStart(9) +
      '   verdict (* = animated object excluded)',
  )
  let worst = 0
  for (const r of report) {
    const f = r.floorStill.meanAbsDiff
    const c = r.armsStill.clear.meanAbsDiff
    worst = Math.max(worst, c - f)
    console.log(
      `${r.tier}/${r.view}`.padEnd(30) +
        `${r.floor.meanAbsDiff}`.padStart(9) +
        `${r.arms.clear.meanAbsDiff}`.padStart(9) +
        ' | '.padStart(4) +
        `${f}`.padStart(9) +
        `${c}`.padStart(9) +
        (c <= f * 1.5 + 0.05 ? '   at the floor' : '   ** ABOVE THE FLOOR **'),
    )
  }
  console.log(
    `\nworst clear-minus-floor (animated excluded) across every cell: ${worst.toFixed(3)}`,
  )

  console.log('\n=== EFFECT: interior statistics per condition (showroom-parity metrics) ===')
  for (const r of report) {
    console.log(`\n${r.tier} / ${r.view}`)
    console.log(
      '  arm'.padEnd(16) +
        'p05'.padStart(8) +
        'p50'.padStart(8) +
        'p95'.padStart(8) +
        'nearWhite'.padStart(11) +
        'sat'.padStart(9) +
        'warmth'.padStart(9) +
        'p50 ratio'.padStart(11),
    )
    const base = r.stats.clear
    for (const c of CONDITIONS) {
      const s = r.stats[c]
      console.log(
        `  ${c}`.padEnd(16) +
          `${s.p05}`.padStart(8) +
          `${s.p50}`.padStart(8) +
          `${s.p95}`.padStart(8) +
          `${s.nearWhite}`.padStart(11) +
          `${s.sat}`.padStart(9) +
          `${s.warmth}`.padStart(9) +
          (base.p50 ? (s.p50 / base.p50).toFixed(3) : '—').padStart(11),
      )
    }
  }
  fs.writeFileSync(path.join(out, 'weather-app.json'), JSON.stringify(report, null, 1))
  console.log(`\nframes + report -> ${out}`)
}
