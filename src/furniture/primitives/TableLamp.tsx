import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Table/bedside lamp: base + slim stem + tapered shade. Its geometry starts
 *  at `surfaceHeight` so it rests on a nightstand/desk. Shade emissive tracks
 *  scene darkness (glows at night). */
export function TableLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f0e4c4')
  const baseColor = readStr(props, 'baseColor', '#33363b')
  const surfaceH = readNum(props, 'surfaceHeight', 0.5)
  const shade = readStr(props, 'shade', 'empire')

  const stemH = 0.26
  const shadeH = 0.16
  const profile: [number, number] =
    shade === 'drum' ? [0.14, 0.14] : shade === 'cone' ? [0.05, 0.17] : [0.11, 0.15]
  const shadeRef = useRef<MeshStandardMaterial>(null)
  const detail = useDetail()
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.06 + getFixtureGlow() * 0.7
  })

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.04, seg(20, detail)]} />
        <meshStandardMaterial color={baseColor} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Stem */}
      <mesh castShadow position={[0, stemH / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, stemH, 10]} />
        <meshStandardMaterial color={baseColor} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Shade */}
      <mesh castShadow position={[0, stemH + shadeH / 2 - 0.02, 0]}>
        <cylinderGeometry args={[profile[0], profile[1], shadeH, seg(24, detail), 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.7}
          side={2}
        />
      </mesh>
    </group>
  )
}
