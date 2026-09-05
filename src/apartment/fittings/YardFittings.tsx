import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  InstancedMesh,
  type Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from 'three'
import { useFeature } from '../../features/useFeature'
import { buildMergedCatalog } from '../../furniture/catalog'
import { derivePlumbingPoints } from '../../furniture/mepSuggest'
import { getMetalMaterial } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import {
  floorObstacles,
  type PlumbingFitting,
  resolvePlumbingFittings,
  wetRoomTraps,
} from './plumbingModel'
import {
  resolveYardFittings,
  type YardFittingSet,
  yardFittingsForRoom,
  yardWashers,
} from './yardModel'

/**
 * YARD-FITTINGS renderer — the washing machine's two hoses and the ceiling laundry rack that
 * `yardModel.ts` resolves. Two `TubeGeometry` sweeps (one draw each; a yard has one machine)
 * plus a handful of instanced boxes/cylinders for the rack, over three shared module-level
 * materials, mirroring `PlumbingFittings.tsx`.
 *
 * NO wall-fade handling here, deliberately: every part of this feature hangs off the FLOOR (the
 * machine, the trap) or the CEILING (the rack), and neither fades in orbit. `PlumbingFittings`
 * collapses only its WALL-mounted items; the bib tap this hose runs from is one of those and
 * handles itself. A hose is 0.3 m long and lives inside the machine's own silhouette, so
 * following the tap into hiding would cost a per-frame check for nothing visible.
 *
 * `roomId` scopes the render to one room for the per-room editor (EDITOR-LOCKSTEP).
 */
export function YardFittings({ roomId }: { roomId?: string } = {}) {
  const enabled = useFeature('yardFittings')
  const plan = useStore((s) => s.floorPlan)
  const persisted = plan.plumbingPoints ?? []
  const items = useStore((s) => s.items)
  const set = useMemo<YardFittingSet>(() => {
    if (!enabled) return { hoses: [], rack: [] }
    const catalog = buildMergedCatalog(useStore.getState())
    const obstacles = floorObstacles(items, catalog)
    let plumbing: PlumbingFitting[]
    if (persisted.length > 0) {
      plumbing = resolvePlumbingFittings(plan, persisted, obstacles)
    } else {
      const derived = derivePlumbingPoints(items, catalog)
      plumbing = resolvePlumbingFittings(
        plan,
        [...derived, ...wetRoomTraps(plan, derived, obstacles)],
        obstacles,
      )
    }
    const resolved = resolveYardFittings(plan, plumbing, yardWashers(items, catalog))
    return roomId ? yardFittingsForRoom(resolved, roomId) : resolved
  }, [enabled, plan, persisted, items, roomId])
  if (!enabled || (set.hoses.length === 0 && set.rack.length === 0)) return null
  return <YardMeshes set={set} />
}

// ── materials (module-level, shared) ────────────────────────────────────────
type Bucket = 'braid' | 'corrugated' | 'alu' | 'cord'
let mats: Record<Bucket, MeshStandardMaterial> | null = null
function materials(): Record<Bucket, MeshStandardMaterial> {
  if (!mats) {
    mats = {
      // Braided steel sleeve — the satin metal preset, one shade darker than the chrome tap it
      // screws onto so the two read as different objects at walking distance.
      braid: getMetalMaterial('#9ea3a8', 'satin'),
      // Corrugated PVC drain hose: dark, matte, no texture (the fatter radius carries the read).
      corrugated: new MeshStandardMaterial({ color: '#4a4d52', roughness: 0.85, metalness: 0 }),
      alu: getMetalMaterial('#c8ccd1', 'satin'),
      cord: new MeshStandardMaterial({ color: '#3a3d42', roughness: 0.9, metalness: 0 }),
    }
  }
  return mats
}

/** Tube resolution: enough segments for a 0.3–0.6 m hose to read as smooth, no more. */
const TUBE_SEGMENTS = 20
const TUBE_RADIAL = 8

function YardMeshes({ set }: { set: YardFittingSet }) {
  const m = materials()
  const built = useMemo(() => {
    const tubes = set.hoses.map((h) => {
      const curve = new CatmullRomCurve3(h.points.map((p) => new Vector3(...p)))
      const geo = new TubeGeometry(curve, TUBE_SEGMENTS, h.radius, TUBE_RADIAL, false)
      const mesh = new Mesh(geo, h.kind === 'inlet' ? m.braid : m.corrugated)
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      return mesh
    })
    // Rack: bucket by material + geometry so brackets, poles and cords are three draws.
    const buckets = new Map<string, Matrix4[]>()
    const scratch = new Object3D()
    for (const p of set.rack) {
      scratch.position.set(...p.c)
      scratch.rotation.set(...p.rot)
      scratch.scale.set(...p.s)
      scratch.updateMatrix()
      const bucket: Bucket = p.kind === 'cord' ? 'cord' : 'alu'
      const key = `${bucket}|${p.geo}`
      const list = buckets.get(key) ?? []
      list.push(scratch.matrix.clone())
      buckets.set(key, list)
    }
    const box: BufferGeometry = new BoxGeometry(1, 1, 1)
    // Unit cylinder: radius 0.5, height 1 — scaled per instance to (diameter, length, diameter).
    const cyl: BufferGeometry = new CylinderGeometry(0.5, 0.5, 1, 12)
    const rack = [...buckets.entries()].map(([key, list]) => {
      const [bucket, geoKind] = key.split('|') as [Bucket, 'box' | 'cyl']
      const mesh = new InstancedMesh(geoKind === 'box' ? box : cyl, m[bucket], list.length)
      list.forEach((mat, i) => {
        mesh.setMatrixAt(i, mat)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      return mesh
    })
    return { tubes, rack, box, cyl }
  }, [set, m])

  useEffect(
    () => () => {
      for (const t of built.tubes) t.geometry.dispose()
      built.box.dispose()
      built.cyl.dispose()
    },
    [built],
  )

  return (
    <group name="yard-fittings">
      {built.tubes.map((mesh, i) => (
        <primitive key={`hose-${i}`} object={mesh} />
      ))}
      {built.rack.map((mesh, i) => (
        <primitive key={`rack-${i}`} object={mesh} />
      ))}
    </group>
  )
}
