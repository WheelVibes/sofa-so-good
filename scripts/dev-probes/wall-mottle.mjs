/**
 * WALL-MOTTLE — why does the flat's LARGEST surface read as damp concrete?
 *
 * The `.55` coverage census put walls at ~45% of the walk view, and the biggest
 * single class (`#f5f5f0`, ~31.5%, normalMap + roughnessMap, NO albedo map)
 * renders as broad soft grey blotches at roughly 20-40 cm scale rather than as
 * painted plaster. WALL-DETAIL already settled that the NORMAL is the wall's
 * responsive channel and that adding an albedo texture buys a tint, not detail
 * (meta-rule xvii-b), so this probe does not re-sweep those. It asks a different
 * question: WHERE DOES THE BLOTCHING COME FROM?
 *
 * Four falsifiable sources, one variable each, all against the same pose:
 *   base       the shipped state (meta-rule xxiv / xlvii)
 *   ao-off     `setQualityOverride('ao', false)`. Medium runs N8AO at
 *              aoRadius 0.7 m, intensity 3.0, HALF-RES — a decimetre-scale
 *              radius on a flat wall is exactly the size of the blotches, and
 *              this source was not in the original hypothesis list at all.
 *   normal-off the wall's normalMap removed
 *   rough-off  the wall's roughnessMap removed
 *
 * It also prints each bound texture's IMAGE DIMENSIONS, which settles the
 * stale-bake hypothesis outright: PERF-C bakes a 64-square preview before the
 * worker hot-swaps the real map, and a class that never swapped would render
 * exactly this kind of soft blob.
 *
 * Every arm prints its own resolved state beside its number (meta-rule iv), and
 * every arm writes both a full frame and a CROP of the wall (meta-rule xxviii).
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const OUT = process.env.OUT || '/tmp/wall-mottle'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  // `runCostBreakdown` is ONE long `evaluate` call, and the paired baseline
  // (PROFILER-PAIRED-BASELINE) roughly doubles its length — past puppeteer's
  // 180 s default `protocolTimeout`, which kills the run mid-sweep with a
  // ProtocolError that looks like a page crash but is only the CDP deadline.
  protocolTimeout: 900_000,
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
// BOOT AS THE DEVICE UNDER TEST. `quality.ts` reads device capabilities ONCE at boot,
// so anything emulated after `goto` is invisible to the veto: an earlier version of this
// probe booted at 1280x800 and only switched to phone viewports later, which showed the
// detector a desktop every time and made the phone veto look broken when it had simply
// never been asked. Set metrics, touch and the pointer media feature BEFORE load.
if (process.env.BOOT_PHONE === '1') {
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
} else {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
}
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
// `quality.ts:readDeviceCapabilities` reads `matchMedia('(pointer: coarse)')`, and
// puppeteer's `setViewport({ isMobile, hasTouch })` does NOT set that media feature —
// so without this a "phone" probe reports a fine pointer and the phone veto in
// `capabilityCeilingTier` never fires, making the ladder look broken when it is the
// harness that is lying. Must be set BEFORE load: capabilities are read once at boot.
if (process.env.COARSE === '1') {
  // Straight to CDP: puppeteer's `emulateMediaFeatures` allowlist rejects `pointer`
  // ("Unsupported media feature"), but the protocol itself supports it, and this is
  // real media emulation rather than a `matchMedia` shim. Sent AFTER the device-metrics
  // override above, which otherwise resets emulated media, and before `goto`.
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'any-pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  })
}
await page.goto(appUrl(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
// Pin the clock BEFORE anything else — `setManualHour` also flips `timeMode`, so
// using it as a bare redraw nudge later would straddle day and night.
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
await assertSceneAlive(page, 'after setup')

const TIER = process.env.TIER || 'medium'

await page.evaluate((t) => window.__store.getState().setQualityTier(t), TIER)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60000 })
  .catch(() => {})
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => {
  const st = window.__store.getState()
  st.setCameraMode('firstPerson')
  st.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000))

// OVERRIDE=key=value[,key=value] — apply single `qualityOverrides` entries on top
// of TIER, so a tier-linked defect can be attributed to ONE SETTING rather than to
// the tier as a whole. Prints the resolved value it actually set.
if (process.env.OVERRIDE) {
  for (const pair of process.env.OVERRIDE.split(',')) {
    const [k, v] = pair.split('=')
    await page.evaluate(
      (a) =>
        window.__store
          .getState()
          .setQualityOverride(a.k, a.v === 'true' ? true : a.v === 'false' ? false : Number(a.v)),
      { k, v },
    )
  }
  await new Promise((r) => setTimeout(r, 3500))
  const live = await page.evaluate(async () => {
    const { resolveQuality } = await import('/src/scene/quality.ts')
    const st = window.__store.getState()
    return JSON.stringify(resolveQuality(st.qualityTier, st.qualityOverrides))
  })
  console.log(`OVERRIDE ${process.env.OVERRIDE} -> resolved ${live}\n`)
}

const ROOM = process.env.ROOM || 'livingDining'
const DSF = 2
const GX = 96
const GY = 60

// Stand where the coverage census stood, at the yaw whose frame showed the
// blotching. Derived from the app's own shell centre, not eyeballed (rule xii).
const pose = await page.evaluate(async (roomId) => {
  const { getRoomEditorShell } = await import('/src/scene/roomEditorShell.ts')
  const shell = getRoomEditorShell(window.__store.getState().floorPlan, roomId)?.shell
  return shell?.center ? [shell.center[0], shell.center[1]] : null
}, ROOM)
if (!pose) throw new Error(`no shell centre for room '${ROOM}'`)
await page.evaluate(
  async (q) => {
    const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
    requestWalkTeleport(q.x, q.z, 0)
  },
  { x: pose[0], z: pose[1] },
)
await new Promise((r) => setTimeout(r, 1500))

// Seed from the LARGEST vertical class in view rather than an eyeballed NDC
// point — an eyeballed point has silently missed its target here before.
const seed = await page.evaluate(
  (g) => {
    const { scene, camera } = window.__three
    const rc = new window.__three.raycaster.constructor()
    const n = new camera.position.constructor()
    const acc = new Map()
    for (let iy = 0; iy < g.GY; iy++) {
      for (let ix = 0; ix < g.GX; ix++) {
        rc.setFromCamera({ x: ((ix + 0.5) / g.GX) * 2 - 1, y: 1 - ((iy + 0.5) / g.GY) * 2 }, camera)
        const r = rc.intersectObjects(scene.children, true)
        const h = r.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
        if (!h?.object.material) continue
        n.copy(h.face?.normal ?? { x: 0, y: 1, z: 0 }).transformDirection(h.object.matrixWorld)
        if (Math.abs(n.y) > 0.7) continue
        const m = h.object.material
        const key = m.uuid
        const e = acc.get(key) ?? { m, n: 0, cells: [] }
        e.n++
        e.cells.push(iy * g.GX + ix)
        acc.set(key, e)
      }
    }
    const best = [...acc.values()].sort((a, b) => b.n - a.n)[0]
    if (!best) return null
    const m = best.m
    // The mask is every material sharing this one's normalMap SOURCE — three
    // clones the shared tile per wall segment, so material uuid alone would
    // measure one segment instead of the class.
    const srcOf = (t) => t?.source?.uuid ?? t?.image?.src ?? null
    const src = srcOf(m.normalMap) ?? srcOf(m.roughnessMap) ?? m.uuid
    const mats = []
    scene.traverse((o) => {
      const mm = o.material
      if (!mm || Array.isArray(mm)) return
      if ((srcOf(mm.normalMap) ?? srcOf(mm.roughnessMap) ?? mm.uuid) === src) mats.push(mm)
    })
    window.__wallMats = mats
    window.__wallSaved = mats.map((mm) => ({
      normalMap: mm.normalMap,
      roughnessMap: mm.roughnessMap,
    }))
    const mask = new Array(g.GX * g.GY).fill(false)
    for (const e of acc.values()) {
      if ((srcOf(e.m.normalMap) ?? srcOf(e.m.roughnessMap) ?? e.m.uuid) !== src) continue
      for (const c of e.cells) mask[c] = true
    }
    const tex = (t) =>
      !t
        ? '—'
        : `${t.image?.width ?? '?'}x${t.image?.height ?? '?'} repeat=${t.repeat?.x?.toFixed(2)},${t.repeat?.y?.toFixed(2)}`
    return {
      mask,
      n: mask.filter(Boolean).length,
      mats: mats.length,
      type: m.type,
      hex: `#${m.color?.getHexString?.() ?? '??'}`,
      rough: m.roughness,
      metal: m.metalness,
      normalScale: m.normalScale ? `${m.normalScale.x.toFixed(2)}` : '—',
      map: tex(m.map),
      normalMap: tex(m.normalMap),
      roughnessMap: tex(m.roughnessMap),
      aoMap: tex(m.aoMap),
    }
  },
  { GX, GY },
)
if (!seed) throw new Error('no vertical surface found at this pose')

const W = 1280 * DSF
const H = 800 * DSF
const CW = W / GX
const CH = H / GY
const BW = Math.max(1, Math.floor(CW * 0.5))
const BH = Math.max(1, Math.floor(CH * 0.5))

async function measure(tag) {
  const buf = await page.screenshot({ type: 'png' })
  fs.writeFileSync(`${OUT}/${tag}.png`, buf)
  // CROP the wall (meta-rule xxviii) — the tightest box around the masked cells,
  // upscaled so the blotch scale is legible without a viewer.
  let x0 = GX
  let y0 = GY
  let x1 = 0
  let y1 = 0
  for (let i = 0; i < seed.mask.length; i++) {
    if (!seed.mask[i]) continue
    const cx = i % GX
    const cy = (i / GX) | 0
    if (cx < x0) x0 = cx
    if (cx > x1) x1 = cx
    if (cy < y0) y0 = cy
    if (cy > y1) y1 = cy
  }
  const left = Math.round(x0 * CW)
  const top = Math.round(y0 * CH)
  const cw = Math.max(64, Math.min(W - left, Math.round((x1 - x0 + 1) * CW)))
  const ch = Math.max(64, Math.min(H - top, Math.round((y1 - y0 + 1) * CH)))
  await sharp(buf)
    .extract({ left, top, width: cw, height: ch })
    .resize(900, null, { kernel: 'nearest' })
    .toFile(`${OUT}/${tag}-crop.png`)

  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  let lSum = 0
  let lSq = 0
  let cells = 0
  let step = 0
  let steps = 0
  const vals = []
  for (let iy = 0; iy < GY; iy++) {
    for (let ix = 0; ix < GX; ix++) {
      if (!seed.mask[iy * GX + ix]) continue
      const sx = Math.round(ix * CW + (CW - BW) / 2)
      const sy = Math.round(iy * CH + (CH - BH) / 2)
      let l = 0
      let n = 0
      for (let y = sy; y < sy + BH; y++) {
        for (let x = sx; x < sx + BW; x++) {
          const i = (y * info.width + x) * 3
          l += lum(i)
          n++
          if (x < sx + BW - 1) {
            step += Math.abs(lum(i + 3) - lum(i))
            steps++
          }
        }
      }
      l /= n
      vals.push(l)
      lSum += l
      lSq += l * l
      cells++
    }
  }
  const mean = lSum / cells
  // Grounding guard: AO's JOB is to darken corners and contact points. p50-p5 is
  // how much deeper the darkest masked cells sit than the typical one, so a
  // change that flattens the blotches WITHOUT collapsing this is safe, and one
  // that kills both has just turned AO off by another name.
  vals.sort((a, b) => a - b)
  const q = (f) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))]
  return {
    mean,
    sd: Math.sqrt(Math.max(0, lSq / cells - mean * mean)),
    micro: step / steps,
    ground: q(0.5) - q(0.05),
  }
}

// Each arm reports its OWN resolved state beside its number (meta-rule iv).
async function state() {
  return page.evaluate(async () => {
    const { resolveQuality } = await import('/src/scene/quality.ts')
    const st = window.__store.getState()
    const q = resolveQuality(st.qualityTier, st.qualityOverrides)
    const m = window.__wallMats?.[0]
    return {
      ao: q.ao,
      tier: st.qualityTier,
      nrm: m?.normalMap ? 'y' : '.',
      rgh: m?.roughnessMap ? 'y' : '.',
    }
  })
}

console.log(`room=${ROOM} tier=${TIER} hour=${HOUR} mode=walk`)
console.log(
  `seed: ${seed.type} ${seed.hex} rough=${seed.rough} metal=${seed.metal} normalScale=${seed.normalScale}`,
)
console.log(`  map          ${seed.map}`)
console.log(`  normalMap    ${seed.normalMap}`)
console.log(`  roughnessMap ${seed.roughnessMap}`)
console.log(`  aoMap        ${seed.aoMap}`)
console.log(
  `  ${seed.mats} materials share this class; mask covers ${seed.n}/${GX * GY} cells (${((100 * seed.n) / (GX * GY)).toFixed(1)}%)\n`,
)

const rows = []
const run = async (tag) => {
  const s = await state()
  rows.push([tag, s, await measure(tag)])
}

// SWEEP mode: vary the N8AO tuning ITSELF, one parameter at a time.
// `look.ts` exports `AO` as a plain object (`as const` is TS-only, not a freeze),
// so the live module binding can be mutated; the effect only re-reads it when
// `EffectsImpl` re-renders, which toggling the `ao` quality flag forces. Without
// that toggle the mutation lands in the module and NOTHING changes on screen —
// the classic "the A/B compared an object with itself" failure.
const SWEEP = (process.env.SWEEP || '')
  .split(';')
  .filter(Boolean)
  .map((a) => a.split(',').map((kv) => kv.split('=')))

async function applyAo(pairs) {
  await page.evaluate(async (ps) => {
    const { AO } = await import('/src/scene/look.ts')
    for (const [k, v] of ps) AO[k] = Number(v)
    const st = window.__store.getState()
    st.setQualityOverride('ao', false)
  }, pairs)
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate(() => window.__store.getState().setQualityOverride('ao', true))
  await new Promise((r) => setTimeout(r, 2500))
}

// REPEATS mode: vary the plaster tile's UV SCALE on the drawn material. The
// catalog ships `uvScale: [2.5, 2.5]`, i.e. texture.repeat 0.40 — one tile
// stretched across 2.5 m of wall. Real orange-peel plaster is a millimetre
// texture, so this is the DOOR-GRAIN lesson (v0.31.5.50) on a bigger surface:
// a fine grain stretched over a large panel stops reading as texture and starts
// reading as broad soft cloud. Sweeping the metres-per-tile directly.
// COMPOSED=1: does a USER-COMPOSED plaster finish get the same tiling as the
// built-in wall paints, and does the composer's tile-scale multiplier do anything?
// `COMPOSE_TEXTURES` still declares `{ pattern: 'plaster', uvScale: [2.5, 2.5] }`
// under a comment claiming it mirrors the catalog — a third home for the number
// that `.56` left alone because it was never proven to be on any drawn path.
// Meta-rule (xvii): the comment is not evidence either way. Apply the finish
// through the app's own `setWallFinish` and read the repeat back off the DRAWN
// material.
// PICK=x,y (NDC) + YAW= : "what IS that thing in the frame?" — teleport to the
// room at a named yaw, raycast one screen point, and report the DRAWN material
// plus the object's world position, size, ancestor chain and nearest plan
// opening. `Group{itemId}` in the chain means FURNITURE; apartment components
// never carry one. Use when you have a suspicious pixel but not a colour, which
// is what `class-id.mjs` needs as its input.
// DEFPOS=<defId> — target an ITEM instead of a pixel (meta-rule lv: two eyeballed
// NDC picks in `.60` both hit the curtain a few pixels from the lamp). Reports
// every mesh of every item with that defId — world bbox, material, and the flags
// that decide DEPTH SORTING (`transparent`, `depthWrite`, `depthTest`,
// `renderOrder`, `side`) — alongside the same flags for a named comparison class,
// so "does A sort wrongly against B" is answerable from one run.
const DEFPOS = process.env.DEFPOS || null
const VS = process.env.VS || null
if (DEFPOS) {
  const out = await page.evaluate(
    async (q) => {
      const { scene } = window.__three
      const st = window.__store.getState()
      const ids = new Set((st.items ?? []).filter((it) => it.defId === q.def).map((it) => it.id))
      const flags = (m) => ({
        type: m.type,
        hex: `#${m.color?.getHexString?.() ?? '??'}`,
        transparent: !!m.transparent,
        opacity: m.opacity,
        depthWrite: m.depthWrite,
        depthTest: m.depthTest,
        side: m.side,
        alphaTest: m.alphaTest,
      })
      const rows = []
      const vs = []
      scene.traverse((o) => {
        const m = o.material
        if (!m || Array.isArray(m) || !o.isMesh) return
        let owner = null
        for (let p = o; p; p = p.parent) {
          if (p.userData?.itemId) {
            owner = p.userData.itemId
            break
          }
        }
        const box = new (
          Object.getPrototypeOf(o.geometry.boundingBox ?? {}).constructor ?? Object
        )()
        o.geometry?.computeBoundingBox?.()
        const bb = o.geometry?.boundingBox
        const wp = o.getWorldPosition(o.position.clone())
        if (owner && ids.has(owner)) {
          rows.push({
            owner,
            renderOrder: o.renderOrder,
            at: [wp.x, wp.y, wp.z].map((v) => v.toFixed(2)).join(','),
            size: bb
              ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]
                  .map((v) => v.toFixed(2))
                  .join('x')
              : '?',
            ...flags(m),
          })
        }
        if (q.vs && `#${m.color?.getHexString?.() ?? ''}` === q.vs && vs.length < 3) {
          vs.push({
            renderOrder: o.renderOrder,
            at: [wp.x, wp.y, wp.z].map((v) => v.toFixed(2)).join(','),
            ...flags(m),
          })
        }
        void box
      })
      return { rows, vs, itemCount: ids.size }
    },
    { def: DEFPOS, vs: VS },
  )
  console.log(`DEFPOS=${DEFPOS} — ${out.itemCount} item(s), ${out.rows.length} mesh(es)\n`)
  const show = (r) =>
    console.log(
      `  ${String(r.type).replace('Mesh', '').replace('Material', '').padEnd(9)} ${r.hex}  at [${r.at}]  ${r.size ? `size ${r.size}  ` : ''}` +
        `transparent=${r.transparent} opacity=${r.opacity} depthWrite=${r.depthWrite} depthTest=${r.depthTest} side=${r.side} alphaTest=${r.alphaTest} renderOrder=${r.renderOrder}`,
    )
  for (const r of out.rows) show(r)
  if (VS) {
    console.log(`\ncomparison class ${VS}:`)
    for (const r of out.vs) show(r)
  }
  await browser.close()
  process.exit(0)
}

const PICK = process.env.PICK ? process.env.PICK.split(',').map(Number) : null
const YAW = Number(process.env.YAW || 0)
if (PICK) {
  await page.evaluate(
    async (q) => {
      const { requestWalkTeleport } = await import('/src/scene/cameras/walkTeleport.ts')
      requestWalkTeleport(q.x, q.z, q.yaw)
    },
    { x: pose[0], z: pose[1], yaw: (YAW * Math.PI) / 2 },
  )
  await new Promise((r) => setTimeout(r, 1800))
  // CLEARPOLY=1 — strip `polygonOffset` from every material carrying it, then
  // re-measure. Wall FACES are the only surfaces in the flat that set it
  // (`useWallFaceMaterial`), and they are also the only surfaces that vanish
  // when no composer mounts, so this asks directly whether the two are related.
  if (process.env.CLEARPOLY === '1') {
    const n = await page.evaluate(() => {
      let k = 0
      window.__three.scene.traverse((o) => {
        const m = o.material
        if (!m || Array.isArray(m) || !m.polygonOffset) return
        m.polygonOffset = false
        m.polygonOffsetFactor = 0
        m.polygonOffsetUnits = 0
        m.needsUpdate = true
        k++
      })
      const st = window.__store.getState()
      st.setManualHour(st.manualHour)
      return k
    })
    console.log(`CLEARPOLY: polygonOffset stripped from ${n} material(s)`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  fs.writeFileSync(`${OUT}/pick.png`, await page.screenshot({ type: 'png' }))
  const hit = await page.evaluate(async (pt) => {
    const { scene, camera } = window.__three
    const rc = new window.__three.raycaster.constructor()
    rc.setFromCamera({ x: pt[0], y: pt[1] }, camera)
    const r = rc.intersectObjects(scene.children, true)
    const h = r.find((o) => o.object.visible && o.object.material?.colorWrite !== false)
    if (!h) return null
    const m = h.object.material
    const g = h.object.geometry
    g?.computeBoundingBox?.()
    const bb = g?.boundingBox
    const chain = []
    for (let o = h.object.parent; o; o = o.parent) {
      chain.push(o.userData?.itemId ? `${o.type}{itemId}` : o.type)
    }
    const plan = window.__store.getState().floorPlan
    let best = null
    let bestD = 1e9
    for (const op of plan.openings ?? []) {
      const d = Math.hypot((op.x ?? 0) - h.point.x, (op.y ?? op.z ?? 0) - h.point.z)
      if (d < bestD) {
        bestD = d
        best = op
      }
    }
    const tex = (t) =>
      !t ? '—' : `${t.image?.width}x${t.image?.height} repeat=${t.repeat.x.toFixed(2)}`
    return {
      // The wall-reveal fade drives OPACITY, so a wall that raycasts but does not
      // appear will show up here even though the frustum census counts it.
      opacity: m.opacity,
      transparent: m.transparent,
      visible: h.object.visible,
      colorWrite: m.colorWrite,
      type: m.type,
      hex: `#${m.color?.getHexString?.() ?? '??'}`,
      rough: m.roughness,
      metal: m.metalness,
      normalScale: m.normalScale ? m.normalScale.x : null,
      map: tex(m.map),
      normalMap: tex(m.normalMap),
      roughnessMap: tex(m.roughnessMap),
      at: [h.point.x, h.point.y, h.point.z].map((v) => v.toFixed(2)).join(','),
      size: bb
        ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]
            .map((v) => v.toFixed(2))
            .join('x')
        : '?',
      chain: chain.join(' < '),
      opening: best ? `${best.id} (${best.kind}) d=${bestD.toFixed(2)}m` : 'none',
    }
  }, PICK)
  if (!hit) {
    console.log(`PICK ${PICK} hit nothing — check the frame at ${OUT}/pick.png`)
  } else {
    console.log(`PICK ${PICK} in ${ROOM} @ yaw ${YAW}  -> frame ${OUT}/pick.png\n`)
    console.log(`  ${hit.type} ${hit.hex} rough=${hit.rough} metal=${hit.metal}`)
    console.log(
      `  opacity=${hit.opacity} transparent=${hit.transparent} visible=${hit.visible} colorWrite=${hit.colorWrite}`,
    )
    console.log(`  normalScale   ${hit.normalScale}`)
    console.log(`  map           ${hit.map}`)
    console.log(`  normalMap     ${hit.normalMap}`)
    console.log(`  roughnessMap  ${hit.roughnessMap}`)
    console.log(`  at [${hit.at}]  size ${hit.size}`)
    console.log(`  chain: ${hit.chain}`)
    console.log(`  nearest opening: ${hit.opening}`)
  }
  await browser.close()
  process.exit(0)
}

const COMPOSED = process.env.COMPOSED === '1'
if (COMPOSED) {
  const read = async (label, skipDefault = true) => {
    const r = await page.evaluate((skip) => {
      const { scene } = window.__three
      let found = null
      scene.traverse((o) => {
        const m = o.material
        if (found || !m || Array.isArray(m)) return
        // Match the plaster branch's signature scalars, and prefer a NON-default
        // colour so the freshly applied finish wins over the 99 untouched walls.
        if (
          m.normalMap &&
          Math.abs(m.roughness - 0.92) < 0.001 &&
          (!skip || m.color.getHexString() !== 'f5f5f0')
        ) {
          found = {
            hex: `#${m.color.getHexString()}`,
            repeat: m.normalMap.repeat.x,
            size: m.normalMap.image?.width,
          }
        }
      })
      return found
    }, skipDefault)
    console.log(
      `  ${label.padEnd(34)} ${r ? `${r.hex} repeat=${r.repeat.toFixed(3)} tile=${r.size}` : 'NOT FOUND'}`,
    )
  }
  console.log('plaster tiling on the DRAWN material:')
  await read('builtin wall-paint-white', false)
  // A DISTINCT COLOUR PER ARM. Three identical repeats would otherwise be
  // indistinguishable from a `setWallFinish` that never applied (meta-rule xxv);
  // the hex changing arm to arm is the proof that it did.
  for (const [scale, colour] of [
    [1, '#c8a0a0'],
    [2, '#a0c8a0'],
    [0.5, '#a0a0c8'],
  ]) {
    await page.evaluate(
      async (a) => {
        const { composeMaterialId } = await import('/src/materials/composeMaterial.ts')
        window.__store
          .getState()
          .setWallFinish('livingDining', composeMaterialId('plaster', a.colour, a.scale))
      },
      { scale, colour },
    )
    await new Promise((r) => setTimeout(r, 2500))
    await read(`composed plaster ${colour}, scale ${scale}`)
  }
  await browser.close()
  process.exit(0)
}

const REPEATS = (process.env.REPEATS || '').split(',').filter(Boolean).map(Number)
if (REPEATS.length) {
  await run('base')
  for (const metres of REPEATS) {
    await page.evaluate((m) => {
      const r = 1 / m
      for (const mm of window.__wallMats) {
        for (const t of [mm.normalMap, mm.roughnessMap, mm.map]) {
          if (!t) continue
          t.repeat.set(r, r)
          t.needsUpdate = true
        }
        mm.needsUpdate = true
      }
      const st = window.__store.getState()
      st.setManualHour(st.manualHour)
    }, metres)
    await new Promise((r) => setTimeout(r, 1500))
    // Read the repeat back off the DRAWN material (meta-rule iv).
    const live = await page.evaluate(
      () => `repeat=${window.__wallMats[0].normalMap.repeat.x.toFixed(3)}`,
    )
    rows.push([`uvScale ${metres}m`, { live }, await measure(`uv${metres}`)])
  }
  console.log('arm                  live                       mean   sigma   micro   ground')
  for (const [tag, st2, r] of rows) {
    console.log(
      `${tag.padEnd(20)} ${String(st2.live ?? `ao=${st2.ao}`).padEnd(25)} ` +
        `${r.mean.toFixed(1).padStart(6)}  ${r.sd.toFixed(2).padStart(6)}  ${r.micro.toFixed(3).padStart(6)}  ${r.ground.toFixed(2).padStart(6)}`,
    )
  }
  console.log(`\nframes + crops -> ${OUT}`)
  await browser.close()
  process.exit(0)
}

if (SWEEP.length) {
  const shipped = await page.evaluate(async () => {
    const { AO } = await import('/src/scene/look.ts')
    return { ...AO }
  })
  console.log(`shipped AO: ${JSON.stringify(shipped)}\n`)
  await run('base')
  for (const arm of SWEEP) {
    await applyAo(arm)
    // Print the AO the effect is ACTUALLY carrying, not the one requested.
    const live = await page.evaluate(async () => {
      const { AO } = await import('/src/scene/look.ts')
      return `r=${AO.aoRadius} i=${AO.intensity} f=${AO.distanceFalloff}`
    })
    rows.push([
      arm.map(([k, v]) => `${k}=${v}`).join(','),
      { ...(await state()), live },
      await measure(arm.map(([k, v]) => `${k}_${v}`).join('_')),
    ])
  }
  await page.evaluate(
    (sh) => import('/src/scene/look.ts').then(({ AO }) => Object.assign(AO, sh)),
    shipped,
  )
  // AO-off floor, measured LAST with the shipped tuning restored: the sigma a
  // sweep arm would have to beat to be indistinguishable from no AO at all.
  await page.evaluate(() => window.__store.getState().setQualityOverride('ao', false))
  await new Promise((r) => setTimeout(r, 2500))
  await run('ao-off-ref')
  console.log('arm                  live                       mean   sigma   micro   ground')
  for (const [tag, st2, r] of rows) {
    console.log(
      `${tag.padEnd(20)} ${String(st2.live ?? `ao=${st2.ao}`).padEnd(25)} ` +
        `${r.mean.toFixed(1).padStart(6)}  ${r.sd.toFixed(2).padStart(6)}  ${r.micro.toFixed(3).padStart(6)}  ${r.ground.toFixed(2).padStart(6)}`,
    )
  }
  console.log(`\nframes + crops -> ${OUT}`)
  await browser.close()
  process.exit(0)
}

await run('base')

await page.evaluate(() => window.__store.getState().setQualityOverride('ao', false))
await new Promise((r) => setTimeout(r, 2500))
await run('ao-off')
await page.evaluate(() => window.__store.getState().setQualityOverride('ao', true))
await new Promise((r) => setTimeout(r, 2500))

await page.evaluate(() => {
  for (const m of window.__wallMats) {
    m.normalMap = null
    m.needsUpdate = true
  }
  window.__store.getState().setManualHour(window.__store.getState().manualHour)
})
await new Promise((r) => setTimeout(r, 1200))
await run('normal-off')
await page.evaluate(() => {
  window.__wallMats.forEach((m, i) => {
    m.normalMap = window.__wallSaved[i].normalMap
    m.needsUpdate = true
  })
})
await new Promise((r) => setTimeout(r, 1200))

await page.evaluate(() => {
  for (const m of window.__wallMats) {
    m.roughnessMap = null
    m.needsUpdate = true
  }
  window.__store.getState().setManualHour(window.__store.getState().manualHour)
})
await new Promise((r) => setTimeout(r, 1200))
await run('rough-off')

console.log('arm          state                              mean   sigma   micro   ground')
for (const [tag, s, r] of rows) {
  console.log(
    `${tag.padEnd(12)} ao=${String(s.ao).padEnd(5)} tier=${String(s.tier).padEnd(7)} nrm=${s.nrm} rgh=${s.rgh}   ` +
      `${r.mean.toFixed(1).padStart(6)}  ${r.sd.toFixed(2).padStart(6)}  ${r.micro.toFixed(3).padStart(6)}  ${r.ground.toFixed(2).padStart(6)}`,
  )
}
console.log(`\nframes + crops -> ${OUT}`)
await browser.close()
