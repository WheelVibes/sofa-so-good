import { applianceFinish } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Built-in single oven (the split-kitchen counterpart to the cabinet hob): a
 * stainless box with a large dark glass door, a full-width bar handle, and a top
 * fascia with control knobs. Built-under by default (sits on the floor under a
 * counter); set `mountHeight` to place it as an eye-level oven in a tall column.
 * Faces +Z.
 */
export function Oven({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#cfd2d6')
  const finish = readStr(props, 'finish', 'steel')
  const mountY = readNum(props, 'mountHeight', 0)
  const w = 0.6
  const d = 0.58
  const h = 0.6
  const body = { color, ...applianceFinish(finish) }
  const steel = { color: '#9a9ea3', roughness: 0.3, metalness: 0.75 } as const

  return (
    <group position={[0, mountY, 0]}>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Top control fascia */}
      <mesh castShadow position={[0, h * 0.9, d / 2 + 0.006]}>
        <boxGeometry args={[w - 0.02, h * 0.16, 0.012]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.4} metalness={0.25} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, h * 0.9, d / 2 + 0.022]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.026, 0.026, 0.03, 18]} />
          <meshStandardMaterial {...steel} />
        </mesh>
      ))}
      {/* Door — recessed glass window framed by the body, with a bar handle. */}
      <mesh castShadow position={[0, h * 0.42, d / 2 + 0.006]}>
        <boxGeometry args={[w - 0.04, h * 0.6, 0.012]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, h * 0.42, d / 2 + 0.014]}>
        <boxGeometry args={[w - 0.16, h * 0.42, 0.006]} />
        <meshStandardMaterial
          color="#1c2228"
          roughness={0.12}
          metalness={0.3}
          transparent
          opacity={0.82}
        />
      </mesh>
      {/* Full-width bar handle just under the fascia */}
      <mesh castShadow position={[0, h * 0.74, d / 2 + 0.03]}>
        <boxGeometry args={[w - 0.08, 0.022, 0.022]} />
        <meshStandardMaterial {...steel} />
      </mesh>
    </group>
  )
}
