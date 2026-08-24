import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { fixtureEmissiveIntensity } from '../../scene/lighting/fixtureGlow'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/** Wall sconce — a small up/down wall light. Mounted flat against the wall
 *  (group offset to the mount height), with a frosted diffuser that glows at
 *  night (emissive tracks scene darkness). Faces +Z into the room. */
export function WallSconce({ props }: { props: ParamProps }) {
  const centerY = readNum(props, 'mountHeight', 1.7)
  const shadeColor = readStr(props, 'shadeColor', '#f3e7c6')
  const metalColor = readStr(props, 'metalColor', '#2c2f33')

  const shadeRef = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = fixtureEmissiveIntensity('shade')
  })

  return (
    <group position={[0, centerY, 0]}>
      {/* Backplate against the wall */}
      <mesh castShadow position={[0, 0, 0.01]}>
        <boxGeometry args={[0.1, 0.16, 0.02]} />
        <MetalMaterial color={metalColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Short arm — a horizontal spar (along +Z) physically bridging the wall
          backplate to the diffuser, so the shade is carried by the arm rather
          than floating in front of a detached backplate. */}
      <mesh castShadow position={[0, 0, 0.065]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
        <MetalMaterial color={metalColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Frosted diffuser cylinder, open-ended, glowing */}
      <mesh castShadow position={[0, 0, 0.11]}>
        <cylinderGeometry args={[0.06, 0.07, 0.2, 20, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.6}
          side={2}
        />
      </mesh>
    </group>
  )
}
