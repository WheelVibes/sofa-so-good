import { RoundedBox } from '@react-three/drei'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Wall-mounted storage water heater — the SG-universal bathroom fitting (Joven /
 * Rheem style): a compact rounded enamel box mounted high on the wall with a
 * front temperature dial + indicator and two short inlet/outlet pipe drops
 * hanging from the underside. `mounted` (its group is floor-anchored, so the body
 * is offset up in Y by `mountHeight`). Faces +Z. Built in real metres.
 */
export function WaterHeater({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.5)
  const mountH = readNum(props, 'mountHeight', 1.95)
  const color = readStr(props, 'color', '#f4f4f0')

  const w = width
  const h = 0.35
  const d = 0.3

  const body = getSurfaceMaterial('gloss', color, 1, 0.3)
  const pipe = metalLeg('#c9cdd2', 'stainless')

  return (
    <group position={[0, mountH, 0]}>
      {/* Enamel storage tank body. */}
      <RoundedBox
        args={[w, h, d]}
        radius={0.06}
        smoothness={3}
        castShadow
        receiveShadow
        material={body}
      />
      {/* Front temperature dial. */}
      <mesh position={[w * 0.28, -0.03, d / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.02, 20]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Indicator lamp. */}
      <mesh position={[-w * 0.28, 0.06, d / 2 - 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.014, 12]} />
        <meshStandardMaterial
          color="#8a2b1e"
          emissive="#ff5a3c"
          emissiveIntensity={0.6}
          roughness={0.4}
        />
      </mesh>
      {/* Inlet / outlet pipe drops hanging from the underside. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`pipe${s}`}
          castShadow
          position={[s * (w * 0.32), -h / 2 - 0.07, d * 0.12]}
          material={pipe}
        >
          <cylinderGeometry args={[0.013, 0.013, 0.18, 12]} />
        </mesh>
      ))}
    </group>
  )
}
