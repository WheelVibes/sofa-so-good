import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Small round café / bistro table — a round top on a central column over a
 * weighted round foot, the classic balcony/patio two-seater. `diameter` sizes
 * the top; `finish` picks teak / rattan / painted / a powder-coated metal look.
 * Floor-anchored, centred, faces +Z. Real-world metres.
 */
export function BistroTable({ props }: { props: ParamProps }) {
  const diameter = readNum(props, 'diameter', 0.6)
  const height = readNum(props, 'height', 0.71)
  const color = readStr(props, 'color', '#3a4038')
  const finish = readStr(props, 'finish', 'gloss')

  const topT = 0.03
  const topR = diameter / 2
  // Metal frames read through the shared brushed-metal helper; teak/rattan/
  // painted go through the surface material like the other outdoor pieces.
  const isMetal = finish === 'gloss'
  const frame = isMetal ? metalLeg(color, 'black-steel') : getSurfaceMaterial(finish, color, 1, 0)
  const top = getSurfaceMaterial(finish === 'gloss' ? 'painted' : finish, color, 1, 0)

  const columnR = 0.025
  const columnTop = height - topT
  const footR = Math.min(0.19, topR * 0.6)
  const footH = 0.02

  return (
    <group>
      {/* Weighted round foot on the floor */}
      <mesh castShadow receiveShadow position={[0, footH / 2, 0]} material={frame}>
        <cylinderGeometry args={[footR, footR + 0.01, footH, 24]} />
      </mesh>
      {/* Central column foot→top underside */}
      <mesh castShadow position={[0, footH + (columnTop - footH) / 2, 0]} material={frame}>
        <cylinderGeometry args={[columnR, columnR, columnTop - footH, 16]} />
      </mesh>
      {/* Under-top hub tying the column to the top */}
      <mesh castShadow position={[0, columnTop - 0.01, 0]} material={frame}>
        <cylinderGeometry args={[topR * 0.35, columnR, 0.04, 16]} />
      </mesh>
      {/* Round top */}
      <mesh castShadow receiveShadow position={[0, height - topT / 2, 0]} material={top}>
        <cylinderGeometry args={[topR, topR, topT, 32]} />
      </mesh>
    </group>
  )
}
