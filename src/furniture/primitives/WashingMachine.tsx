import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { applianceBodyMaterial, readStr } from './shared'

/** Front-load washing machine: body + recessed circular door + control
 *  panel. Faces +Z. */
export function WashingMachine({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#eef0f2')
  const finish = readStr(props, 'finish', 'matte')
  const w = 0.6
  const d = 0.6
  const h = 0.85
  const body = applianceBodyMaterial(color, finish)

  return (
    <group>
      <BeveledBox
        material={body}
        castShadow
        receiveShadow
        position={[0, h / 2, 0]}
        args={[w, h, d]}
        bevel={0.012}
      />
      {/* Door ring */}
      <mesh position={[0, h * 0.45, d / 2 + 0.003]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.025, 12, 28]} />
        <meshStandardMaterial color="#b9bdc2" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Door glass */}
      <mesh position={[0, h * 0.45, d / 2 + 0.004]}>
        <circleGeometry args={[0.15, 24]} />
        <meshStandardMaterial
          color="#28323a"
          roughness={0.15}
          metalness={0.2}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Control panel */}
      <mesh position={[0, h * 0.86, d / 2 + 0.003]}>
        <boxGeometry args={[w * 0.9, 0.12, 0.01]} />
        <meshStandardMaterial color="#d2d5d9" roughness={0.5} />
      </mesh>
      <mesh position={[w * 0.3, h * 0.86, d / 2 + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  )
}
