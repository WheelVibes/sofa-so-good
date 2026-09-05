import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { useFeature } from '../../features/useFeature'
import { buildMergedCatalog } from '../../furniture/catalog'
import { derivePlumbingPoints } from '../../furniture/mepSuggest'
import { getMetalMaterial } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import { getWallOpacity } from '../walls/wallReveal'
import { neonMaterial } from './fittingMaterials'
import {
  DEFAULT_CEILING_M,
  DRAIN_STUB_DIA_M,
  FLOOR_TRAP_SIZE_M,
  FLOOR_TRAP_Y,
  floorObstacles,
  HEATER_BOX,
  type PlumbingFitting,
  plumbingForRoom,
  resolvePlumbingFittings,
  SOIL_PIPE_DIA_M,
  TAP_DEPTH_M,
  wetRoomTraps,
} from './plumbingModel'

/**
 * PLUMBING-FITTINGS renderer — the floor traps, bib taps, waste stubs, PVC soil stacks and
 * storage water heater `plumbingModel.ts` resolves, drawn as instanced boxes and cylinders.
 * Four materials, a handful of instanced meshes, ~50 primitives for the whole flat; nothing
 * per frame except the orbit wall-fade check, which collapses a WALL-mounted item to zero
 * scale while its host wall is translucent (the same rule `WallFittings.tsx` follows). Floor
 * traps have no host wall and never fade — they lie on the floor, which never fades.
 *
 * Geometry is authored in each fitting's local frame — x along the wall, y up from the
 * fitting's mount height, +z out of the wall into the room — in real metres: a 150 mm square
 * stainless grating, a 100 mm PVC stack floor-to-ceiling, a 50 mm waste stub, a ~90 mm bib
 * tap, a 350 mm heater box.
 *
 * `roomId` scopes the render to one room (`plumbingModel.ts:plumbingForRoom`) — the per-room
 * editor isolates a single room and would otherwise draw every OTHER room's pipework floating
 * around it. Omitted (the main `Scene.tsx` mount) renders every fitting in the plan.
 */
export function PlumbingFittings({ roomId }: { roomId?: string } = {}) {
  const enabled = useFeature('plumbingFittings')
  const plan = useStore((s) => s.floorPlan)
  const persisted = plan.plumbingPoints ?? []
  const items = useStore((s) => s.items)
  const fittings = useMemo(() => {
    if (!enabled) return []
    let resolved: PlumbingFitting[]
    if (persisted.length > 0) {
      resolved = resolvePlumbingFittings(
        plan,
        persisted,
        floorObstacles(items, buildMergedCatalog(useStore.getState())),
      )
    } else {
      const catalog = buildMergedCatalog(useStore.getState())
      const derived = derivePlumbingPoints(items, catalog)
      // A trap under the shower tray is invisible: hand the resolver the floor footprints.
      const obstacles = floorObstacles(items, catalog)
      resolved = resolvePlumbingFittings(
        plan,
        [...derived, ...wetRoomTraps(plan, derived, obstacles)],
        obstacles,
      )
    }
    return roomId ? plumbingForRoom(resolved, plan, roomId) : resolved
  }, [enabled, plan, persisted, items, roomId])
  if (!enabled || fittings.length === 0) return null
  return <PlumbingMeshes fittings={fittings} ceiling={plan.ceilingHeight ?? DEFAULT_CEILING_M} />
}

// ── materials (module-level, shared) ────────────────────────────────────────
type Bucket = 'chrome' | 'dark' | 'pvc' | 'white' | 'neon'
let mats: Record<Bucket, MeshStandardMaterial> | null = null
function materials(): Record<Bucket, MeshStandardMaterial> {
  if (!mats) {
    mats = {
      // Brushed stainless — the satin preset (roughness 0.42, metalness 0.85) is the
      // grating/tap finish, and going through the shared factory gets the brush maps and
      // the no-IBL metalness cap for free.
      chrome: getMetalMaterial('#c9ccd0', 'satin'),
      dark: new MeshStandardMaterial({ color: '#25262a', roughness: 0.8, metalness: 0 }),
      // Unpainted PVC: light warm grey, matte.
      pvc: new MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.6, metalness: 0 }),
      white: new MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.35, metalness: 0 }),
      neon: neonMaterial(),
    }
  }
  return mats
}

/** One primitive in a fitting's local frame: centre (x, y, z) + size (w, h, d). */
interface Part {
  bucket: Bucket
  geo: 'box' | 'cyl'
  c: [number, number, number]
  s: [number, number, number]
}

/** A 150 mm stainless grating lying on the floor, with a 3 × 3 grid of dark slots on top. */
function floorTrap(): Part[] {
  const S = FLOOR_TRAP_SIZE_M
  const parts: Part[] = [
    // Contact seam on the tile, so a metre-scale AO kernel is not the only thing grounding it.
    { bucket: 'dark', geo: 'box', c: [0, -FLOOR_TRAP_Y / 2, 0], s: [S + 0.012, 0.001, S + 0.012] },
    { bucket: 'chrome', geo: 'box', c: [0, 0, 0], s: [S, 0.003, S] },
  ]
  const step = 0.042
  for (const gx of [-step, 0, step])
    for (const gz of [-step, 0, step])
      parts.push({ bucket: 'dark', geo: 'box', c: [gx, 0.0018, gz], s: [0.03, 0.001, 0.03] })
  return parts
}

