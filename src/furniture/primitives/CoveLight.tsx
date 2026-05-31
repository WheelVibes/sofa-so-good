import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Cove light — the L-box false-ceiling lip with a concealed warm LED strip
 * that is the signature of Singapore HDB renovations. Mounts high on a wall
 * (group offset to the lip height) and faces +Z into the room; the upward-
 * facing strip glows at night (emissive tracks scene darkness) and the
 * emitter registry washes the ceiling above it with warm light.
 */
export function CoveLight({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 2.0)
  const centerY = readNum(props, 'mountHeight', 2.3)
  const boxColor = readStr(props, 'boxColor', '#f1efea')
  const ledColor = readStr(props, 'ledColor', '#ffcf94')

  const lipH = 0.12 // face height of the L-box lip
  const lipD = 0.16 // projection into the room
  const stripRef = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (stripRef.current) stripRef.current.emissiveIntensity = 0.04 + getFixtureGlow() * 1.6
  })

  return (
    <group position={[0, centerY, 0]}>
      {/* L-box lip: a vertical fascia projecting from the wall, with a thin
          soffit returning to the wall so the strip sits in a concealed trough. */}
      <mesh castShadow receiveShadow position={[0, 0, lipD]}>
        <boxGeometry args={[length, lipH, 0.02]} />
        <meshStandardMaterial color={boxColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, -lipH / 2 + 0.01, lipD / 2]}>
        <boxGeometry args={[length, 0.02, lipD]} />
        <meshStandardMaterial color={boxColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Concealed LED strip sitting in the trough, facing up toward the
          ceiling. Slightly recessed behind the lip so it reads as indirect. */}
      <mesh position={[0, lipH / 2 - 0.005, lipD * 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length - 0.04, lipD * 0.55]} />
        <meshStandardMaterial
          ref={stripRef}
          color={ledColor}
          emissive={ledColor}
          emissiveIntensity={0.1}
          roughness={0.6}
        />
      </mesh>
    </group>
  )
}
