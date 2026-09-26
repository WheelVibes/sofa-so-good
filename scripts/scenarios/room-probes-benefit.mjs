// R7-AD: does the room-probe RANKING track the probe's VISIBLE benefit?
//
// ONE boot (a two-boot A/B of this app is not attributable), LINEAR (`ssg_linear_view`), with
// `ceilingExposure` and `windowBlowoutAdaptive` pinned off: both ease on wall-clock time, and the
// second drifted the service-yard A/A read by 5.7 counts before it was pinned. Two reads:
//
//  1. CENSUS. Every probe candidate on the live default flat — room, effective roughness (the
//     roughnessMap mean folded in, the way the shader folds it), footprint — dumped as JSON so the
//     ranking can be recomputed offline under any weighting. Read with the probes DETACHED, because
//     `selectProbeMeshes` skips a material that already carries a record.
//  2. BENEFIT. The cap is lifted to every room (`setQualityOverride('roomProbeMaxRooms', 11)`), so
//     every room holds its own probe at once. Then, per room, at four yaws from the room's probe
//     centre (plus the R7-L calibrated poses where they exist), the frame is read A-B-A: every
//     probe on, THAT ROOM's `roomProbeMix` alone at 0, every probe on again — so the difference is
//     that room's probe and nothing else. Something still animates on wall-clock time (the sky
//     through the glazing), so a pixel that moved between the two A reads is excluded and scores 0.
//     Reported as mean |diff| of linear luminance x1000 over the whole frame, the share of pixels
//     that moved by more than 0.5, the A/A floor and the share of the frame that was still.
//
// Run (dev server on 5391):
//   SHOT_GPU=1 SHOT_VIEWPORT=1200,750 SHOT_INIT_LS='{"hdb_onboarded":"1","ssg_linear_view":"1"}' \
//     node scripts/shot.mjs --scenario scripts/scenarios/room-probes-benefit.mjs --out-dir /tmp/r7ad

async function census() {
  const A = await import('/src/scene/lighting/roomProbeAttach.ts')
  const P = await import('/src/scene/lighting/roomProbe.ts')
  const s = window.__store.getState()
  const scene = window.__three.scene
  const planned = P.planRoomProbes(s.floorPlan, s.viewLevelId)
  A.detachAllRoomProbes(scene)
  const picked = A.selectProbeMeshes(scene, planned)
  const rows = picked.map((a) => {
    const m = a.mesh.material
    return {
      room: a.probe.roomId,
      name: a.mesh.name || m.name || m.type,
      r: +A.effectiveRoughness(m).toFixed(4),
      area: +a.footprint.toFixed(4),
    }
  })
  window.__census = rows
  console.log(`[census-json] ${JSON.stringify(rows)}`)
  console.log(
    `[census] shipped ranking: ${A.rankProbeRooms(picked)
      .map(([id, v]) => `${id} ${v.toFixed(2)}`)
      .join(' > ')}`,
  )
}

function liftCap() {
  window.__store.getState().setQualityOverride('roomProbeMaxRooms', 11)
}

function assertAllRooms() {
  const rooms = new Map()
  window.__three.scene.traverse((o) => {
    const m = o.material
    const r = m && !Array.isArray(m) && m.userData?.roomProbeRecord
    if (r && !rooms.has(r.roomId)) rooms.set(r.roomId, r.uniforms.center.value.toArray())
  })
  window.__probeRooms = [...rooms.entries()]
  console.log(`[benefit] ${rooms.size} rooms hold a probe: ${[...rooms.keys()].sort().join(', ')}`)
  if (rooms.size < 7)
    throw new Error(`cap lift did not take: only ${rooms.size} rooms hold a probe`)
}

