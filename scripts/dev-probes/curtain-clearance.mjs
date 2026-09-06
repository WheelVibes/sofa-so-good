/**
 * CURTAIN-CLEARANCE — does the drapery actually touch anything? (CURTAIN-FLUSH)
 *
 * "It looks flush" and "it doesn't intersect" are different claims, and a frame
 * can only settle the first: a fold trough buried 30 mm inside a sill ledge is
 * invisible from every camera the survey uses. So this measures GEOMETRY.
 *
 * For every placed `curtains` item, in BOTH draw states (0 = open/gathered, the
 * deepest folds; 1 = drawn, the fabric across the glass), it samples every vertex
 * of both fabric panels through their real `matrixWorld` (so the panel group's
 * draw transform — `centreX`, `covered`, `depthScale` — is included), maps them
 * into the item's own frame, and reports the minimum SIGNED distance to:
 *
 *   (a) the host wall's interior FACE plane,
 *   (b) the interior SILL LEDGE box,
 *   (c) the window FRAME box, (d) the GRILLE bar box,
 *   (e) every wall-mounted obstacle box (`curtainObstacles`) — the aircon.
 *
 * Positive = clear by that many metres. Negative = penetrating by that much.
 *
 *   SSG_URL=http://localhost:5200/ node scripts/dev-probes/curtain-clearance.mjs
 *   FF=curtainFlush:off … (the "before" arm)
 */
import puppeteer from 'puppeteer'
import { appUrl, assertSceneAlive } from './lib.mjs'

const FF = process.env.FF || ''
const url = FF ? `${appUrl()}${appUrl().includes('?') ? '&' : '?'}ff=${FF}` : appUrl()

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 600_000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
})
const page = await browser.newPage()
await page.emulateTimezone('Asia/Singapore')
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('hdb_onboarded', '1')
  } catch {}
})
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => !!window.__store, { timeout: 20000 })
await page.evaluate(() => window.__store.getState().dismissLocationPrompt?.())
await page.waitForFunction(() => window.__store.getState().sceneReady, { timeout: 90000 })
await page.waitForFunction(() => !!window.__three?.scene, { timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))
await assertSceneAlive(page, 'after boot')

