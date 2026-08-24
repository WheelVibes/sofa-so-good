import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { applianceBodyMaterial, readNum, readStr } from './shared'

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
  const body = applianceBodyMaterial(color, finish)
  const steel = { color: '#9a9ea3', roughness: 0.3, metalness: 0.75 } as const

  return (
    <group position={[0, mountY, 0]}>
      {/* Body */}
      <BeveledBox
        material={body}
        castShadow
        receiveShadow
        position={[0, h / 2, 0]}
        args={[w, h, d]}
        bevel={0.012}
      />
      {/* Top control fascia */}
      <mesh castShadow position={[0, h * 0.9, d / 2 + 0.006]}>
        <boxGeometry args={[w - 0.02, h * 0.16, 0.012]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.4} metalness={0.25} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, h * 0.9, d / 2 + 0.022]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.026, 0.026, 0.03, 18]} />
          <MetalMaterial {...steel} />
        </mesh>
      ))}
      {/* Door — recessed glass window framed by the body, with a bar handle. */}
      <BeveledBox
        material={body}
        castShadow
        position={[0, h * 0.42, d / 2 + 0.006]}
        args={[w - 0.04, h * 0.6, 0.012]}
        bevel={0.012}
      />
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
        <MetalMaterial {...steel} />
      </mesh>
    </group>
  )
}
