/**
 * ORBIT-RESIZE-ROTATE — what the first orbit drag AFTER a phone orientation swap
 * actually does to the camera, event by event.
 *
 * Finding R2 (`docs/audit/interaction-sweep-2026-09-19.md`): on
 * `orbit-phone-orientation-mid-gesture` the camera TELEPORTS at the first touch-move of
 * the drag that starts in landscape — `clip.poses` shows the azimuth moving 0.033 rad on
 * a typical portrait tick and **1.31 rad on that one tick**, with the polar angle
 * slamming to `maxPolarAngle` in the same frame, at an unchanged orbit radius and an
 * unchanged pivot. The audit could not disambiguate its two hypotheses from recorded
 * poses alone:
 *   (a) the drag's screen->rotation delta is computed against STALE pointer state (so one
 *       move carries the distance from wherever the PREVIOUS drag ended), or
 *   (b) OrbitControls normalises rotation by `domElement.clientHeight`, which a
 *       390x844 -> 844x390 swap halves, so the same pixel drag rotates 2.16x further.
 *
 * Those predict very different numbers — (b) predicts 2.16x a normal tick, (a) predicts
 * tens of times it — so this probe logs, per pointer event reaching the canvas: the
 * event's own `pageX/pageY` (what three-stdlib's `handleTouchMoveRotate` reads), the live
 * `clientHeight`, and the azimuth/polar either side of it. The ratio against a control
 * drag taken in the SAME orientation with no resize in between is the discriminator.
 *
 * Usage:  URL=http://localhost:5201/ node scripts/dev-probes/orbit-resize-rotate.mjs
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STEPS = Number(process.env.STEPS || 14)
const GAP = Number(process.env.GAP || 24)

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    `--use-angle=${process.env.ANGLE || 'metal'}`,
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
  ],
})
try {
  const page = await browser.newPage()
  const client = await page.createCDPSession()
  await page.emulateTimezone('Asia/Singapore')
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('hdb_onboarded', '1')
      localStorage.setItem('sofa.helpHint.dismissed', '1')
    } catch {}
  })
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.waitForFunction(() => !!window.__store, { timeout: 30000 })
  await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
  await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 120000 })
  await page.evaluate(() => {
    const st = window.__store.getState()
    st.setTimeMode('manual')
    st.setManualHour(12)
    st.setQualityTier('realistic')
    st.setDeviceClass('weak')
    window.__store.setState({ setDeviceClass: () => {} })
  })
  await page.waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 90000 })
  await sleep(2500)
  await assertSceneAlive(page, 'orbit-resize-rotate boot')

  // Capture-phase listeners on the canvas, so we see every pointer event BEFORE
  // OrbitControls' own document-level `pointermove` handler acts on it, plus the
  // camera state it produced by the time the next one arrives.
  await page.evaluate(() => {
    const dom = window.__three.gl.domElement
    window.__evt = []
    const snap = (type, e) => {
      const c = window.__three.controls
      window.__evt.push({
        type,
        t: Math.round(performance.now()),
        pageX: e.pageX,
        pageY: e.pageY,
        clientX: e.clientX,
        clientY: e.clientY,
        ch: dom.clientHeight,
        cw: dom.clientWidth,
        az: c ? +c.getAzimuthalAngle().toFixed(4) : null,
        pol: c ? +c.getPolarAngle().toFixed(4) : null,
      })
    }
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
      dom.addEventListener(t, (e) => snap(t, e), { capture: true, passive: true })
    // `enabled` is what decides whether OrbitControls even records a pointer-down, so
    // record it alongside — a drag whose DOWN was swallowed by `enabled === false` and
    // whose MOVES were not is exactly hypothesis (a)'s mechanism.
    window.__ctlEnabled = () => window.__three.controls?.enabled ?? null
  })

  const touch = async (type, x, y) =>
    client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }],
    })
  const drag = async (from, to) => {
    await touch('touchStart', from[0], from[1])
    for (let i = 1; i <= STEPS; i++) {
      const k = i / STEPS
      await touch('touchMove', from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k)
      await sleep(GAP)
    }
    await touch('touchEnd', to[0], to[1])
  }

  const report = async (label) => {
    const evts = await page.evaluate(() => {
      const e = window.__evt
      window.__evt = []
      return e
    })
    const moves = evts.filter((e) => e.type === 'pointermove')
    const wrap = (d) => {
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      return d
    }
    const steps = []
    for (let i = 1; i < moves.length; i++) {
      steps.push({
        dPageY: moves[i].pageY - moves[i - 1].pageY,
        dPageX: moves[i].pageX - moves[i - 1].pageX,
        dAz: +wrap(moves[i].az - moves[i - 1].az).toFixed(4),
        dPol: +(moves[i].pol - moves[i - 1].pol).toFixed(4),
        ch: moves[i].ch,
      })
    }
    const first = steps[0]
    const rest = steps.slice(1)
    const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0)
    const medAz = median(rest.map((s) => Math.abs(s.dAz)))
    console.log(
      `\n[${label}] clientHeight=${moves[0]?.ch} moves=${moves.length} ` +
        `firstMove |dAz|=${first ? Math.abs(first.dAz).toFixed(4) : 'n/a'} ` +
        `medianLater |dAz|=${medAz.toFixed(4)} ratio=${medAz ? (Math.abs(first.dAz) / medAz).toFixed(2) : 'n/a'}x ` +
        `down=${evts.filter((e) => e.type === 'pointerdown').length} ` +
        `up=${evts.filter((e) => e.type === 'pointerup').length}`,
    )
    console.log(
      `  steps: ${steps
        .slice(0, 6)
        .map((s) => `dPage(${s.dPageX},${s.dPageY})->dAz ${s.dAz}`)
        .join(' | ')}`,
    )
    return { first: first ? Math.abs(first.dAz) : 0, med: medAz }
  }

  console.log(`controls.enabled = ${await page.evaluate(() => window.__ctlEnabled())}`)

  // 1. Control drag, portrait, no resize anywhere near it.
  await drag([195, 500], [195 + 160, 500])
  await sleep(600)
  const portraitA = await report('portrait control drag')

  // 2. Second control drag, still portrait, same geometry — proves a fresh drag after a
  //    previous one does NOT carry the previous drag's end position.
  await sleep(700)
  await drag([120, 400], [120 + 160, 400])
  await sleep(600)
  await report('portrait control drag #2 (no resize between)')

  // 3. The real case: swap to landscape, wait, then the same 160 px drag.
  await page.setViewport({
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await sleep(700)
  await page.evaluate(() => {
    window.__evt = []
  })
  console.log(`after swap: controls.enabled = ${await page.evaluate(() => window.__ctlEnabled())}`)
  await drag([300, 200], [300 + 160, 200])
  await sleep(600)
  const landscape = await report('landscape drag, 700ms after the orientation swap')

  // 4. A SECOND landscape drag, no resize in between — isolates "landscape rotates
  //    2.16x faster" (which persists) from "the FIRST drag after a resize teleports"
  //    (which does not).
  await sleep(700)
  await drag([300, 250], [300 + 160, 250])
  await sleep(600)
  const landscapeB = await report('landscape drag #2 (no resize between)')

  console.log(
    `\nSUMMARY portraitMedian=${portraitA.med.toFixed(4)} ` +
      `landscapeMedian=${landscapeB.med.toFixed(4)} ` +
      `(height-normalisation predicts ${(844 / 390).toFixed(2)}x, measured ` +
      `${portraitA.med ? (landscapeB.med / portraitA.med).toFixed(2) : 'n/a'}x)\n` +
      `post-resize FIRST move |dAz| = ${landscape.first.toFixed(4)} vs a normal landscape ` +
      `tick ${landscapeB.med.toFixed(4)} (${landscapeB.med ? (landscape.first / landscapeB.med).toFixed(1) : 'n/a'}x)`,
  )
} finally {
  await browser.close()
}