const results = {}
// Drawn FIRST, then open. `Curtain.tsx` only applies the open state's deeper
// `depthScale` (1.8) inside its `useFrame` easing — the initial JSX render hangs
// both panels at z-scale 1 — so a curtain that has never animated understates its
// own fold depth. Reaching `open` by animating out of `drawn` measures the real
// worst case.
for (const draw of [1, 0]) {
  // Flip every curtain and let the eased draw animation settle (DRAW_SPEED 3.2).
  await page.evaluate((d) => {
    const st = window.__store.getState()
    for (const it of st.items) {
      if (it.defId === 'curtains') st.updateItemProps(it.id, { drawAmount: d })
    }
  }, draw)
  await new Promise((r) => setTimeout(r, 3500))
  await assertSceneAlive(page, `draw=${draw}`)

  results[draw] = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { curtainObstacles } = await import('/src/furniture/defaults/curtainFlush.ts')
    const { planWallThickness } = await import('/src/floorplan/planGeometry.ts')
    const { WINDOW_FRAME_DEPTH, WINDOW_GRILLE_Z, WINDOW_SILL_LEDGE_DEPTH, WINDOW_SILL_LEDGE_Z } =
      await import('/src/apartment/windowProjection.ts')
    const { GRILLE_BAR_D } = await import('/src/floorplan/windowGrilleLayout.ts')
    const { snapToNearestWindow } = await import('/src/furniture/placement/windowSnap.ts')
    const { CURTAIN_ROD_MAX_DROP, CURTAIN_ROD_OBSTACLE_CLEARANCE, CURTAIN_ROD_TOP_OFFSET } =
      await import('/src/furniture/placement/curtainStandoff.ts')

    const st = window.__store.getState()
    const plan = st.floorPlan
    const curtains = st.items.filter((i) => i.defId === 'curtains')

    // itemId → the r3f group whose matrix is the item's own frame.
    const groups = new Map()
    window.__three.scene.traverse((o) => {
      const id = o.userData?.itemId
      if (id) groups.set(id, o)
    })

    /** Signed distance (m) from a point to an axis-aligned box: >0 outside
     *  (distance to the surface), <0 inside (−penetration depth). */
    const boxDist = (p, b) => {
      const dx = Math.max(b.x[0] - p.x, p.x - b.x[1])
      const dy = Math.max(b.y[0] - p.y, p.y - b.y[1])
      const dz = Math.max(b.z[0] - p.z, p.z - b.z[1])
      if (dx > 0 || dy > 0 || dz > 0) {
        return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
      }
      return Math.max(dx, dy, dz) // all negative: the least-deep face
    }

    const out = []
    for (const item of curtains) {
      const g = groups.get(item.id)
      if (!g) continue
      const snap = snapToNearestWindow(plan.walls, plan.openings, item.position, plan)
      if (!snap) continue
      const wall = plan.walls.find((w) =>
        plan.openings.some((o) => o.id === snap.openingId && o.wallId === w.id),
      )
      const t = wall ? planWallThickness(wall, plan) : snap.wallThickness
      const win = snap.window
      const halfW = win.width / 2
      const boxes = {
        sill: {
          x: [-halfW - 0.05, halfW + 0.05],
          y: [win.sill - 0.04, win.sill],
          z: [
            WINDOW_SILL_LEDGE_Z - WINDOW_SILL_LEDGE_DEPTH / 2,
            WINDOW_SILL_LEDGE_Z + WINDOW_SILL_LEDGE_DEPTH / 2,
          ],
        },
        frame: {
          x: [-halfW, halfW],
          y: [win.sill, win.head],
          z: [-WINDOW_FRAME_DEPTH / 2, WINDOW_FRAME_DEPTH / 2],
        },
        grille: {
          x: [-halfW, halfW],
          y: [win.sill, win.head],
          z: [WINDOW_GRILLE_Z - GRILLE_BAR_D / 2, WINDOW_GRILLE_Z + GRILLE_BAR_D / 2],
        },
      }
      // Split the mounts the rod rule is allowed to duck under (an aircon over
      // the head of the window) from the ones it deliberately will not (a mount
      // low enough that clearing it would leave a knee-high curtain) — see
      // CURTAIN_ROD_MAX_DROP. Both are reported; only the first is a promise.
      const h = item.props.height ?? 2.55
      // `curtainObstacles` works in the ITEM's frame; shift its boxes onto the
      // snap frame so both arms are measured against the same origin.
      const shiftX =
        (item.position[0] - snap.position[0]) * Math.cos(snap.rotation) -
        (item.position[1] - snap.position[1]) * Math.sin(snap.rotation)
      const shiftZ =
        (item.position[0] - snap.position[0]) * Math.sin(snap.rotation) +
        (item.position[1] - snap.position[1]) * Math.cos(snap.rotation)
      const all = curtainObstacles(item, st.items).map((o) => ({
        x: [o.x[0] + shiftX, o.x[1] + shiftX],
        y: o.y,
        z: [o.z[0] + shiftZ, o.z[1] + shiftZ],
      }))
      const obstacles = all.filter(
        (o) =>
          h - (o.y[0] - CURTAIN_ROD_OBSTACLE_CLEARANCE - CURTAIN_ROD_TOP_OFFSET) <=
          CURTAIN_ROD_MAX_DROP,
      )
      const others = all.filter((o) => !obstacles.includes(o))

      g.updateWorldMatrix(true, true)
      // Measure in the SNAP frame — the host wall's centre-line, +Z into the room
      // — not the item's own frame. Before CURTAIN-FLUSH the seeded origins sat
      // 0.12–0.22 m off that centre-line, so measuring in the item's frame would
      // silently subtract exactly the error being measured.
      const snapM = new THREE.Matrix4()
        .makeRotationY(snap.rotation)
        .setPosition(snap.position[0], 0, snap.position[1])
      const toLocal = snapM.clone().invert()

      let wallMin = Infinity
      const boxMin = { sill: Infinity, frame: Infinity, grille: Infinity }
      let obsMin = Infinity
      let otherMin = Infinity
      let otherWorst = null
      let panels = 0
      let verts = 0
      const p = new THREE.Vector3()
      g.traverse((m) => {
        if (!m.isMesh) return
        const pos = m.geometry?.attributes?.position
        // The fabric panels are the only high-tessellation planes in a curtain
        // (SEG_X x SEG_Y quads); the rod is a 10-segment cylinder, the finials
        // spheres. Discriminate on vertex count, not on order.
        if (!pos || pos.count < 200) return
        panels += 1
        m.updateWorldMatrix(true, false)
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toLocal)
          verts += 1
          wallMin = Math.min(wallMin, p.z - t / 2)
          for (const k of Object.keys(boxes)) boxMin[k] = Math.min(boxMin[k], boxDist(p, boxes[k]))
          for (const o of obstacles) obsMin = Math.min(obsMin, boxDist(p, o))
          for (const o of others) {
            const d = boxDist(p, o)
            if (d < otherMin) {
              otherMin = d
              otherWorst = o
            }
          }
        }
      })
      out.push({
        id: item.id,
        wallThickness: +t.toFixed(3),
        standoff: item.props.standoff ?? null,
        height: item.props.height ?? null,
        panels,
        verts,
        wall: +wallMin.toFixed(4),
        sill: +boxMin.sill.toFixed(4),
        frame: +boxMin.frame.toFixed(4),
        grille: +boxMin.grille.toFixed(4),
        obstacle: Number.isFinite(obsMin) ? +obsMin.toFixed(4) : null,
        otherMount: Number.isFinite(otherMin) ? +otherMin.toFixed(4) : null,
        otherWorstBox: otherWorst,
      })
    }
    return out
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`\nCURTAIN-CLEARANCE  ${url}\n`)
for (const draw of [0, 1]) {
  console.log(`draw=${draw} (${draw ? 'drawn' : 'open/gathered'})`)
  console.log(
    `  ${pad('item', 24)}${pad('standoff', 10)}${pad('height', 9)}${pad('wall', 10)}${pad('sill', 10)}${pad('frame', 10)}${pad('grille', 10)}${pad('obstacle', 10)}otherMount`,
  )
  for (const r of results[draw]) {
    console.log(
      `  ${pad(r.id, 24)}${pad(r.standoff, 10)}${pad(r.height, 9)}${pad(r.wall, 10)}${pad(r.sill, 10)}${pad(r.frame, 10)}${pad(r.grille, 10)}${pad(r.obstacle, 10)}${r.otherMount}`,
    )
  }
  console.log('')
}
const all = [...results[0], ...results[1]]
const worst = Math.min(
  ...all.flatMap((r) => [r.wall, r.sill, r.frame, r.grille, r.obstacle ?? Infinity]),
)
console.log(`worst minimum over all curtains and both states: ${worst.toFixed(4)} m`)
console.log(worst >= 0 ? 'PASS — no penetration' : 'FAIL — something is inside something')
console.log(JSON.stringify(results))
await browser.close()
