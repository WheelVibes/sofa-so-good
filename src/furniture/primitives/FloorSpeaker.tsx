import { RoundedBox } from '@react-three/drei'
import { getSolidMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/**
 * Floor-standing speaker — a hi-fi tower for the media wall. A slim cabinet on a
 * low plinth with a stack of driver cones (woofers + a tweeter) on the front
 * baffle. `finish` swaps a matte enclosure for a wood-veneer one. Floor-anchored,
 * footprint-centred, faces +Z (front toward the room). Real metres.
 */
export function FloorSpeaker({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 0.95)
  const color = readStr(props, 'color', '#1d1d20')
  const finish = readStr(props, 'finish', 'matte')
  const drivers = Math.round(readNum(props, 'drivers', 2))

  const w = 0.22
  const d = 0.3
  const bodyMat =
    finish === 'wood'
      ? getSurfaceMaterial('wood', color, 1, 0.2)
      : getSolidMaterial(color, 0.55, 0.15)
  const coneMat = { color: '#2a2a2d', roughness: 0.7, metalness: 0.2 } as const
  const dustMat = { color: '#3a3a3e', roughness: 0.5, metalness: 0.4 } as const

  const plinthH = 0.03
  const cabH = height - plinthH
  const cabCY = plinthH + cabH / 2
  const faceZ = d / 2 + 0.004

  // Driver stack: a tweeter near the top, then `drivers` woofers spaced below.
  const woofR = 0.07
  const topWooferY = plinthH + cabH - 0.18
  const woofers = Array.from({ length: Math.max(1, Math.min(3, drivers)) }, (_, i) => ({
    y: topWooferY - i * (woofR * 2 + 0.03),
  }))

  return (
    <group>
      {/* Low plinth foot */}
      <mesh castShadow receiveShadow position={[0, plinthH / 2, 0]} material={bodyMat}>
        <boxGeometry args={[w + 0.05, plinthH, d + 0.05]} />
      </mesh>
      {/* Cabinet */}
      <RoundedBox
        args={[w, cabH, d]}
        radius={0.012}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, cabCY, 0]}
        material={bodyMat}
      />
      {/* Tweeter near the top */}
      <mesh position={[0, plinthH + cabH - 0.07, faceZ]}>
        <circleGeometry args={[0.022, 20]} />
        <MetalMaterial {...dustMat} />
      </mesh>
      {/* Woofer cones */}
      {woofers.map((wf, i) => (
        <group key={i} position={[0, wf.y, faceZ]}>
          <mesh>
            <circleGeometry args={[woofR, 24]} />
            <meshStandardMaterial {...coneMat} />
          </mesh>
          {/* Centre dust cap */}
          <mesh position={[0, 0, 0.004]}>
            <circleGeometry args={[woofR * 0.32, 16]} />
            <MetalMaterial {...dustMat} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
