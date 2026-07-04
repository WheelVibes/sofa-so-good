/**
 * Scenario eval for MINIMAP-JUMP: dispatch a REAL click on the walk-mode
 * minimap's `<svg>` at the on-screen point for the room farthest from the
 * walker's current position, so the harness exercises the exact same code
 * path a real mouse/touch tap would (`Minimap.tsx`'s `onClick`, which reads
 * `e.clientX`/`e.clientY` + `getBoundingClientRect()` — see the
 * canvas-raycast headless limitation in the visual-verification playbook;
 * clicking a plain DOM `<svg>` (not a Three.js mesh) has no such limitation,
 * a bubbled native `click` reaches React's root-delegated listener same as
 * `@testing-library`'s `fireEvent.click`).
 *
 * Deliberately duplicates `Minimap.tsx`'s `planContentBounds`/scale/offset
 * math and `ui/walk/minimapTeleport.ts`'s `svgSquareViewBoxPoint` inverse
 * rather than importing them (this runs as a raw injected browser script,
 * no bundler) — this is scenario-harness scaffolding, not app code; the
 * REAL forward/inverse transforms are unit-tested in `minimapTeleport.test.ts`.
 * Stashes the picked room + world target on `window.__minimapJumpTarget` so
 * the scenario's follow-up assertion step can check the walker actually
 * landed there.
 */
;(() => {
  const st = window.__store.getState()
  const plan = st.floorPlan
  const svg = document.querySelector('.minimap svg')
  if (!svg) throw new Error('minimap svg not found — are we in walk mode?')
  if (!plan.rooms.length) throw new Error('default plan has no rooms to jump to')

  const SIZE = 168
  const PAD = 0.4

  // Mirror Minimap.tsx's planContentBounds (walls + room shapes bbox).
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const acc = (x, z) => {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  for (const w of plan.walls) {
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of plan.rooms) {
    if (r.polygon && r.polygon.length >= 3) {
      for (const [px, pz] of r.polygon) acc(px, pz)
    } else {
      acc(r.origin[0], r.origin[1])
      acc(r.origin[0] + r.width, r.origin[1] + r.depth)
      if (r.extension) {
        acc(r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1])
        acc(
          r.origin[0] + r.extension.offset[0] + r.extension.width,
          r.origin[1] + r.extension.offset[1] + r.extension.depth,
        )
      }
    }
  }
  const W = maxX - minX
  const D = maxZ - minZ
  const scale = (SIZE - 12) / Math.max(W + PAD * 2, D + PAD * 2)
  const offX = (SIZE - (W + PAD * 2) * scale) / 2
  const offY = (SIZE - (D + PAD * 2) * scale) / 2
  const toX = (m) => (m - minX + PAD) * scale + offX
  const toY = (m) => (m - minZ + PAD) * scale + offY

  // roomLabelPoint-equivalent centroid (good enough for the rect/L-shape
  // default apartment; polygon rooms use the vertex average, close enough
  // for a "pick the farthest room" heuristic).
  const centroid = (r) => {
    if (r.polygon && r.polygon.length >= 3) {
      let cx = 0
      let cz = 0
      for (const [px, pz] of r.polygon) {
        cx += px
        cz += pz
      }
      return [cx / r.polygon.length, cz / r.polygon.length]
    }
    return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
  }

  const cam = window.__three.camera.position
  let target = null
  let bestDist = -1
  for (const r of plan.rooms) {
    const [cx, cz] = centroid(r)
    const d = Math.hypot(cx - cam.x, cz - cam.z)
    if (d > bestDist) {
      bestDist = d
      target = { room: r, cx, cz }
    }
  }

  const svgX = toX(target.cx)
  const svgY = toY(target.cz)
  const rect = svg.getBoundingClientRect()
  const rendered = Math.min(rect.width, rect.height)
  if (rendered <= 0) throw new Error('minimap svg has zero size')
  const padX = (rect.width - rendered) / 2
  const padY = (rect.height - rendered) / 2
  const k = rendered / SIZE
  const clientX = rect.left + padX + svgX * k
  const clientY = rect.top + padY + svgY * k

  window.__minimapJumpTarget = {
    roomId: target.room.id,
    roomName: target.room.name,
    worldX: target.cx,
    worldZ: target.cz,
    distanceFromSpawn: bestDist,
    camBefore: { x: cam.x, z: cam.z },
  }
  svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }))
})()
