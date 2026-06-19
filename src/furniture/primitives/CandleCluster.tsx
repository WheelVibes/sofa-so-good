import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Candle cluster — 3 pillar candles of different heights grouped together.
 * Rests at `surfaceHeight` (floor-anchored to that height). A small round plate
 * / mirrored base ties the group. Distinct from TabletopDecor (which has a tray
 * + books + vase). Facing +Z.
 */
export function CandleCluster({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const waxColor = readStr(props, 'waxColor', '#f5f0e8')
  const plateColor = readStr(props, 'plateColor', '#c8c0b0')
  const flameOn = readStr(props, 'flame', 'yes')

  const waxMat = getSurfaceMaterial('painted', waxColor, 1, 0.05)
  const plateMat = getSurfaceMaterial('gloss', plateColor, 1, 0.6)
  const flameMat = {
    color: '#ffcc44',
    roughness: 0.8,
    metalness: 0,
    emissive: '#ff8800',
    emissiveIntensity: 0.9,
  }

  // Three candles: tall, medium, short
  const candles: { r: number; h: number; x: number; z: number }[] = [
    { r: 0.028, h: 0.16, x: -0.06, z: 0 },
    { r: 0.022, h: 0.11, x: 0.04, z: -0.025 },
    { r: 0.018, h: 0.07, x: 0.02, z: 0.04 },
  ]

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Plate / base */}
      <mesh receiveShadow position={[0, 0.007, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.014, 24]} />
        <meshStandardMaterial {...(plateMat as object)} />
      </mesh>

      {/* Candles */}
      {candles.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          {/* Wax body */}
          <mesh castShadow receiveShadow position={[0, 0.014 + c.h / 2, 0]}>
            <cylinderGeometry args={[c.r, c.r, c.h, 16]} />
            <meshStandardMaterial {...(waxMat as object)} />
          </mesh>
          {/* Wick */}
          <mesh position={[0, 0.014 + c.h + 0.005, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.012, 4]} />
            <meshStandardMaterial color="#2a1a08" roughness={1} />
          </mesh>
          {/* Flame (teardrop shape via scaled icosahedron) */}
          {flameOn === 'yes' && (
            <mesh castShadow position={[0, 0.014 + c.h + 0.022, 0]} scale={[1, 1.4, 1]}>
              <tetrahedronGeometry args={[0.012, 0]} />
              <meshStandardMaterial {...(flameMat as object)} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