/** Bib tap / angle valve: wall flange, chrome barrel out of the wall, downturned spout, lever. */
function bibTap(): Part[] {
  const face = -TAP_DEPTH_M / 2
  const parts: Part[] = [
    // Flange and barrel lie ALONG the wall normal, so the unit cylinder (y axis) is scaled
    // flat in y and wide in x/z — a disc — for the flange, and the barrel is a stubby disc too.
    { bucket: 'chrome', geo: 'cyl', c: [0, 0, face + 0.006], s: [0.05, 0.012, 0.05] },
    { bucket: 'chrome', geo: 'box', c: [0, 0, face + 0.04], s: [0.03, 0.03, 0.062] },
    { bucket: 'chrome', geo: 'cyl', c: [0, -0.038, face + 0.071], s: [0.022, 0.06, 0.022] },
    { bucket: 'chrome', geo: 'box', c: [0, 0.03, face + 0.03], s: [0.055, 0.012, 0.014] },
  ]
  return parts
}

/** Floor waste at the wall/floor junction: a small gully plus a short PVC riser. */
function drainStub(): Part[] {
  const D = DRAIN_STUB_DIA_M
  return [
    { bucket: 'chrome', geo: 'box', c: [0, 0.0015, 0], s: [0.09, 0.003, 0.09] },
    { bucket: 'pvc', geo: 'cyl', c: [0, 0.19, 0], s: [D, 0.38, D] },
    { bucket: 'pvc', geo: 'cyl', c: [0, 0.38, 0], s: [D + 0.014, 0.03, D + 0.014] },
  ]
}

/** 100 mm PVC soil stack, floor to ceiling, with two collars. */
function soilPipe(ceiling: number): Part[] {
  const D = SOIL_PIPE_DIA_M
  const h = Math.max(1, ceiling)
  return [
    { bucket: 'pvc', geo: 'cyl', c: [0, h / 2, 0], s: [D, h, D] },
    { bucket: 'pvc', geo: 'cyl', c: [0, 0.2, 0], s: [D + 0.016, 0.05, D + 0.016] },
    { bucket: 'pvc', geo: 'cyl', c: [0, h - 0.35, 0], s: [D + 0.016, 0.05, D + 0.016] },
  ]
}

/** HDB storage water heater: a white box with a control strip and a red power lamp. */
function waterHeater(): Part[] {
  const { w, h, d } = HEATER_BOX
  return [
    { bucket: 'white', geo: 'box', c: [0, 0, 0], s: [w, h, d] },
    {
      bucket: 'dark',
      geo: 'box',
      c: [0, -h / 2 + 0.06, d / 2 + 0.001],
      s: [w - 0.08, 0.03, 0.004],
    },
    {
      bucket: 'neon',
      geo: 'box',
      c: [w / 2 - 0.07, -h / 2 + 0.06, d / 2 + 0.004],
      s: [0.012, 0.012, 0.004],
    },
    // The 15 mm inlet/outlet nipples under the tank.
    { bucket: 'chrome', geo: 'cyl', c: [-0.08, -h / 2 - 0.03, 0], s: [0.016, 0.06, 0.016] },
    { bucket: 'chrome', geo: 'cyl', c: [0.08, -h / 2 - 0.03, 0], s: [0.016, 0.06, 0.016] },
  ]
}

function partsFor(kind: PlumbingFitting['kind'], ceiling: number): Part[] {
  switch (kind) {
    case 'floor-trap':
      return floorTrap()
    case 'water-point':
      return bibTap()
    case 'drainage':
      return drainStub()
    case 'soil-pipe':
      return soilPipe(ceiling)
    default:
      return waterHeater()
  }
}

function PlumbingMeshes({ fittings, ceiling }: { fittings: PlumbingFitting[]; ceiling: number }) {
  const m = materials()
  const built = useMemo(() => {
    const buckets = new Map<string, { fitting: number; m: Matrix4 }[]>()
    const scratch = new Object3D()
    const q = new Quaternion()
    const local = new Matrix4()
    fittings.forEach((f, i) => {
      scratch.position.set(f.x, f.y, f.z)
      scratch.rotation.set(0, f.yaw, 0)
      scratch.updateMatrix()
      for (const p of partsFor(f.kind, ceiling)) {
        local.compose(new Vector3(...p.c), q.identity(), new Vector3(...p.s))
        const key = `${p.bucket}|${p.geo}`
        const list = buckets.get(key) ?? []
        list.push({ fitting: i, m: new Matrix4().multiplyMatrices(scratch.matrix, local) })
        buckets.set(key, list)
      }
    })
    const box: BufferGeometry = new BoxGeometry(1, 1, 1)
    // Unit cylinder: radius 0.5, height 1 — scaled per instance to (diameter, height, diameter).
    const cyl: BufferGeometry = new CylinderGeometry(0.5, 0.5, 1, 14)
    const meshes = [...buckets.entries()].map(([key, list]) => {
      const [bucket, geoKind] = key.split('|') as [Bucket, 'box' | 'cyl']
      const mat: Material = m[bucket]
      const mesh = new InstancedMesh(geoKind === 'box' ? box : cyl, mat, Math.max(1, list.length))
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
    return { box, cyl, meshes }
  }, [fittings, ceiling, m])

  useEffect(
    () => () => {
      built.box.dispose()
      built.cyl.dispose()
    },
    [built],
  )

  // Orbit wall-fade: hide a WALL-mounted item while its host wall is translucent. Floor traps
  // (wallId null) stay put — the floor never fades.
  const hidden = useRef<Set<number>>(new Set())
  const zero = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    const next = new Set<number>()
    fittings.forEach((f, i) => {
      if (f.wallId !== null && getWallOpacity(f.wallId) < 0.985) next.add(i)
    })
    const changed =
      next.size !== hidden.current.size || [...next].some((i) => !hidden.current.has(i))
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
    <group name="plumbing-fittings">
      {built.meshes.map(({ mesh }, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
