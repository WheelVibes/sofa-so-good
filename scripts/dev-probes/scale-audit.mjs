/**
 * SCALE-AUDIT — is the default 4-room flat actually built to Singapore HDB scale?
 *
 * The full reference table (code value · measured value · cited HDB/BCA/SS reference ·
 * verdict) lives in `docs/audit/hdb-scale-audit-2026-09-07.md`. This probe is the
 * MEASURED column, and it is re-runnable so the table cannot silently drift.
 *
 * Why measure the MESH and not the constants: a constant can be right while the geometry
 * built from it is wrong. `FLAT.doorHeight` is 2.1 whether or not the leaf renderer adds a
 * frame allowance; `ELECTRICAL_MOUNT_DEFAULTS_MM.switch` is 1200 whether or not
 * `fittingModel` divides by 1000 on the way to an instance matrix. So everything below is
 * read back out of `window.__three.scene`:
 *   - plain meshes → world-space AABB of their geometry bounding box,
 *   - instanced meshes → the Y translation of every instance matrix (this is how the
 *     WALL-FITTINGS switches/sockets and the PLUMBING-FITTINGS taps report their height),
 *   - clear widths (corridor, main-door opening) → horizontal raycasts between wall faces,
 *     because a "width" is a gap between two surfaces and no single mesh carries it.
 *
 * Shell + fittings only (no furniture assertions — the flat's furniture is IKEA-sourced and
 * out of this audit's scope; its heights are printed FYI but never asserted).
 *
 * Run:
 *   URL=http://localhost:5200/ node scripts/dev-probes/scale-audit.mjs
 *   URL='http://localhost:5200/?ff=hdbScaleAudit:off' node scripts/dev-probes/scale-audit.mjs
 *
 * Env: URL/SSG_URL (dev server), HOUR (default 13), FLAG (on|off — appends `?ff=`),
 *      STRICT=0 to print without failing.
 *
 * NOTE on `FLAG=off`: the four `hdbScaleAudit` assertions (blast-door opening, lever height,
 * kick plate, shower take-off) are EXPECTED to fail in that arm — that is the flag-off arm
 * reproducing the pre-audit dimensions, which is what makes the flag reversible. Everything
 * else must pass in both arms.
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const HOUR = Number(process.env.HOUR || 13)
const STRICT = process.env.STRICT !== '0'
const FLAG = process.env.FLAG || ''

function url() {
  const base = appUrl()
  if (!FLAG) return base
  const u = new URL(base)
  u.searchParams.set('ff', `hdbScaleAudit:${FLAG}`)
  return u.toString()
}

const browser = await puppeteer.launch({
  headless: true,
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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(url(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60_000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20_000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90_000 })
await page.evaluate((h) => {
  const s = window.__store.getState()
  s.endTour?.()
  s.setOnboardingOpen?.(false)
  s.setTimeMode('manual')
  s.setManualHour(h)
}, HOUR)
await page
  .waitForFunction(() => !window.__store.getState().loading?.active, { timeout: 60_000 })
  .catch(() => {})
// Walk mode: the fittings/hardware renderers and the wall reveal all behave differently in
// orbit (faded clones, culled interiors), and a faded clone's AABB is still the real size —
// but the reveal can hide a mesh entirely, which would silently drop a row.
await page.evaluate(() => {
  const s = window.__store.getState()
  s.setCameraMode('firstPerson')
  s.dismissCallout?.('walk-mode')
})
await page.waitForFunction(() => !!window.__walkLook, { timeout: 20_000 })
await new Promise((r) => setTimeout(r, 5000))
await assertSceneAlive(page, 'after setup')

/** Everything below runs IN THE PAGE. Defined once and evaluated twice: furnished (the
 *  fittings are derived from placed fixtures, so they only exist while the flat is
 *  furnished) and then bare (a curtain panel or a wardrobe standing over a window pollutes
 *  the opening's measured band, and the shell is what this audit is about). */
