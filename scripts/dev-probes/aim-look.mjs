/**
 * Point the walk camera at ONE named thing and shoot it.
 *
 * `walk-tour.mjs` stands at each room centre and sweeps four cardinal yaws with a fixed −0.05
 * pitch. That is the right instrument for a survey and the wrong one for a specific claim: item
 * `(g)`'s symptom is what you see LEANING OVER the mezzanine rail, and no cardinal yaw at eye
 * level with a level pitch ever frames it — three tours of `tpl-loft` came back with windows and
 * walls instead. This takes explicit poses so a defect can be aimed at rather than stumbled upon.
 *
 * POSES is `label:x,z,yawRad,pitchRad` entries separated by `;`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const OUT = process.env.OUT || '/tmp/aim-look'
const PLAN = process.env.PLAN || ''
const LEVEL = process.env.LEVEL || ''
const FURNISH = process.env.FURNISH === '1'
const TIER = process.env.TIER || 'realistic'
const HOUR = Number(process.env.HOUR || 13)
/**
 * MODE=orbit takes `label:x,y,z,tx,ty,tz` — camera position and orbit target — instead of the
 * first-person `label:x,z,yaw,pitch`. Added because two shipped envelope fixes (`(w)`, `(x)`) are
 * only visible from OUTSIDE the building, and there was no probe here that could stand outside it:
 * every still probe in this arc either walks or frames a room interior. The dollhouse is also the
 * view the product leads with, so "it looks right in walk" is not the whole claim.
 */
const MODE = process.env.MODE || 'walk'
const POSES = (
  process.env.POSES || (MODE === 'orbit' ? 'iso:14,10,16,4,1.5,3' : 'rail:5.55,4.7,0,-0.6')
)
  .split(';')
  .map((s) => {
    const [label, rest] = s.split(':')
    const n = rest.split(',').map(Number)
    return MODE === 'orbit'
      ? { label, pos: n.slice(0, 3), target: n.slice(3, 6) }
      : { label, x: n[0], z: n[1], yaw: n[2], pitch: n[3] }
  })

mkdirSync(OUT, { recursive: true })
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
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
// BEFORE load, or the welcome modal blurs the whole scene and every frame is a survey of
// the onboarding card (it did exactly that on the first run).
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(appUrl(), { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__store, { timeout: 60000 })
await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
// `LocationPrompt` surfaces once onboarding is gone and blurs the scene just as thoroughly.
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 2500))

if (PLAN) {
  const swapped = await page.evaluate(
    async ({ id, furnish }) => {
      const { PLAN_TEMPLATES } = await import('/src/floorplan/templates.ts')
      const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
      if (!tpl) return null
      const st = window.__store.getState()
      st.replaceFloorPlan(structuredClone(tpl), { furniture: furnish ? 'clear' : 'rehome' })
      if (furnish) st.applyLayoutPreset('move-in')
      return tpl.name
    },
    { id: PLAN, furnish: FURNISH },
  )
  if (!swapped) throw new Error(`PLAN template not found: ${PLAN}`)
  await new Promise((r) => setTimeout(r, 2500))
  console.log(`plan -> ${swapped} (${PLAN})`)
}
if (LEVEL) {
  await page.evaluate((id) => window.__store.getState().setViewLevel(id), LEVEL)
  await new Promise((r) => setTimeout(r, 1200))
}
if (MODE === 'orbit') {
  await page.evaluate(() => window.__store.getState().setCameraMode('orbit'))
} else {
  await page.evaluate(() => {
    const st = window.__store.getState()
    st.setCameraMode('firstPerson')
    st.dismissCallout?.('walk-mode')
  })
  await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
}
await new Promise((r) => setTimeout(r, 3000))

