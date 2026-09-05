import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { useFeature } from '../../features/useFeature'
import { buildMergedCatalog } from '../../furniture/catalog'
import { deriveElectricalPoints } from '../../furniture/mepSuggest'
import { useStore } from '../../state/store'
import { getWallOpacity } from '../walls/wallReveal'
import { neonMaterial } from './fittingMaterials'
import {
  DB_BOX,
  fittingsForRoom,
  generalSockets,
  PLATE_DEPTH_M,
  resolveWallFittings,
  type WallFitting,
} from './fittingModel'

/**
 * WALL-FITTINGS renderer — switches, sockets, points and the DB box as instanced boxes on
 * the wall faces `wallFittings.ts` resolves. Two materials, five instanced meshes, ~60
 * boxes for the whole flat; nothing per frame except the orbit wall-fade check, which
 * collapses a plate to zero scale while its host wall is translucent (an opaque plate on a
 * faded wall reads as floating hardware — the same reason `Window.tsx` culls its grille).
 *
 * The pure model is `fittingModel.ts`; the plate geometry is authored in a local frame: x along the wall, y up, +z out of the
 * wall into the room. Real sizes: SS 638 / BS 4662 plates 86 × 86 mm, a double socket
 * 146 × 86, an HDB DB enclosure ~400 × 300.
 *
 * `roomId` scopes the render to one room (`fittingModel.ts:fittingsForRoom`) — the per-room
 * editor (`RoomEditorScene`) isolates a single room, and an unscoped fitting list would draw
 * every OTHER room's switches/sockets/DB box floating in the void around it. Omitted (the main
 * `Scene.tsx` mount) renders every fitting in the plan, unchanged.
 */
export function WallFittings({ roomId }: { roomId?: string } = {}) {
  const enabled = useFeature('wallFittings')
  const plan = useStore((s) => s.floorPlan)
  const persisted = plan.electricalPoints ?? []
  // Derived only when the plan carries no MEP layer of its own — a user who placed
  // points sees exactly those.
  const items = useStore((s) => s.items)
  const fittings = useMemo(() => {
    if (!enabled) return []
    let resolved: WallFitting[]
    if (persisted.length > 0) {
      resolved = resolveWallFittings(plan, persisted)
    } else {
      const derived = deriveElectricalPoints(plan, items, buildMergedCatalog(useStore.getState()))
      resolved = resolveWallFittings(plan, [...derived, ...generalSockets(plan, derived)])
    }
    return roomId ? fittingsForRoom(resolved, plan, roomId) : resolved
  }, [enabled, plan, persisted, items, roomId])
  if (!enabled || fittings.length === 0) return null
  return <FittingMeshes fittings={fittings} />
}

// ── materials (module-level, shared) ────────────────────────────────────────
let mats: {
  plastic: MeshStandardMaterial
  dark: MeshStandardMaterial
  neon: MeshStandardMaterial
  rim: MeshStandardMaterial
} | null = null
function materials() {
  if (!mats) {
    mats = {
      // Glossy white polycarbonate — the specular lobe is what makes a white plate read on
      // a white wall; at roughness 0.45 the first real-GPU frame showed a switch beside a
      // bedroom door as a faint outline and nothing more.
      plastic: new MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.28, metalness: 0 }),
      dark: new MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.7, metalness: 0 }),
      // Contact-shadow rim under every plate: a metre-scale AO kernel cannot see an 11 mm
      // plate, so the 4 mm of shadow a real plate casts on the wall is drawn explicitly.
      rim: new MeshStandardMaterial({ color: '#5f5d58', roughness: 0.9, metalness: 0 }),
      neon: neonMaterial(),
    }
  }
  return mats
}

/** One box in a plate's local frame: centre (x, y, z) + size (w, h, d). */
interface Part {
  bucket: 'plastic' | 'dark' | 'neon' | 'rim'
  c: [number, number, number]
  s: [number, number, number]
}

const PLATE = 0.086
const T = PLATE_DEPTH_M
function plate(w = PLATE, h = PLATE): Part[] {
  return [
    { bucket: 'rim', c: [0, 0, -T / 2 + 0.0005], s: [w + 0.012, h + 0.012, 0.001] },
    { bucket: 'plastic', c: [0, 0, 0], s: [w, h, T] },
  ]
}
function rocker(x: number, w = 0.03, h = 0.06): Part[] {
  // The rocker's own shadow seam, then the rocker proud of the plate.
  return [
    { bucket: 'rim', c: [x, 0, T / 2 + 0.0005], s: [w + 0.004, h + 0.004, 0.001] },
    { bucket: 'plastic', c: [x, 0, T / 2 + 0.002], s: [w, h, 0.004] },
  ]
}
function socketFace(x: number): Part[] {
  // BS 1363 13 A: two live/neutral slots low, earth slot high, plus the SG rocker switch.
  return [
    { bucket: 'dark', c: [x - 0.011, -0.006, T / 2 + 0.0005], s: [0.007, 0.014, 0.001] },
    { bucket: 'dark', c: [x + 0.011, -0.006, T / 2 + 0.0005], s: [0.007, 0.014, 0.001] },
    { bucket: 'dark', c: [x, 0.012, T / 2 + 0.0005], s: [0.014, 0.007, 0.001] },
    { bucket: 'plastic', c: [x + 0.03, 0.028, T / 2 + 0.002], s: [0.012, 0.018, 0.004] },
  ]
}