function measureInPage() {
  const r3 = (v) => Math.round(v * 1000) / 1000
  const scene = window.__three.scene

  /** World-space AABB of a mesh's geometry bounding box (8 corners through matrixWorld). */
  function worldBox(o) {
    if (!o.geometry?.boundingBox) o.geometry?.computeBoundingBox?.()
    const bb = o.geometry?.boundingBox
    if (!bb) return null
    o.updateWorldMatrix(true, false)
    const e = o.matrixWorld.elements
    const mn = [Infinity, Infinity, Infinity]
    const mx = [-Infinity, -Infinity, -Infinity]
    for (const x of [bb.min.x, bb.max.x])
      for (const y of [bb.min.y, bb.max.y])
        for (const z of [bb.min.z, bb.max.z]) {
          const p = [
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          ]
          for (let i = 0; i < 3; i++) {
            mn[i] = Math.min(mn[i], p[i])
            mx[i] = Math.max(mx[i], p[i])
          }
        }
    return { mn, mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] }
  }

  // The flat's own footprint, so the estate-surround blocks outside the windows never
  // pollute a "tallest mesh" style query.
  const inFlat = (b) =>
    b && b.mn[0] > -1 && b.mx[0] < 14 && b.mn[2] > -1 && b.mx[2] < 11 && b.mx[1] < 4

  const meshes = []
  const instanceYs = new Map()
  scene.traverse((o) => {
    if (o.isInstancedMesh) {
      // Instanced fittings carry their mount height in the instance matrix, not in any
      // node transform — read column 4 row 2 (element 13) of each 4x4.
      const group = o.parent?.name || '·'
      const set = instanceYs.get(group) ?? new Set()
      for (let i = 0; i < o.count; i++) set.add(r3(o.instanceMatrix.array[i * 16 + 13]))
      instanceYs.set(group, set)
      return
    }
    if (!o.isMesh) return
    const b = worldBox(o)
    if (!inFlat(b)) return
    meshes.push({ name: o.name || '', b })
  })

  const near = (a, b, tol) => Math.abs(a - b) <= tol
  const uniq = (xs) => [...new Set(xs.map(r3))].sort((a, b) => a - b)

  // ── Ceiling / floor: a big horizontal slab. "Big" (>1.2 m each way) is what separates a
  //    room floor or ceiling plane from a rug, a table top or a counter worktop. ──
  const slabs = meshes.filter((m) => m.b.size[1] < 0.02 && m.b.size[0] > 1.2 && m.b.size[2] > 1.2)
  const ceilingTops = uniq(slabs.map((m) => m.b.mx[1]).filter((y) => y > 1.5))
  const floorTops = uniq(slabs.map((m) => m.b.mx[1]).filter((y) => y < 0.2))

  // ── Door leaves: a thin slab standing on the floor, roughly a door's height. The upper
  //    bound (2.2) is what keeps a 2.6 m wall FACE PLANE out of the set. ──
  const leaves = meshes
    .filter(
      (m) =>
        m.b.mn[1] < 0.01 &&
        m.b.size[1] > 1.9 &&
        m.b.size[1] < 2.2 &&
        Math.min(m.b.size[0], m.b.size[2]) < 0.2 &&
        Math.max(m.b.size[0], m.b.size[2]) > 0.3,
    )
    .map((m) => ({
      w: r3(Math.max(m.b.size[0], m.b.size[2])),
      h: r3(m.b.size[1]),
      t: r3(Math.min(m.b.size[0], m.b.size[2])),
    }))
  const leafSizes = [...new Set(leaves.map((l) => `${l.w} x ${l.h} x ${l.t}`))].sort()

  // ── Skirting: a long thin strip standing ON the floor, taller than a tile lip and
  //    shorter than a kitchen plinth, and slim across the wall. ──
  const skirt = meshes.filter(
    (m) =>
      m.b.mn[1] < 0.002 &&
      m.b.size[1] > 0.04 &&
      m.b.size[1] < 0.2 &&
      Math.max(m.b.size[0], m.b.size[2]) > 0.5 &&
      Math.min(m.b.size[0], m.b.size[2]) < 0.4,
  )
  const skirtHeights = uniq(skirt.map((m) => m.b.size[1]))

  // ── Crown / cornice: a slim strip whose TOP sits at the ceiling plane ──
  const ceilY = ceilingTops.length ? Math.max(...ceilingTops) : 2.6
  const crown = meshes.filter(
    (m) =>
      m.b.size[1] > 0.01 &&
      m.b.size[1] < 0.2 &&
      near(m.b.mx[1], ceilY, 0.01) &&
      Math.max(m.b.size[0], m.b.size[2]) > 0.2 &&
      Math.min(m.b.size[0], m.b.size[2]) < 0.05,
  )
  const crownHeights = uniq(crown.map((m) => m.b.size[1]))

  // ── Clear widths by raycast: a gap between two faces is not any one mesh's size ──
  const THREE_RC = window.__three.raycaster.constructor
  const V3 = window.__three.camera.position.constructor
  const rc = new THREE_RC()
  /** Distance from `from` along `dir` to the first opaque hit (or null). */
  function shoot(from, dir, far = 20) {
    rc.set(new V3(...from), new V3(...dir).normalize())
    rc.far = far
    const hits = rc
      .intersectObjects(scene.children, true)
      .filter((h) => h.object.visible && h.object.material?.colorWrite !== false)
    return hits.length ? r3(hits[0].distance) : null
  }
  /** Clear span through a point: shoot both ways along an axis and add. */
  function span(at, dir) {
    const a = shoot(at, dir)
    const b = shoot(
      at,
      dir.map((v) => -v),
    )
    return a != null && b != null ? r3(a + b) : null
  }

  // ── Window sills + heads, anchored on the PLAN's own openings ───────────────────────
  const plan = window.__store.getState().floorPlan
  const wallsById = new Map((plan?.walls ?? []).map((w) => [w.id, w]))
  function openingCentre(op) {
    const w = wallsById.get(op.wallId)
    if (!w) return null
    const dx = w.end[0] - w.start[0]
    const dz = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dz) || 1
    const t = op.offset + op.width / 2
    return [w.start[0] + (dx / len) * t, w.start[1] + (dz / len) * t]
  }
  // An opening's sill and head are the edges of a HOLE, and a hole has no mesh and no
  // bounding box — the wall body is one extruded shape whose AABB is the full 2.6 m
  // whatever it is punched with, so reading AABBs here reports the wall, not the window
  // (it did, on the first run of this probe: every opening came back 0 → 2.6).
  //
  // So probe the hole: from the room side, at the opening's along-wall centre, fire a ray
  // straight at the wall at each of a ladder of heights. A height inside the opening hits
  // the frame/sash/glass — none of which is more than ~2 m tall. A height in the solid
  // wall hits the wall body or its face plane, both of which run the full storey. That
  // "is the first thing I hit full-storey-tall?" test is the classifier; the sill and head
  // are where it flips, bisected to the millimetre.
  const wallish = new WeakSet()
  for (const m of meshes) if (m.b.size[1] > 2.4) wallish.add(m)
  const wallishByBox = (o) => {
    if (!o.geometry?.boundingBox) o.geometry?.computeBoundingBox?.()
    const bb = o.geometry?.boundingBox
    if (!bb) return false
    // Local-space height is enough: shell walls are axis-aligned, never tilted.
    return bb.max.y - bb.min.y > 2.4
  }
  /** True when the wall is hollow at height `h`, `along` metres along the wall from `c`. */
  function isOpenAt(op, c, h, along = 0) {
    const w = wallsById.get(op.wallId)
    const dx = w.end[0] - w.start[0]
    const dz = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len
    const uz = dz / len
    const nx = -uz
    const nz = ux
    const from = [c[0] + ux * along + nx * 0.9, h, c[1] + uz * along + nz * 0.9]
    rc.set(new V3(...from), new V3(-nx, 0, -nz))
    rc.far = 1.8
    const hits = rc
      .intersectObjects(scene.children, true)
      .filter((hit) => hit.object.visible && hit.object.material?.colorWrite !== false)
      // Only care about what is AT the wall, not what stands 1.5 m past it.
      .filter((hit) => hit.distance < 1.15)
    if (hits.length === 0) return true
    return !hits.some((hit) => wallishByBox(hit.object))
  }
  /** Bisect the flip between `lo` (known one way) and `hi` (known the other), 1 mm.
   *  `axis` picks which coordinate is being bisected: the height, or the distance along
   *  the wall at a fixed height. */
  function edge(op, c, lo, hi, axis = 'h', fixed = 0) {
    const at = (v) => (axis === 'h' ? isOpenAt(op, c, v, fixed) : isOpenAt(op, c, fixed, v))
    let a = lo
    let b = hi
    const ref = at(lo)
    for (let i = 0; i < 12 && Math.abs(b - a) > 0.001; i++) {
      const mid = (a + b) / 2
      if (at(mid) === ref) a = mid
      else b = mid
    }
    return r3((a + b) / 2)
  }
  function bandByRay(op, c) {
    const STEP = 0.04
    // Stop BELOW the wall top. Above the wall there is nothing to hit, so the "did the ray
    // get past the wall plane?" classifier reads open for every height above 2.6 and every
    // opening reported a head of 2.74 on the first run of this scan.
    const TOP = 2.55
    let firstOpen = null
    let lastOpen = null
    for (let h = 0.02; h <= TOP; h += STEP) {
      if (!isOpenAt(op, c, h)) continue
      if (firstOpen == null) firstOpen = h
      lastOpen = h
    }
    if (firstOpen == null) return null
    const sill = firstOpen <= 0.03 ? 0 : edge(op, c, firstOpen - STEP, firstOpen)
    const head = lastOpen >= TOP - STEP ? r3(lastOpen) : edge(op, c, lastOpen + STEP, lastOpen)
    // Clear WIDTH, same classifier swept sideways at mid-opening height: walk out from the
    // centre until the wall goes solid, on both sides, and bisect each edge.
    const midH = (sill + head) / 2
    const HALF = Math.max(1.6, op.width)
    let l = 0
    let rr = 0
    while (l < HALF && isOpenAt(op, c, midH, -(l + STEP))) l += STEP
    while (rr < HALF && isOpenAt(op, c, midH, rr + STEP)) rr += STEP
    const left = edge(op, c, -(l + STEP), -l, 'a', midH)
    const right = edge(op, c, rr + STEP, rr, 'a', midH)
    return { sill, head, width: r3(right - left) }
  }

  const openings = []
  for (const op of plan?.openings ?? []) {
    const c = openingCentre(op)
    if (!c) continue
    openings.push({ id: op.id, kind: op.kind, width: r3(op.width), measured: bandByRay(op, c) })
  }

  // ── Door hardware: the lever set's own meshes are named ──
  const named = (n) => meshes.filter((m) => m.name === n)
  const leverYs = uniq(named('door-lever').map((m) => (m.b.mn[1] + m.b.mx[1]) / 2))
  const hingeYs = uniq(named('door-hinge').map((m) => (m.b.mn[1] + m.b.mx[1]) / 2))
  const kickH = uniq(named('door-kickplate').map((m) => m.b.size[1]))

  // Corridor band is z=[3.875, 4.825] between the MB-door partition and the L/D; measure
  // its NORTH-SOUTH clear width at mid-corridor, above the skirting and below the doors'
  // heads so a leaf standing open cannot be mistaken for a wall.
  const corridorClear = span([6.5, 1.2, 4.35], [0, 0, 1])
  // Main door sits on the SE step wall at cz=8.235; measure the clear opening across it.
  const mainDoorClear = span([11.5, 1.2, 8.235], [1, 0, 0])

  // ── FYI only: furniture heights (out of audit scope, printed for the table's notes) ──
  const st = window.__store.getState()
  const furniture = (st.items ?? [])
    .filter((it) => /toilet|sink|basin|counter/.test(it.defId ?? it.id ?? ''))
    .map((it) => ({ id: it.defId ?? it.id, h: it.footprint?.h ?? null }))

  return {
    ceilingTops,
    floorTops,
    leafSizes,
    skirtHeights,
    crownHeights,
    openings,
    leverYs,
    hingeYs,
    kickH,
    corridorClear,
    mainDoorClear,
    fittingYs: [...instanceYs.entries()].map(([k, v]) => [
      k,
      [...v].sort((a, b) => a - b).filter((y) => y > -0.01 && y < 3),
    ]),
    furniture,
  }
}