// GI=off DETACHES every visibility lightmap from the live scene — a true one-variable control on
// the SAME frame, rather than a second boot with a flag flipped. `detachAllVisibilityLightmaps`
// also restores the shared original where a clone stood in, so the arm differs in the GI term and
// nothing else. It REPORTS the count it detached, because "GI off" that detached zero maps is a
// broken control that looks like a null result.
// LIGHTS=off switches every placed lamp off, so a DAYLIGHT-ONLY frame can be compared with a
// Cycles reference (which has no lamps). Same mechanism as `walk-tour.mjs`, and it likewise
// REPORTS what it flipped: this probe previously ACCEPTED `LIGHTS=off` and silently ignored it,
// so `v0.31.7.214` published two arms labelled "21:00 lamps off" that were rendered with the
// lamps ON. The resolved line printed `realistic/on/manual21` at the time and I read it as a
// label rather than as the state it is.
// EXPOSURE=<n> sets the USER exposure (`st.exposure`), which `Lighting` folds into
// `gl.toneMappingExposure` alongside the day grade. Added to isolate one question: the app reads
// 1.38x brighter than a Cycles reference (`v0.31.7.218`) and `toneMappingExposure` is also 1.38.
// If exposure is purely a display transform, then inverting a byte with a curve measured at the
// SAME exposure must give the same scene radiance whatever the exposure is. If the inverted value
// moves with it, the grade is being applied twice.
if (process.env.EXPOSURE) {
  await page.evaluate((e) => window.__store.getState().setExposure(e), Number(process.env.EXPOSURE))
  await new Promise((r) => setTimeout(r, 1500))
}
if (process.env.LIGHTS === 'off') {
  const flipped = await page.evaluate(() => {
    const st = window.__store.getState()
    const on = st.items.filter((it) => it.props?.lightOn !== 'no').map((it) => it.id)
    let k = 0
    for (const id of on) {
      st.toggleLightPower(id)
      if (window.__store.getState().items.find((it) => it.id === id)?.props?.lightOn === 'no') k++
    }
    return { candidates: on.length, flipped: k }
  })
  console.log(`LIGHTS=off  flipped ${flipped.flipped} of ${flipped.candidates} candidates`)
  await new Promise((r) => setTimeout(r, 1500))
}
// SHADOW=<nocast|nb0|map4096> mutates the sun's shadow so a leak can be tested. Applied HERE, in
// the probe whose resolved line reports `sun[...]` — `v0.31.7.259` ran this sweep in a throwaway
// that self-reported `castShadow: false` in every arm including the baseline, which could not be
// reproduced and made its null result worthless. Now the arm and the state it produced are printed
// together, so an arm that failed to apply is visible instead of inferred.
if (process.env.SHADOW) {
  const applied = await page.evaluate((mode) => {
    const out = []
    window.__three.scene.traverse((o) => {
      if (!o.isDirectionalLight) return
      if (mode === 'nocast') o.castShadow = false
      if (mode === 'nb0') o.shadow.normalBias = 0
      if (mode === 'map4096') {
        o.shadow.mapSize.set(4096, 4096)
        o.shadow.map?.dispose()
        o.shadow.map = null
      }
      o.shadow.needsUpdate = true
      out.push(`cast${o.castShadow ? 1 : 0}/nb${o.shadow.normalBias}/map${o.shadow.mapSize.x}`)
    })
    window.__three.invalidate?.()
    return out
  }, process.env.SHADOW)
  console.log(`SHADOW=${process.env.SHADOW}  -> ${applied.join(' | ')}`)
  await new Promise((r) => setTimeout(r, 2000))
}
if (process.env.GI === 'off') {
  const n = await page.evaluate(async () => {
    const { detachAllVisibilityLightmaps } = await import('/src/scene/applyVisibilityLightmaps.ts')
    return detachAllVisibilityLightmaps(window.__three.scene)
  })
  console.log(`GI=off  detached ${n} visibility lightmaps`)
  await new Promise((r) => setTimeout(r, 1500))
}

const resolved = await page.evaluate(() => {
  const st = window.__store.getState()
  // Exposure is part of the STATE a byte means: `Lighting` writes `gl.toneMappingExposure` every
  // frame from the day ramp, so two runs at the same hour can still be graded differently. A
  // calibration curve measured under one exposure cannot invert a byte measured under another.
  const e = window.__three?.gl?.toneMappingExposure
  // SUN STATE too. `v0.31.7.259`: a sweep of shadow parameters at 17:00 moved the measured wall by
  // 0.0 counts in every arm AND reported the sun's `castShadow` as FALSE — including the untouched
  // baseline. A follow-up read it as TRUE in orbit, in walk, through a teleport and after
  // `LIGHTS=off`, so that false could not be reproduced. Either way the lesson is `.217`'s: a byte
  // means nothing without the state it was rendered under, and "were the sun's shadows even on"
  // is exactly the kind of state that was being inferred rather than recorded.
  let sun = 'none'
  window.__three?.scene?.traverse?.((o) => {
    if (o.isDirectionalLight) {
      sun = `i${o.intensity.toFixed(3)}/cast${o.castShadow ? 1 : 0}/map${o.shadow?.mapSize?.x ?? '?'}`
    }
  })
  const shadowsOn = window.__three?.gl?.shadowMap?.enabled ? 1 : 0
  return `${st.qualityTier}/${st.lightsMode}/${st.timeMode}${st.manualHour}/exp${e?.toFixed?.(4) ?? e}/sun[${sun}]/shadowMap${shadowsOn}`
})
console.log(`resolved ${resolved}   level ${LEVEL || '(ground)'}`)