function partsFor(kind: WallFitting['kind']): Part[] {
  switch (kind) {
    case 'switch':
      return [...plate(), ...rocker(0)]
    case 'socket':
      return [...plate(), ...socketFace(0)]
    case 'socket-double':
      return [...plate(0.146, PLATE), ...socketFace(-0.033), ...socketFace(0.033)]
    case 'data':
      return [...plate(), { bucket: 'dark', c: [0, 0, T / 2 + 0.0005], s: [0.02, 0.012, 0.001] }]
    case 'tv-point':
      return [
        ...plate(),
        { bucket: 'dark', c: [0, 0.004, T / 2 + 0.0005], s: [0.012, 0.012, 0.001] },
      ]
    case 'aircon':
      return [...plate(), ...rocker(-0.012, 0.022, 0.05), ...rocker(0.014, 0.022, 0.05)]
    case 'water-heater':
      return [
        ...plate(),
        ...rocker(-0.008, 0.03, 0.05),
        { bucket: 'neon', c: [0.028, 0.02, T / 2 + 0.001], s: [0.006, 0.006, 0.002] },
      ]
    case 'db-box':
      return [
        {
          bucket: 'rim',
          c: [0, 0, -DB_BOX.d / 2 + 0.0005],
          s: [DB_BOX.w + 0.012, DB_BOX.h + 0.012, 0.001],
        },
        { bucket: 'plastic', c: [0, 0, 0], s: [DB_BOX.w, DB_BOX.h, DB_BOX.d] },
        // Door seam and a hinge line read as an enclosure rather than a slab.
        { bucket: 'dark', c: [0, 0, DB_BOX.d / 2 + 0.0005], s: [DB_BOX.w - 0.04, 0.002, 0.001] },
        {
          bucket: 'dark',
          c: [-DB_BOX.w / 2 + 0.025, 0, DB_BOX.d / 2 + 0.0005],
          s: [0.002, DB_BOX.h - 0.04, 0.001],
        },
      ]
    default:
      return plate()
  }
}

function FittingMeshes({ fittings }: { fittings: WallFitting[] }) {
  const m = materials()
  const built = useMemo(() => {
    const buckets: Record<Part['bucket'], { fitting: number; m: Matrix4 }[]> = {
      plastic: [],
      dark: [],
      neon: [],
      rim: [],
    }
    const scratch = new Object3D()
    const q = new Quaternion()
    const local = new Matrix4()
    fittings.forEach((f, i) => {
      scratch.position.set(f.x, f.y, f.z)
      scratch.rotation.set(0, f.yaw, 0)
      scratch.updateMatrix()
      for (const p of partsFor(f.kind)) {
        local.compose(new Vector3(...p.c), q.identity(), new Vector3(...p.s))
        buckets[p.bucket].push({
          fitting: i,
          m: new Matrix4().multiplyMatrices(scratch.matrix, local),
        })
      }
    })
    const geo = new BoxGeometry(1, 1, 1)
    const meshes = (Object.keys(buckets) as Part['bucket'][]).map((b) => {
      const list = buckets[b]
      const mesh = new InstancedMesh(geo, m[b], Math.max(1, list.length))
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, e.m)
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      return { mesh, list }
    })
    return { geo, meshes }
  }, [fittings, m])

  useEffect(() => () => built.geo.dispose(), [built])

  // Orbit wall-fade: hide a plate while its host wall is translucent.
  const hidden = useRef<Set<number>>(new Set())
  const zero = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    let changed = false
    const next = new Set<number>()
    fittings.forEach((f, i) => {
      if (getWallOpacity(f.wallId) < 0.985) next.add(i)
    })
    if (next.size !== hidden.current.size || [...next].some((i) => !hidden.current.has(i)))
      changed = true
    if (!changed) return
    hidden.current = next
    for (const { mesh, list } of built.meshes) {
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, next.has(e.fitting) ? zero : e.m)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group name="wall-fittings">
      {built.meshes.map(({ mesh }, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
