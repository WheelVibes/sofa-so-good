import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** Wall-mounted split-system aircon — the ubiquitous HDB fan-coil unit.
 *  Rendered high on the wall (its group is floor-anchored, so the body is
 *  offset up in Y). Footprint marks its floor projection against a wall. */
export function AirconUnit({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.84)
  const mountH = readNum(props, 'mountHeight', 2.25)
  const color = readStr(props, 'color', '#f3f3f0')

  const bodyH = 0.3
  const bodyD = 0.21

  return (
    <group position={[0, mountH, 0]}>
      {/* Main body — rounded top via a slightly wider lower lip */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[width, bodyH, bodyD]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Front face fascia (subtle inset) */}
      <mesh position={[0, 0.02, bodyD / 2 + 0.002]}>
        <boxGeometry args={[width - 0.04, bodyH - 0.08, 0.02]} />
        <meshStandardMaterial color="#fbfbf9" roughness={0.5} />
      </mesh>
      {/* Bottom louvre slot */}
      <mesh position={[0, -bodyH / 2 + 0.04, bodyD / 2 - 0.02]}>
        <boxGeometry args={[width - 0.08, 0.04, 0.04]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.8} />
      </mesh>
    </group>
  )
}
