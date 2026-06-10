import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * L-shaped corner base cabinet — two perpendicular runs sharing the corner, with
 * an L countertop, recessed toe-kicks and a door on each run's inner face. The
 * back faces sit against the two walls (−X and −Z); the inner corner opens toward
 * the room (+X / +Z). Footprint-centred on its bounding square, facing +Z. Built
 * directly (not via `buildCabinet`, which is rectangular).
 */
export function CabinetCorner({ props }: { props: ParamProps }) {
  const S = readNum(props, 'width', 1.0) // bounding square side
  const carcassH = readNum(props, 'height', 0.72)
  const d = readNum(props, 'depth', 0.6) // run depth (each leg)
  const toe = readNum(props, 'toeKick', 0.1)
  const ctT = 0.04
  const color = readStr(props, 'color', '#e6e2d8')
  const finish = readStr(props, 'finish', 'painted')
  const worktopColor = readStr(props, 'worktopColor', '#34373d')

  const bodyMat = getSurfaceMaterial(finish, color, 1, 0)
  const handleMat = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const
  const half = S / 2
  const cBottom = toe
  const cTop = cBottom + carcassH
  const cy = cBottom + carcassH / 2
  const FRONT_T = 0.018
  // Run A: along X across the back (against the −Z wall): full width × depth d.
  const aZ = -half + d / 2
  // Run B: along Z on the left (against the −X wall), minus the shared corner.
  const bLen = S - d
  const bX = -half + d / 2
  const bZ = -half + d + bLen / 2

  return (
    <group>
      {/* Toe-kicks (recessed 0.05 from the inner faces) */}
      {toe > 0 && (
        <>
          <mesh position={[0, toe / 2, aZ - 0.025]} material={bodyMat}>
            <boxGeometry args={[S - 0.01, toe, d - 0.05]} />
          </mesh>
          <mesh position={[bX - 0.025, toe / 2, bZ]} material={bodyMat}>
            <boxGeometry args={[d - 0.05, toe, bLen - 0.01]} />
          </mesh>
        </>
      )}
      {/* Carcasses */}
      <mesh castShadow receiveShadow position={[0, cy, aZ]} material={bodyMat}>
        <boxGeometry args={[S, carcassH, d]} />
      </mesh>
      <mesh castShadow receiveShadow position={[bX, cy, bZ]} material={bodyMat}>
        <boxGeometry args={[d, carcassH, bLen]} />
      </mesh>
      {/* L countertop (two slabs) */}
      <mesh castShadow receiveShadow position={[0, cTop + ctT / 2, aZ]}>
        <boxGeometry args={[S + 0.02, ctT, d + 0.02]} />
        <meshStandardMaterial color={worktopColor} roughness={0.22} metalness={0.15} />
      </mesh>
      <mesh castShadow receiveShadow position={[bX, cTop + ctT / 2, bZ]}>
        <boxGeometry args={[d + 0.02, ctT, bLen + 0.02]} />
        <meshStandardMaterial color={worktopColor} roughness={0.22} metalness={0.15} />
      </mesh>
      {/* Door on run A's inner (+Z) face, over the part not covered by run B */}
      {(() => {
        const doorW = S - d - 0.04
        const doorX = (-half + d + half) / 2 // centre of the [-half+d, half] span
        const frontZ = aZ + d / 2 + FRONT_T / 2
        return (
          <group>
            <mesh castShadow position={[doorX, cy, frontZ]} material={bodyMat}>
              <boxGeometry args={[doorW, carcassH - 0.04, FRONT_T]} />
            </mesh>
            <mesh castShadow position={[doorX - doorW / 2 + 0.04, cy, frontZ + 0.015]}>
              <boxGeometry args={[0.018, 0.16, 0.02]} />
              <meshStandardMaterial {...handleMat} />
            </mesh>
          </group>
        )
      })()}
      {/* Door on run B's inner (+X) face */}
      {(() => {
        const doorL = bLen - 0.04
        const frontX = bX + d / 2 + FRONT_T / 2
        return (
          <group>
            <mesh castShadow position={[frontX, cy, bZ]} material={bodyMat}>
              <boxGeometry args={[FRONT_T, carcassH - 0.04, doorL]} />
            </mesh>
            <mesh castShadow position={[frontX + 0.015, cy, bZ - doorL / 2 + 0.04]}>
              <boxGeometry args={[0.02, 0.16, 0.018]} />
              <meshStandardMaterial {...handleMat} />
            </mesh>
          </group>
        )
      })()}
    </group>
  )
}