async function measure() {
  const LUT = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const u = i / 255
    LUT[i] = u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  }
  const t = window.__three
  const gl = t.gl.getContext()
  const read = () => {
    const W = t.gl.domElement.width
    const H = t.gl.domElement.height
    const buf = new Uint8Array(W * H * 4)
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    const lum = new Float32Array(W * H)
    for (let i = 0, j = 0; i < buf.length; i += 4, j++) {
      lum[j] = 1000 * (0.2126 * LUT[buf[i]] + 0.7152 * LUT[buf[i + 1]] + 0.0722 * LUT[buf[i + 2]])
    }
    return lum
  }
  const diff = (a, b) => {
    let sum = 0
    let moved = 0
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i])
      sum += d
      if (d > 0.5) moved++
    }
    return { mean: sum / a.length, moved: (100 * moved) / a.length }
  }
  // The benefit, read only where the scene is STILL. Something in the frame animates on wall-clock
  // time (the sky through the glazing: the A/A floor is worst in the rooms that see the most of it
  // -- living/dining, the service yard, the AC ledge), so a raw |A - B| charges the probe for
  // cloud drift. A pixel that moved between the two A reads is excluded (it scores 0, so the
  // number stays a whole-frame mean and stays conservative); a still pixel is scored against the
  // mean of its two A reads.
  const benefit = (a, b, a2) => {
    let sum = 0
    let moved = 0
    let still = 0
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - a2[i]) > 0.25) continue
      still++
      const d = Math.abs(b[i] - 0.5 * (a[i] + a2[i]))
      sum += d
      if (d > 0.5) moved++
    }
    return {
      mean: sum / a.length,
      moved: (100 * moved) / a.length,
      still: (100 * still) / a.length,
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Pump REAL frames over real time: anything eased (a tau-0.3 s exposure) converges on wall-clock
  // dt, and eight back-to-back advances are ~0 s of it.
  const pump = async (ms) => {
    const end = performance.now() + ms
    while (performance.now() < end) {
      t.advance(performance.now() / 1000, true)
      await sleep(30)
    }
  }
  const pose = async (x, z, yaw, pitch) => {
    const l = window.__walkLook
    l.setPosition(x, z)
    l.setYaw(yaw)
    l.setPitch(pitch)
    await pump(1500)
  }
  const setMix = (room, v) => {
    const seen = new Set()
    t.scene.traverse((o) => {
      const m = o.material
      const r = m && !Array.isArray(m) && m.userData?.roomProbeRecord
      if (r && r.roomId === room && !seen.has(m)) {
        seen.add(m)
        r.uniforms.mix.value = v
      }
    })
    return seen.size
  }
  // R7-L's calibrated walk poses, kept so this run is comparable with its table.
  const EXTRA = {
    kitchen: [
      [8.8, 7.4, 2.05, -0.05],
      [8.8, 7.4, 2.05, -0.6],
    ],
    bath1: [[2.69, 5.3, Math.PI, -0.05]],
    bath2: [[4.3, 5.1, -2.535, -0.05]],
    livingDining: [[10.9, 5.2, 0, -0.05]],
  }
  const out = []
  for (const [room, c] of window.__probeRooms) {
    const poses = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((y) => [c[0], c[2], y, -0.3])
    for (const p of EXTRA[room] ?? []) poses.push(p)
    let sum = 0
    let movedSum = 0
    let floor = 0
    let best = 0
    let mats = 0
    let stillMin = 100
    for (const p of poses) {
      // A-B-A: the second A is read AFTER the flip back, so any drift during the B read shows up
      // as the A/A floor instead of hiding inside the benefit.
      await pose(...p)
      const a = read()
      mats = setMix(room, 0)
      await pump(400)
      const b = read()
      setMix(room, 1)
      await pump(400)
      const a2 = read()
      const d = benefit(a, b, a2)
      floor = Math.max(floor, diff(a, a2).mean)
      stillMin = Math.min(stillMin, d.still)
      sum += d.mean
      movedSum += d.moved
      best = Math.max(best, d.mean)
    }
    const row = {
      room,
      materials: mats,
      poses: poses.length,
      meanAbsDiff: +(sum / poses.length).toFixed(3),
      maxPoseDiff: +best.toFixed(3),
      pctMoved: +(movedSum / poses.length).toFixed(2),
      aaFloor: +floor.toFixed(4),
      stillPctMin: +stillMin.toFixed(1),
    }
    out.push(row)
    console.log(
      `[benefit] ${room}: mean |diff| ${row.meanAbsDiff} (max pose ${row.maxPoseDiff}) linear x1000, ` +
        `${row.pctMoved}% px moved >0.5, A/A ${row.aaFloor} (${row.stillPctMin}% still), ${mats} materials, ${poses.length} poses`,
    )
  }
  out.sort((p, q) => q.meanAbsDiff - p.meanAbsDiff)
  console.log(`[benefit-json] ${JSON.stringify(out)}`)
  console.log(
    `[benefit] order by measured benefit: ${out.map((r) => `${r.room} ${r.meanAbsDiff}`).join(' > ')}`,
  )
  for (const r of out) {
    if (r.stillPctMin < 50)
      throw new Error(
        `${r.room}: under 50% of the frame is still (${r.stillPctMin}%), no verdict possible`,
      )
  }
}

