import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Outdoor parasol / umbrella: a weighted base, a thin metal pole, and an octagonal
 * fabric canopy (a low cone) with hanging valance edge. `diameter` sizes the
 * canopy; `fabric` colours it. Floor-anchored.
 */
export function OutdoorParasol({ props }: { props: ParamProps }) {
  const diameter = readNum(props, 'diameter', 2.2)
  const fabric = readStr(props, 'fabric', '#b5654a')
  const r = diameter / 2
  const poleH = 2.25
  const canopyY = poleH - 0.35
  const canopyH = 0.35
  const sides = seg(8, useDetail())
  const canopyMat = getSurfaceMaterial('fabric', fabric, 1, 0)
  const metal = { color: '#9a9ea3', roughness: 0.4, metalness: 0.7 } as const

  return (
    <group>
      {/* Weighted base */}
      <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.08, 24]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Pole */}
      <mesh castShadow position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.025, poleH, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Canopy — a low octagonal cone */}
      <mesh castShadow position={[0, canopyY + canopyH / 2, 0]} material={canopyMat}>
        <coneGeometry args={[r, canopyH, sides]} />
      </mesh>
      {/* Valance: a short skirt ring at the canopy edge */}
      <mesh position={[0, canopyY - 0.04, 0]} material={canopyMat}>
        <cylinderGeometry args={[r * 0.96, r * 0.96, 0.08, sides, 1, true]} />
      </mesh>
      {/* Finial */}
      <mesh castShadow position={[0, canopyY + canopyH + 0.03, 0]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    </group>
  )
}
