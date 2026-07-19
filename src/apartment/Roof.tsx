import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type MeshStandardMaterial,
  Vector3,
} from 'three'
import { useFeature } from '../features/useFeature'
import { planLevels } from '../floorplan/levels'
import {
  buildRoofModel,
  type DormerBox,
  outerFootprintBounds,
  type RoofModel,
  type Vec3,
} from '../floorplan/roofModel'
import type { FloorPlan, RoofMaterialKind } from '../floorplan/types'
import { useStore } from '../state/store'

/** Procedural roof-surface colours (no external asset). */
const ROOF_COLORS: Record<
  RoofMaterialKind,
  { color: string; roughness: number; metalness: number }
> = {
  'clay-tile': { color: '#8f4b39', roughness: 0.82, metalness: 0 },
  'metal-seam': { color: '#5b6066', roughness: 0.42, metalness: 0.55 },
}
/** Dormer walls + parapet — a neutral off-white render, like a plastered wall. */
const TRIM_COLOR = '#e4dfd5'
/** Below this look-down slope (camera forward Y) an orbit is "looking into" the
 *  dollhouse from above → fade the roof so the interior stays visible. A shallow
 *  exterior orbit (forward Y above this) keeps the roof solid so it reads as a
 *  roof. Tuned so the elevated 3/4 home view fades but a low facade orbit shows. */
const ROOF_HIDE_LOOKDOWN = -0.35
/** Scratch for the camera forward direction (avoids per-frame allocation). */
const FWD = new Vector3()

/** Fan-triangulate a convex polygon into a flat position triple stream. */
function fanTriangles(points: Vec3[], out: number[]): void {
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0]
    const b = points[i]
    const c = points[i + 1]
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }
}

/** Build a BufferGeometry from a set of convex roof polygons (both sides shown,
 *  so winding needn't be perfect — the material is DoubleSide). */
function planesGeometry(planes: { points: Vec3[] }[]): BufferGeometry | null {
  const pos: number[] = []
  for (const p of planes) fanTriangles(p.points, pos)
  if (pos.length === 0) return null
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return g
}

/** A gable-dormer cap: two slopes ridging along the depth (front↔back), so the
 *  triangular gable faces outward. Built in world space around the dormer box. */
function dormerCapGeometry(d: DormerBox): BufferGeometry {
  const topY = d.baseY + d.height
  const ridgeY = topY + d.gableRise
  const isXRun = d.facing === 'N' || d.facing === 'S'
  const pos: number[] = []
  if (isXRun) {
    // Width runs along X, ridge runs along Z at x = cx.
    const x0 = d.cx - d.width / 2
    const x1 = d.cx + d.width / 2
    const z0 = d.cz - d.depth / 2
    const z1 = d.cz + d.depth / 2
    const push = (p: Vec3, q: Vec3, r: Vec3) =>
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2])
    // West slope (x0 → ridge).
    push([x0, topY, z0], [x0, topY, z1], [d.cx, ridgeY, z1])
    push([x0, topY, z0], [d.cx, ridgeY, z1], [d.cx, ridgeY, z0])
    // East slope (x1 → ridge).
    push([x1, topY, z1], [x1, topY, z0], [d.cx, ridgeY, z0])
    push([x1, topY, z1], [d.cx, ridgeY, z0], [d.cx, ridgeY, z1])
    // Front + back gable triangles.
    push([x0, topY, z1], [x1, topY, z1], [d.cx, ridgeY, z1])
    push([x1, topY, z0], [x0, topY, z0], [d.cx, ridgeY, z0])
  } else {
    // Depth runs along X, ridge runs along X at z = cz.
    const z0 = d.cz - d.width / 2
    const z1 = d.cz + d.width / 2
    const x0 = d.cx - d.depth / 2
    const x1 = d.cx + d.depth / 2
    const push = (p: Vec3, q: Vec3, r: Vec3) =>
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2])
    push([x0, topY, z0], [x1, topY, z0], [x1, ridgeY, d.cz])
    push([x0, topY, z0], [x1, ridgeY, d.cz], [x0, ridgeY, d.cz])
    push([x1, topY, z1], [x0, topY, z1], [x0, ridgeY, d.cz])
    push([x1, topY, z1], [x0, ridgeY, d.cz], [x1, ridgeY, d.cz])
    push([x1, topY, z0], [x1, topY, z1], [x1, ridgeY, d.cz])
    push([x0, topY, z1], [x0, topY, z0], [x0, ridgeY, d.cz])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return g
}

/** Resolve the roof model for the plan's TOP storey (or null when off / absent /
 *  degenerate footprint). */
