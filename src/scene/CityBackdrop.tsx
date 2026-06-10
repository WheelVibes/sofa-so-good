import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { mulberry32 } from '../materials/procedural/noise'
import { useBackdropOffset } from './backdropOffset'
import { useDisposeOnUnmount } from './geometryUtil'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'

/**
 * Distant HDB-estate backdrop — the neighbouring blocks you always see out an
 * HDB window. Two concentric rings of towers (one shared unit-box geometry,
 * **instanced** into a handful of draw calls) plus rooftop water-tanks / lift
 * cores and a far ground plane, rendered cheaply: no shadows, a few shared
 * materials, one procedural façade texture with floor banding + window sills.
 * Window emissive ramps up at night via the shared sky-darkness signal, so the
 * skyline reads as lit windows after dark — at near-zero per-frame cost.
 */

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

const TEX_W = 128
const TEX_H = 256
const GRID_COLS = 4
const GRID_ROWS = 8

/** Window-cell geometry shared by the albedo and every emissive variant so
 *  lit windows line up exactly with the recessed glazing. */
function windowCells(): { x: number; y: number; w: number; h: number }[] {
  const mx = TEX_W * 0.12
  const my = TEX_H * 0.06
  const gw = (TEX_W - mx * 2) / GRID_COLS
  const gh = (TEX_H - my * 2) / GRID_ROWS
  const ww = gw * 0.64
  const wh = gh * 0.6
  const cells: { x: number; y: number; w: number; h: number }[] = []
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      cells.push({ x: mx + c * gw + (gw - ww) / 2, y: my + r * gh + (gh - wh) / 2, w: ww, h: wh })
    }
  }
  return cells
}

function repeatTexture(canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const tex = new CanvasTexture(canvas)
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(4, 6)
  return tex
}

/** Shared concrete façade: tonal floor banding, recessed glazing with a lit
 *  upper edge + a darker AC-ledge sill — the texture that sells "HDB block"
 *  even at distance. */
function makeAlbedo(cells: ReturnType<typeof windowCells>): CanvasTexture {
  const a = document.createElement('canvas')
  a.width = TEX_W
  a.height = TEX_H
  const ac = a.getContext('2d')!
  ac.fillStyle = '#9498a0'
  ac.fillRect(0, 0, TEX_W, TEX_H)
  // Faint horizontal floor banding (every row) for storey rhythm.
  const my = TEX_H * 0.06
  const gh = (TEX_H - my * 2) / GRID_ROWS
  for (let r = 0; r <= GRID_ROWS; r++) {
    ac.fillStyle = 'rgba(60,66,74,0.16)'
    ac.fillRect(0, Math.round(my + r * gh) - 1, TEX_W, 2)
  }
  for (const cell of cells) {
    // Recessed glazing.
    ac.fillStyle = '#384350'
    ac.fillRect(cell.x, cell.y, cell.w, cell.h)
    // Lit upper reveal (sky reflection) + darker AC-ledge sill below.
    ac.fillStyle = 'rgba(190,205,220,0.5)'
    ac.fillRect(cell.x, cell.y, cell.w, 1.5)
    ac.fillStyle = 'rgba(40,46,54,0.65)'
    ac.fillRect(cell.x - 1, cell.y + cell.h, cell.w + 2, 2)
  }
  return repeatTexture(a, true)
}

/** One night-lighting variant: a different random subset of windows lit warm
 *  (a few cool), so neighbouring blocks don't share an identical pattern. */
function makeEmissive(cells: ReturnType<typeof windowCells>, seed: number): CanvasTexture {
  const e = document.createElement('canvas')
  e.width = TEX_W
  e.height = TEX_H
  const ec = e.getContext('2d')!
  ec.fillStyle = '#000000'
  ec.fillRect(0, 0, TEX_W, TEX_H)
  const rnd = mulberry32(seed)
  for (const cell of cells) {
    const roll = rnd()
    if (roll < 0.42) {
      ec.fillStyle = roll < 0.1 ? '#cfe0ff' : '#ffd49a'
      ec.fillRect(cell.x, cell.y, cell.w, cell.h)
    }
  }
  return repeatTexture(e, false)
}

