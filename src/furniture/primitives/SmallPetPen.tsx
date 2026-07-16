import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/** One C&C grid square, in metres (14-inch cube panels). */
export const CC_GRID_CELL = 0.36

/**
 * Guinea-pig / small-pet C&C pen (parametric) — an open-top pen built from modular
 * wire grid squares (the classic "Cubes & Coroplast" cage), with a raised
 * coroplast (fluted-plastic) tray liner inside. `gridsX`×`gridsY` sets the size
 * in grid units (2×3 minimum ≈ 27×41 in). The grid read comes from a lattice of
 * thin wire bars forming small squares on each wall. Floor-anchored,
 * footprint-centred, faces +Z. Real metres; the grid is one connected panel run.
 */
export function SmallPetPen({ props }: { props: ParamProps }) {
  const gridsX = Math.max(2, Math.min(6, Math.round(readNum(props, 'gridsX', 3))))
  const gridsY = Math.max(2, Math.min(6, Math.round(readNum(props, 'gridsY', 2))))
  const wireColor = readStr(props, 'wireColor', '#e8ebee')
  const baseColor = readStr(props, 'baseColor', '#6b8fb0')

  const w = gridsX * CC_GRID_CELL
  const d = gridsY * CC_GRID_CELL
  const wallH = CC_GRID_CELL // one grid high
  const halfW = w / 2
  const halfD = d / 2
  const wire = metalLeg(wireColor, 'stainless')
  const coro = getSurfaceMaterial('painted', baseColor, 1)
  const barT = 0.006
  // Grid line pitch: ~9 squares per 14" panel → ~0.04 m; cap the count.
  const pitch = 0.06

  const linesAlong = (length: number) => {
    const n = Math.max(2, Math.round(length / pitch))
    return Array.from({ length: n + 1 }, (_, i) => -length / 2 + (length * i) / n)
  }
  const vLines = (length: number) => linesAlong(length)
  const hLevels = (() => {
    const n = Math.max(2, Math.round(wallH / pitch))
    return Array.from({ length: n + 1 }, (_, i) => (wallH * i) / n)
  })()

  // Build a grid wall along local X at a fixed Z (or rotate for the ±X walls).
  const gridWall = (key: string, length: number) => (
    <group key={key}>
      {vLines(length).map((x, i) => (
        <mesh key={`v${i}`} castShadow position={[x, wallH / 2, 0]} material={wire}>
          <boxGeometry args={[barT, wallH, barT]} />
        </mesh>
      ))}
      {hLevels.map((y, i) => (
        <mesh key={`h${i}`} castShadow position={[0, y, 0]} material={wire}>
          <boxGeometry args={[length, barT, barT]} />
        </mesh>
      ))}
    </group>
  )

  return (
    <group>
      {/* Coroplast liner: a solid base pan with low upturned sides. */}
      <mesh receiveShadow position={[0, 0.008, 0]} material={coro}>
        <boxGeometry args={[w - 0.02, 0.016, d - 0.02]} />
      </mesh>
      {[-1, 1].map((sz) => (
        <mesh key={`coroZ${sz}`} position={[0, 0.08, sz * (halfD - 0.02)]} material={coro}>
          <boxGeometry args={[w - 0.02, 0.15, 0.012]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`coroX${sx}`} position={[sx * (halfW - 0.02), 0.08, 0]} material={coro}>
          <boxGeometry args={[0.012, 0.15, d - 0.02]} />
        </mesh>
      ))}

      {/* Four grid walls. */}
      <group position={[0, 0, -halfD]}>{gridWall('front', w)}</group>
      <group position={[0, 0, halfD]}>{gridWall('back', w)}</group>
      <group position={[-halfW, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {gridWall('left', d)}
      </group>
      <group position={[halfW, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {gridWall('right', d)}
      </group>
    </group>
  )
}