function useRoofModel(plan: FloorPlan): RoofModel | null {
  return useMemo(() => {
    if (!plan.roof) return null
    const levels = planLevels(plan)
    const top = levels[levels.length - 1]
    const baseY = top.elevation + (top.ceilingHeight ?? plan.ceilingHeight)
    const bounds = outerFootprintBounds(top.walls)
    const model = buildRoofModel(bounds, baseY, plan.roof)
    return model.fallback ? null : model
  }, [plan])
}

/**
 * Parametric roof over the top storey (UX research round 3, `parametricRoof`
 * pro flag). Renders the pure `roofModel.ts` geometry — pitched planes, parapet
 * ring, and gable dormers — in world space above the top storey's walls.
 *
 * Like the real ceiling, the roof must never block the dollhouse view: it FADES
 * OUT in orbit mode (the same camera-mode cue the wall reveal uses) so you can
 * look inside, and stays solid in walk mode. The material is DoubleSide, so a
 * first-person walker inside sees the underside.
 */
export function Roof({ plan }: { plan: FloorPlan }) {
  const enabled = useFeature('parametricRoof')
  const cameraMode = useStore((s) => s.cameraMode)
  const model = useRoofModel(plan)
  const groupVisibleRef = useRef(true)
  const opacityRef = useRef(1)
  const { camera, invalidate } = useThree()

  const roofGeom = useMemo(() => (model ? planesGeometry(model.planes) : null), [model])
  const dormerCaps = useMemo(
    () => (model ? model.dormers.map((d) => ({ d, geom: dormerCapGeometry(d) })) : []),
    [model],
  )

  // Fade the roof out when the orbit camera is looking DOWN into the dollhouse
  // (so the interior stays visible — the same "see inside" intent as the culled
  // ceiling); keep it solid for a shallow exterior orbit and in walk mode (where
  // a first-person walker inside sees the DoubleSide underside). One opacity
  // value drives EVERY roof material (planes + parapet + dormer boxes/caps) by
  // traversing the group, so no opaque piece is left behind mid-fade.
  const grpRef = useRef<import('three').Group>(null)
  useFrame(() => {
    const grp = grpRef.current
    if (!grp) return
    camera.getWorldDirection(FWD)
    const lookingIntoDollhouse = cameraMode === 'orbit' && FWD.y < ROOF_HIDE_LOOKDOWN
    const target = lookingIntoDollhouse ? 0 : 1
    const cur = opacityRef.current
    const next = cur + (target - cur) * 0.18
    opacityRef.current = next
    const transparent = next < 0.98
    grp.traverse((obj) => {
      const m = (obj as { material?: MeshStandardMaterial }).material
      if (!m) return
      m.opacity = next
      if (transparent !== m.transparent) m.needsUpdate = true
      m.transparent = transparent
      // Don't write depth while translucent, so the orbit camera sees straight
      // through the fading roof into the interior (no z-occlusion).
      m.depthWrite = !transparent
    })
    // Fully hide once faded so it never occludes the dollhouse.
    const vis = next > 0.02
    let flipped = false
    if (vis !== groupVisibleRef.current) {
      groupVisibleRef.current = vis
      grp.visible = vis
      flipped = true
    }
    // Keep rendering until the fade settles; force one more frame when the
    // group's visibility just flipped so the change actually reaches the screen.
    if (flipped || Math.abs(next - target) > 0.005) invalidate()
  })

  if (!enabled || !model) return null
  const rc = ROOF_COLORS[model.material]

  return (
    <group ref={grpRef}>
      {roofGeom ? (
        <mesh geometry={roofGeom} castShadow receiveShadow>
          <meshStandardMaterial
            color={rc.color}
            roughness={rc.roughness}
            metalness={rc.metalness}
            side={DoubleSide}
            transparent
            opacity={1}
          />
        </mesh>
      ) : null}

      {/* Parapet ring (flat-parapet) — low walls around the slab. */}
      {model.parapets.map((p, i) => (
        <mesh
          key={`par-${i}`}
          position={[p.cx, model.baseY + p.height / 2, p.cz]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[p.w, p.height, p.d]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.9} transparent opacity={1} />
        </mesh>
      ))}

      {/* Dormers — a wall box + a little gable cap that breaks the slope. */}
      {model.dormers.map((d, i) => (
        <group key={`dorm-${i}`}>
          <mesh position={[d.cx, d.baseY + d.height / 2, d.cz]} castShadow receiveShadow>
            <boxGeometry
              args={[
                d.facing === 'N' || d.facing === 'S' ? d.width : d.depth,
                d.height,
                d.facing === 'N' || d.facing === 'S' ? d.depth : d.width,
              ]}
            />
            <meshStandardMaterial color={TRIM_COLOR} roughness={0.9} transparent opacity={1} />
          </mesh>
          <mesh geometry={dormerCaps[i]?.geom} castShadow receiveShadow>
            <meshStandardMaterial
              color={rc.color}
              roughness={rc.roughness}
              metalness={rc.metalness}
              side={DoubleSide}
              transparent
              opacity={1}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