const furnished = await page.evaluate(measureInPage)
// Strip the furniture and re-measure the bare shell.
await page.evaluate(() => window.__store.getState().setItems([]))
await new Promise((r) => setTimeout(r, 3000))
await assertSceneAlive(page, 'after clearing furniture')
const bare = await page.evaluate(measureInPage)
// Fittings come from the furnished pass; shell geometry from the bare one.
const measured = { ...bare, fittingYs: furnished.fittingYs, furniture: furnished.furniture }

// ── Report ────────────────────────────────────────────────────────────────────────────
const fit = new Map(measured.fittingYs)
const wall = fit.get('wall-fittings') ?? []
const plumb = fit.get('plumbing-fittings') ?? []
const yard = fit.get('yard-fittings') ?? []

console.log(`SCALE-AUDIT  url=${url()}  hour=${HOUR}`)
console.log('')
console.log('  SHELL')
console.log(`    floor top y ................. ${measured.floorTops.join(', ')} m`)
console.log(`    ceiling slab tops ........... ${measured.ceilingTops.join(', ')} m`)
console.log(`    door leaf sizes (w x h x t) . ${measured.leafSizes.join('  |  ')} m`)
console.log(`    skirting heights ............ ${measured.skirtHeights.join(', ')} m`)
console.log(`    crown/cornice heights ....... ${measured.crownHeights.join(', ')} m`)
console.log(`    corridor clear width ........ ${measured.corridorClear} m`)
console.log(`    main-door clear opening ..... ${measured.mainDoorClear} m`)
console.log('')
console.log('  OPENINGS — measured by raycast through the wall (metres)')
for (const o of measured.openings) {
  const m = o.measured
    ? `${o.measured.sill} → ${o.measured.head}   clear width ${o.measured.width}`
    : '(no opening found in the wall)'
  console.log(
    `    ${o.id.padEnd(24)} ${o.kind.padEnd(7)} declared w=${String(o.width).padEnd(6)} ${m}`,
  )
}
console.log('')
console.log('  FITTINGS (instance mount heights, m AFFL)')
console.log(`    wall-fittings ............... ${wall.join(', ')}`)
console.log(`    plumbing-fittings ........... ${plumb.join(', ')}`)
console.log(`    yard-fittings ............... ${yard.join(', ')}`)
console.log('')
console.log('  DOOR HARDWARE')
console.log(`    lever centre heights ........ ${measured.leverYs.join(', ')} m`)
console.log(`    hinge centre heights ........ ${measured.hingeYs.join(', ')} m`)
console.log(`    kick-plate height ........... ${measured.kickH.join(', ')} m`)
console.log('')
console.log('  FURNITURE (FYI — out of scope, never asserted)')
for (const f of measured.furniture) console.log(`    ${f.id} h=${f.h}`)
console.log('')