interface Block {
  x: number
  z: number
  w: number
  d: number
  h: number
  rot: number
  mat: number
  /** Rooftop detail box (water tank / lift core): dims + offset, or null. */
  tank: { w: number; d: number; h: number; ox: number; oz: number } | null
}

/**
 * Two deterministic rings of blocks around the flat: a nearer ring of mid-rise
 * slabs and a farther ring of taller towers for depth, with a wide gap left
 * clear so the skyline doesn't feel like a solid wall.
 */
/** Keep every building's footprint at least this far (m) from the apartment
 *  centre. The dollhouse camera fits the flat at ~23 m out; without a clearing a
 *  wide near-ring block (inner edge ~9 m) sits between the camera and the flat
 *  and occludes it as you orbit. This guarantees the apartment is always visible
 *  — the city ringed around an open plaza. */
const BUILD_CLEAR = 30

function makeBlocks(): Block[] {
  const rnd = mulberry32(0xb10c)
  const blocks: Block[] = []
  const ring = (count: number, rMin: number, rSpan: number, hMin: number, hSpan: number) => {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.18
      let radius = rMin + rnd() * rSpan
      const w = 16 + rnd() * 34
      const d = 14 + rnd() * 26
      // Push the block out so its whole footprint clears the plaza radius (use a
      // conservative half-diagonal so any rotation still clears).
      const halfDiag = 0.5 * Math.hypot(w, d)
      radius = Math.max(radius, BUILD_CLEAR + halfDiag)
      const x = CX + Math.cos(ang) * radius
      const z = CZ + Math.sin(ang) * radius
      const h = hMin + rnd() * hSpan
      const rot = -ang + (rnd() - 0.5) * 0.6
      // Most blocks carry a rooftop tank/lift-core; the odd one stays flat.
      const tank =
        rnd() < 0.78
          ? {
              w: w * (0.18 + rnd() * 0.18),
              d: d * (0.18 + rnd() * 0.18),
              h: 2 + rnd() * 3.5,
              ox: (rnd() - 0.5) * w * 0.4,
              oz: (rnd() - 0.5) * d * 0.4,
            }
          : null
      blocks.push({ x, z, w, d, h, rot, mat: i % 3, tank })
    }
  }
  ring(22, 34, 46, 26, 64) // near mid-rise
  ring(18, 84, 60, 44, 70) // far towers
  return blocks
}

const SCRATCH_M = new Matrix4()
const SCRATCH_Q = new Quaternion()
const SCRATCH_P = new Vector3()
const SCRATCH_S = new Vector3()
const Y_AXIS = new Vector3(0, 1, 0)

