import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { applianceBodyMaterial, readStr } from './shared'

/** Freestanding cooker: oven body + cooktop with four burners and front
 *  control knobs. Faces +Z. */
export function Stove({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#cfd2d6')
  const finish = readStr(props, 'finish', 'steel')
  const w = 0.6
  const d = 0.6
  const cabinetH = 0.85
  const topT = 0.04
  const body = applianceBodyMaterial(color, finish)

  const burners: [number, number][] = [
    [-0.14, -0.12],
    [0.14, -0.12],
    [-0.14, 0.14],
    [0.14, 0.14],
  ]

  return (
    <group>
      {/* Oven body */}
      <BeveledBox
        material={body}
        castShadow
        receiveShadow
        position={[0, cabinetH / 2, 0]}
        args={[w, cabinetH, d]}
        bevel={0.012}
      />
      {/* Oven door window */}
      <mesh position={[0, cabinetH * 0.45, d / 2 + 0.002]}>
        <boxGeometry args={[w * 0.7, cabinetH * 0.4, 0.01]} />
        <meshStandardMaterial color="#1c1f24" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Handle */}
      <mesh position={[0, cabinetH * 0.78, d / 2 + 0.03]}>
        <boxGeometry args={[w * 0.8, 0.03, 0.03]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Cooktop */}
      <BeveledBox
        castShadow
        position={[0, cabinetH + topT / 2, 0]}
        args={[w, topT, d]}
        bevel={0.008}
      >
        <meshStandardMaterial color="#2b2d30" roughness={0.3} metalness={0.4} />
      </BeveledBox>
      {/* Burners */}
      {burners.map(([x, z], i) => (
        <mesh key={i} position={[x, cabinetH + topT + 0.005, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.012, 8, 20]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {/* Control knobs along the back lip */}
      {[-0.18, -0.06, 0.06, 0.18].map((x, i) => (
        <mesh key={i} position={[x, cabinetH + 0.04, -d / 2 + 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.03, 12]} />
          <meshStandardMaterial color="#1c1f24" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}