// ── Assertions — the rows the audit signed off as CORRECT ─────────────────────────────
// Each is a value the reference table marks `ok` (or `fix`, post-fix). A row that is a
// PRODUCT CALL (ceiling height, sill height, palette) is deliberately NOT asserted — see
// docs/audit/hdb-scale-audit-2026-09-07.md for which and why.
const fails = []
const has = (xs, v, tol = 0.006) => xs.some((x) => Math.abs(x - v) <= tol)
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) fails.push(label)
}

const winsOf = (re) => measured.openings.filter((o) => o.kind === 'window' && re.test(o.id))
const habitableWins = winsOf(/-N$/)
const bathWins = winsOf(/bath/)

check(
  'floor finish level is y=0',
  measured.floorTops.length > 0 && measured.floorTops.every((y) => Math.abs(y) < 0.01),
  `got ${measured.floorTops.join(', ')}`,
)
check(
  'ceiling at 2.60 m (habitable) and 2.40 m (bath/kitchen drop)',
  has(measured.ceilingTops, 2.6, 0.01) && has(measured.ceilingTops, 2.4, 0.01),
  `got ${measured.ceilingTops.join(', ')}`,
)
check(
  'main door leaf 1.00 x 2.10 m',
  measured.leafSizes.some((s) => s.startsWith('1 x 2.1')),
  `got ${measured.leafSizes.join(' | ')}`,
)
check(
  'internal door leaf 0.80 x 2.10 m',
  measured.leafSizes.some((s) => s.startsWith('0.8 x 2.1')),
  `got ${measured.leafSizes.join(' | ')}`,
)
check(
  "skirting 90 mm — inside HDB's published max of 100 mm and the 60-100 mm SG range",
  measured.skirtHeights.length > 0 && measured.skirtHeights.every((h) => h >= 0.06 && h <= 0.1),
  `got ${measured.skirtHeights.join(', ')} m`,
)
check(
  'crown/cornice bottom clears 2.10 m (HDB pelmet clearance rule)',
  measured.crownHeights.length > 0 && measured.crownHeights.every((h) => 2.6 - h >= 2.1),
  `crown heights ${measured.crownHeights.join(', ')} m, bottom at ${measured.crownHeights.map((h) => (2.6 - h).toFixed(3)).join(', ')}`,
)
check(
  'habitable-room window head at 2.40 m',
  habitableWins.length === 4 &&
    habitableWins.every((o) => o.measured && Math.abs(o.measured.head - 2.4) < 0.03),
  habitableWins.map((o) => `${o.id} head ${o.measured?.head}`).join(', '),
)
check(
  'habitable-room window sill at 0.55 m (plan callout: 3/4-height over a 550 mm parapet)',
  habitableWins.length === 4 &&
    habitableWins.every((o) => o.measured && Math.abs(o.measured.sill - 0.55) < 0.03),
  habitableWins.map((o) => `${o.id} sill ${o.measured?.sill}`).join(', '),
)
check(
  'bathroom vent window head at 2.00 m',
  bathWins.length === 2 &&
    bathWins.every((o) => o.measured && Math.abs(o.measured.head - 2.0) < 0.03),
  bathWins.map((o) => `${o.id} head ${o.measured?.head}`).join(', '),
)
check('socket outlets at 300 mm', has(wall, 0.3), `wall-fittings at ${wall.join(', ')}`)
check('light switches at 1200 mm', has(wall, 1.2), `wall-fittings at ${wall.join(', ')}`)
check('aircon isolator at 2400 mm', has(wall, 2.4), `wall-fittings at ${wall.join(', ')}`)
check('water heater point at 1800 mm', has(wall, 1.8), `wall-fittings at ${wall.join(', ')}`)
check(
  'floor traps flush with the floor',
  has(plumb, 0.002, 0.004) || has(plumb, 0.005, 0.004),
  `plumbing at ${plumb.join(', ')}`,
)
check('washer bib tap at 1150 mm', has(plumb, 1.15, 0.05), `plumbing at ${plumb.join(', ')}`)
check(
  'shower wall take-off at 1000 mm (BCA COA 2025 cl. 5.8.9 slide-bar band)',
  has(plumb, 1.0, 0.01),
  `plumbing at ${plumb.join(', ')}`,
)
check('laundry rack pole at 2050 mm', has(yard, 2.05), `yard at ${yard.join(', ')}`)
check(
  'door lever between 900 and 1100 mm (BCA Accessibility Code)',
  measured.leverYs.length > 0 && measured.leverYs.every((y) => y >= 0.9 && y <= 1.1),
  `levers at ${measured.leverYs.join(', ')} m`,
)
const hs = measured.openings.find((o) => o.id === 'door-householdShelter')
check(
  'household-shelter blast door opening 700 x 1900 mm (SCDF TRHS 2023 cl. 2.5)',
  !!hs?.measured &&
    Math.abs(hs.measured.width - 0.7) < 0.03 &&
    Math.abs(hs.measured.head - 1.9) < 0.03,
  `got ${hs?.measured?.width} x ${hs?.measured?.head} m`,
)
check(
  'corridor clear width ≥ 1.00 m',
  measured.corridorClear != null && measured.corridorClear >= 1.0,
  `got ${measured.corridorClear} m`,
)
check(
  'main-door clear opening ≥ 0.85 m (BCA Accessibility Code)',
  measured.mainDoorClear != null && measured.mainDoorClear >= 0.85,
  `got ${measured.mainDoorClear} m`,
)

console.log('')
if (fails.length === 0) console.log('SCALE-AUDIT: all assertions passed.')
else console.log(`SCALE-AUDIT: ${fails.length} assertion(s) failed: ${fails.join(' · ')}`)

await browser.close()
if (fails.length && STRICT) process.exitCode = 1