/** An instanced batch of unit boxes placed by (position, Y-rotation, scale). */
function InstancedBatch({
  geometry,
  material,
  instances,
}: {
  geometry: BoxGeometry
  material: MeshStandardMaterial
  instances: {
    px: number
    py: number
    pz: number
    rot: number
    sx: number
    sy: number
    sz: number
  }[]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < instances.length; i++) {
      const it = instances[i]!
      SCRATCH_P.set(it.px, it.py, it.pz)
      SCRATCH_Q.setFromAxisAngle(Y_AXIS, it.rot)
      SCRATCH_S.set(it.sx, it.sy, it.sz)
      SCRATCH_M.compose(SCRATCH_P, SCRATCH_Q, SCRATCH_S)
      mesh.setMatrixAt(i, SCRATCH_M)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}

export function CityBackdrop() {
  const geom = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const blocks = useMemo(makeBlocks, [])

  // Three tinted variants share one albedo texture (varied concrete tones at
  // no extra memory) but each gets its own emissive variant so neighbouring
  // blocks light up with distinct window patterns at night.
  const materials = useMemo(() => {
    const cells = windowCells()
    const albedo = makeAlbedo(cells)
    const tints = ['#aeb2b8', '#c4bcae', '#9aa6ad']
    const seeds = [0x5eed, 0x1a2b, 0x9f3c]
    return tints.map(
      (color, i) =>
        new MeshStandardMaterial({
          color,
          map: albedo,
          emissive: '#ffce8a',
          emissiveMap: makeEmissive(cells, seeds[i]),
          emissiveIntensity: 0,
          roughness: 0.85,
          metalness: 0,
        }),
    )
  }, [])

  // Rooftop water-tanks / lift cores: a darker unlit concrete, one instanced batch.
  const tankMat = useMemo(
    () => new MeshStandardMaterial({ color: '#6c7178', roughness: 0.95, metalness: 0 }),
    [],
  )
  const groundMat = useMemo(
    () => new MeshStandardMaterial({ color: '#6f7468', roughness: 1, metalness: 0 }),
    [],
  )
  // R3F doesn't own geometry/material passed via props — dispose on unmount so
  // switching backdrops doesn't leak the block geometry + façade textures (the
  // shared albedo + per-variant emissive maps ride on the materials).
  useDisposeOnUnmount([
    geom,
    groundMat,
    tankMat,
    ...materials,
    materials[0]?.map ?? null,
    ...materials.map((m) => m.emissiveMap),
  ])

  // Per-material instance lists (blocks) + the rooftop-tank instance list.
  const { byMat, tanks } = useMemo(() => {
    type Inst = {
      px: number
      py: number
      pz: number
      rot: number
      sx: number
      sy: number
      sz: number
    }
    const byMat: Inst[][] = [[], [], []]
    const tankList: Inst[] = []
    for (const b of blocks) {
      byMat[b.mat]!.push({
        px: b.x,
        py: b.h / 2 - 0.2,
        pz: b.z,
        rot: b.rot,
        sx: b.w,
        sy: b.h,
        sz: b.d,
      })
      if (b.tank) {
        // Place the tank on the block roof, offset within the footprint and
        // rotated with the block so it sits square on top.
        const cos = Math.cos(b.rot)
        const sin = Math.sin(b.rot)
        const ox = b.tank.ox * cos - b.tank.oz * sin
        const oz = b.tank.ox * sin + b.tank.oz * cos
        tankList.push({
          px: b.x + ox,
          py: b.h - 0.2 + b.tank.h / 2,
          pz: b.z + oz,
          rot: b.rot,
          sx: b.tank.w,
          sy: b.tank.h,
          sz: b.tank.d,
        })
      }
    }
    return { byMat, tanks: tankList }
  }, [blocks])

  // Night window glow tracks the actual sky darkness (NOT the user's interior
  // lights mode) — distant blocks stay dark in daylight even if the flat's
  // own lights are forced on. O(1) per frame.
  const sun = useSunPosition()
  const sunLevel = lightingFromAltitude(sun.altitude).sun
  const darkness = Math.min(1, Math.max(0, 1 - sunLevel / 0.85))
  useFrame(() => {
    const intensity = darkness * 1.35
    for (const m of materials) m.emissiveIntensity = intensity
  })

  // Centre the estate ring on the active plan (shared with the other backdrops).
  const offset = useBackdropOffset()

  return (
    <group renderOrder={-1} position={offset}>
      {/* Far estate ground, just below the apartment slab. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, -0.2, CZ]}
        material={groundMat}
        receiveShadow={false}
      >
        <circleGeometry args={[240, 48]} />
      </mesh>
      {materials.map((m, i) => (
        <InstancedBatch key={i} geometry={geom} material={m} instances={byMat[i]!} />
      ))}
      {tanks.length > 0 && <InstancedBatch geometry={geom} material={tankMat} instances={tanks} />}
    </group>
  )
}