const call = (fn) => `(${fn.toString()})()`

export default {
  name: 'room-probes-benefit',
  description:
    'R7-AD: one-boot, linear, per-room probe on/off with every room holding a probe, plus the candidate census, so the probe ranking can be checked against measured visible benefit.',
  url: 'http://localhost:5391/?ff=roomProbes:on,ceilingExposure:off,windowBlowoutAdaptive:off',
  allowPageErrors: true,
  steps: [
    { name: 'store-ready', waitFor: { storeExists: true }, timeout: 60000 },
    { name: 'boot-splash-gone', waitFor: { css: '#boot-loader', visible: false }, timeout: 60000 },
    {
      name: 'setup',
      eval: "(() => { try { localStorage.setItem('hdb_onboarded','1') } catch {}; const s = window.__store.getState(); s.endTour?.(); s.setOnboardingOpen?.(false); s.dismissLocationPrompt?.(); s.dismissChecklist?.(); s.setTimeMode?.('manual'); s.setManualHour?.(13); s.setLightsMode?.('off'); s.setQualityTier?.('realistic'); s.setDeviceClass?.('capable'); s.hideLoading?.() })()",
    },
    { name: 'scene-ready', waitFor: { store: 'state.sceneReady === true' }, timeout: 120000 },
    {
      name: 'pin-device-class',
      eval: "(() => { const s = window.__store; s.getState().setDeviceClass('capable'); s.setState({ setDeviceClass: () => {} }) })()",
    },
    { name: 'settle-boot', wait: 9000 },
    {
      name: 'assert-linear-view',
      eval: "(() => { if (localStorage.getItem('ssg_linear_view') !== '1') throw new Error('ssg_linear_view is not set - re-run with SHOT_INIT_LS') })()",
    },
    { name: 'census', eval: call(census) },
    { name: 'lift-cap', eval: call(liftCap) },
    { name: 'settle-capture', wait: 9000 },
    { name: 'enter-walk', eval: "window.__store.getState().setCameraMode('firstPerson')" },
    {
      name: 'walk-active',
      waitFor: { store: "state.cameraMode === 'firstPerson'" },
      timeout: 20000,
    },
    {
      name: 'walk-splash-gone',
      waitFor: { css: '[data-transition-overlay]', visible: false },
      timeout: 60000,
    },
    {
      name: 'hide-hud',
      eval: "(() => { const s = window.__store.getState(); s.hideLoading?.(); s.dismissCallout?.('walk-mode'); s.dismissCallout?.('walk-move'); s.dismissChecklist?.() })()",
    },
    { name: 'settle-walk', wait: 5000 },
    { name: 'assert-all-rooms', eval: call(assertAllRooms) },
    { name: 'measure', eval: call(measure) },
  ],
}