for (const p of POSES) {
  if (MODE === 'orbit') {
    // Set the camera AND the orbit target, then `controls.update()` — dragging headless is
    // unreliable, which is why `DevCameraExpose` exists at all. `invalidate()` because the
    // renderer is on `frameloop="demand"` and would otherwise screenshot a stale composite.
    await page.evaluate((q) => {
      const { camera, controls, invalidate } = window.__three
      camera.position.set(q.pos[0], q.pos[1], q.pos[2])
      controls?.target?.set(q.target[0], q.target[1], q.target[2])
      camera.lookAt(q.target[0], q.target[1], q.target[2])
      controls?.update?.()
      invalidate?.()
    }, p)
    await new Promise((r) => setTimeout(r, 1800))
  } else {
    await page.evaluate(async (q) => {
      const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
      requestWalkTeleport(q.x, q.z, q.yaw)
    }, p)
    await new Promise((r) => setTimeout(r, 1500))
    // Pitch AFTER the teleport settles, and READ IT BACK. Setting it in the same tick gave two
    // frames that were pixel-identical at -0.7 and -0.25 — the teleport resets the look, so the
    // requested pitch never reached the camera and the probe reported a pose it did not shoot.
  }
  let pitch = null
  if (MODE !== 'orbit') {
    pitch = await page.evaluate((q) => {
      window.__walkLook?.setPitch(q.pitch)
      return window.__walkLook?.getPitch?.() ?? null
    }, p)
    await new Promise((r) => setTimeout(r, 1200))
  }
  await assertSceneAlive(page, p.label)
  const where = await page.evaluate(() => {
    const c = window.__three.camera
    return [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(2))
  })
  // What is the middle of the frame ACTUALLY looking at, and which STOREY does it belong to?
  // "Sky" and "a wall lit to sky luma" are indistinguishable in a screenshot, and item `(g)`
  // turns on exactly which one it is. Raycaster classes come off objects three itself made —
  // the page cannot resolve a bare `three` specifier (the established idiom in this arc).
  const hit = await page.evaluate(() => {
    const { scene, camera } = window.__three
    const rc = new window.__three.raycaster.constructor()
    const V3 = camera.position.constructor
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const dir = new V3(-e[8], -e[9], -e[10]).normalize()
    rc.set(new V3(e[12], e[13], e[14]), dir)
    const all = rc.intersectObjects(scene.children, true).filter((h) => {
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material
      return h.object.visible && m && m.transparent !== true && m.opacity !== 0
    })
    const h = all[0]
    if (!h) return null
    // Walk UP for a furniture tag, and report the hit height — which storey it sits on is
    // the whole question here.
    let itemId = null
    let o = h.object
    while (o && !itemId) {
      itemId = o.userData?.itemId ?? null
      o = o.parent
    }
    const it = itemId ? window.__store.getState().items.find((i) => i.id === itemId) : null
    return {
      dist: +h.distance.toFixed(2),
      y: +h.point.y.toFixed(2),
      z: +h.point.z.toFixed(2),
      name: h.object.name || h.object.type,
      defId: it?.defId ?? null,
      itemLevel: it?.levelId ?? (it ? 'ground' : null),
    }
  })
  console.log(
    hit
      ? `    centre ray -> ${hit.defId ? `${hit.defId} (level ${hit.itemLevel})` : hit.name} at ${hit.dist} m, y=${hit.y}, z=${hit.z}`
      : '    centre ray -> NOTHING (sky)',
  )
  const file = `${OUT}/${p.label}.png`
  writeFileSync(file, await page.screenshot({ type: 'png' }))
  console.log(
    `  ${p.label.padEnd(14)} eye [${where.join(', ')}]  ${MODE === 'orbit' ? 'orbit' : `pitch req ${p.pitch} got ${pitch}`}  -> ${file}`,
  )
}
await browser.close()
