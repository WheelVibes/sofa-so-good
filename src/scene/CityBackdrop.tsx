import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { mulberry32 } from '../materials/procedural/noise'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'

/**
 * Distant HDB-estate backdrop — the neighbouring blocks you always see out
 * an HDB window. A ring of low-poly towers (one shared unit-box geometry,
 * scaled per block) plus a far ground plane, rendered cheaply: no shadows,
 * a handful of shared materials, and one procedural façade texture. Window
 * emissive ramps up at night via the shared fixtureGlow signal, so the
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

/** Shared concrete façade with recessed glazing. */
function makeAlbedo(cells: ReturnType<typeof windowCells>): CanvasTexture {
  const a = document.createElement('canvas')
  a.width = TEX_W
  a.height = TEX_H
  const ac = a.getContext('2d')!
  ac.fillStyle = '#9498a0'
  ac.fillRect(0, 0, TEX_W, TEX_H)
  for (const cell of cells) {
    ac.fillStyle = '#384350'
    ac.fillRect(cell.x, cell.y, cell.w, cell.h)
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
}

/** Deterministic ring of blocks around the flat, with a wide gap left clear
 *  so the skyline doesn't feel like a solid wall. */
function makeBlocks(): Block[] {
  const rnd = mulberry32(0xb10c)
  const blocks: Block[] = []
  const count = 22
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.18
    const radius = 34 + rnd() * 46
    const x = CX + Math.cos(ang) * radius
    const z = CZ + Math.sin(ang) * radius
    const w = 16 + rnd() * 34
    const d = 14 + rnd() * 26
    const h = 26 + rnd() * 64
    // Face roughly toward the flat, with jitter.
    const rot = -ang + (rnd() - 0.5) * 0.6
    blocks.push({ x, z, w, d, h, rot, mat: i % 3 })
  }
  return blocks
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

  const groundMat = useMemo(
    () => new MeshStandardMaterial({ color: '#6f7468', roughness: 1, metalness: 0 }),
    [],
  )

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

  return (
    <group renderOrder={-1}>
      {/* Far estate ground, just below the apartment slab. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, -0.2, CZ]}
        material={groundMat}
        receiveShadow={false}
      >
        <circleGeometry args={[240, 48]} />
      </mesh>
      {blocks.map((b, i) => (
        <mesh
          key={i}
          geometry={geom}
          material={materials[b.mat]}
          position={[b.x, b.h / 2 - 0.2, b.z]}
          rotation={[0, b.rot, 0]}
          scale={[b.w, b.h, b.d]}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  )
}
