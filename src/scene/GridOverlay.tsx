import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, type LineBasicMaterial } from 'three'
import { noExportUserData } from '../export/sceneGltf'
import { planBounds } from '../floorplan/types'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { useDisposeGeometry } from './geometryUtil'

interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

interface GridOverlayProps {
  /** Room footprint rects the grid is clipped to (per-room editor). Omitted in
   *  the main scene → the grid spans the whole plan from the origin. */
  rects?: Rect[]
  /** A polygon room's outline — when set the grid is masked to it (a true
   *  per-room polygon grid, not the bounding box). */
  polygon?: [number, number][]
}

/** Inside-polygon spans of the axis-aligned line at `coord` (a vertical line
 *  x=coord scanning Z, or horizontal z=coord scanning X). Even-odd scanline. */
function polygonSpans(
  poly: [number, number][],
  axis: 'x' | 'z',
  coord: number,
): Array<[number, number]> {
  const a = axis === 'x' ? 0 : 1 // the fixed axis index
  const b = axis === 'x' ? 1 : 0 // the scanned axis index
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const pa = p[a]
    const qa = q[a]
    // Does the edge straddle `coord` on the fixed axis?
    if (pa === qa) continue
    if (coord < Math.min(pa, qa) || coord >= Math.max(pa, qa)) continue
    const t = (coord - pa) / (qa - pa)
    xs.push(p[b] + t * (q[b] - p[b]))
  }
  xs.sort((m, n) => m - n)
  const spans: Array<[number, number]> = []
  for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1]])
  return spans
}

/**
 * Floor alignment grid for the per-room editor. Snapped lines are world-aligned
 * to the snap points (multiples of `gridSize` from the apartment origin), with
 * whole-metre lines drawn brighter. The grid is **masked to the current room**
 * (its polygon, else its footprint rects) so it never paints the whole
 * apartment, and it **fades in only while the user is moving / rotating /
 * placing furniture** — when idle it fades to invisible so it doesn't read as a
 * permanent floor pattern.
 */
export function GridOverlay({ rects, polygon }: GridOverlayProps = {}) {
  const snapEnabled = useStore((s) => s.snapEnabled)
  const editing = useStore(canEditScene)
  const gridSize = useStore((s) => s.gridSize)
  const plan = useStore((s) => s.floorPlan)
  // "Performing an action": dragging an item, rotating with the gizmo, or
  // dragging a catalog ghost into place.
  const active = useStore((s) => !!s.draggingItemId || s.rotatingGizmo || !!s.activeDefId)

  const minorRef = useRef<LineBasicMaterial>(null)
  const majorRef = useRef<LineBasicMaterial>(null)
  const groupVis = useRef(false)
  const fade = useRef(0)

  const bounds = useMemo<Rect>(() => {
    if (polygon && polygon.length >= 3) {
      const xs = polygon.map((p) => p[0])
      const zs = polygon.map((p) => p[1])
      return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
    }
    if (rects && rects.length > 0) {
      return {
        x0: Math.min(...rects.map((r) => r.x0)),
        z0: Math.min(...rects.map((r) => r.z0)),
        x1: Math.max(...rects.map((r) => r.x1)),
        z1: Math.max(...rects.map((r) => r.z1)),
      }
    }
    const [w, d] = planBounds(plan)
    return { x0: 0, z0: 0, x1: w, z1: d }
  }, [polygon, rects, plan])

  const { minor, major } = useMemo(() => {
    const g = gridSize > 0 ? gridSize : 0.5
    const minorPts: number[] = []
    const majorPts: number[] = []
    const isMetre = (v: number) => Math.abs(v - Math.round(v)) < 1e-6
    // Clip a [lo,hi] span on the scanned axis to the mask (polygon spans, else
    // the rects overlapping the fixed coordinate, else the whole bounds).
    const spansAt = (axis: 'x' | 'z', coord: number): Array<[number, number]> => {
      if (polygon && polygon.length >= 3) return polygonSpans(polygon, axis, coord)
      if (rects && rects.length > 0) {
        const out: Array<[number, number]> = []
        for (const r of rects) {
          if (axis === 'x') {
            if (coord >= r.x0 && coord <= r.x1) out.push([r.z0, r.z1])
          } else if (coord >= r.z0 && coord <= r.z1) {
            out.push([r.x0, r.x1])
          }
        }
        return out
      }
      return axis === 'x' ? [[bounds.z0, bounds.z1]] : [[bounds.x0, bounds.x1]]
    }
    const start = (v: number) => Math.ceil(v / g - 1e-6) * g
    // Lines parallel to Z (varying X).
    for (let x = start(bounds.x0); x <= bounds.x1 + 1e-6; x += g) {
      const arr = isMetre(x) ? majorPts : minorPts
      for (const [lo, hi] of spansAt('x', x)) arr.push(x, 0, lo, x, 0, hi)
    }
    // Lines parallel to X (varying Z).
    for (let z = start(bounds.z0); z <= bounds.z1 + 1e-6; z += g) {
      const arr = isMetre(z) ? majorPts : minorPts
      for (const [lo, hi] of spansAt('z', z)) arr.push(lo, 0, z, hi, 0, z)
    }
    const mk = (pts: number[]) => {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      return geo
    }
    return { minor: mk(minorPts), major: mk(majorPts) }
  }, [gridSize, bounds, polygon, rects])
  useDisposeGeometry(minor)
  useDisposeGeometry(major)

  // Fade the grid in/out toward the target (1 while acting, 0 when idle) so it
  // never lingers as a static floor pattern. The room-editor canvas runs a
  // continuous frameloop, so this lerp animates smoothly.
  useFrame((_, dt) => {
    const target = snapEnabled && editing && active ? 1 : 0
    const k = Math.min(1, dt * 10)
    fade.current += (target - fade.current) * k
    const vis = fade.current > 0.01
    if (groupVis.current !== vis) groupVis.current = vis
    if (minorRef.current) minorRef.current.opacity = 0.55 * fade.current
    if (majorRef.current) majorRef.current.opacity = 0.85 * fade.current
  })

  // Never mount in non-editing contexts (the main scene), where there's nothing
  // to align against.
  if (!editing) return null
  return (
    <group position={[0, 0.02, 0]} userData={noExportUserData()}>
      <lineSegments geometry={minor} renderOrder={3}>
        <lineBasicMaterial
          ref={minorRef}
          color="#bcd8f5"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={major} renderOrder={4}>
        <lineBasicMaterial
          ref={majorRef}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  )
}
