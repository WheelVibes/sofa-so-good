import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Fruit bowl / decorative bowl — a wide ceramic or wooden bowl with a small
 * arrangement of fruit (or just an empty decorative bowl). Rests at
 * `surfaceHeight`. Floor-anchored, footprint-centred, facing +Z.
 */
export function FruitBowl({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const bowlColor = readStr(props, 'bowlColor', '#c8b89a')
  const finish = readStr(props, 'finish', 'gloss')
  const sheen = readNum(props, 'sheen', 0.35)
  const contents = readStr(props, 'contents', 'fruit')

  const r = seg(24, useDetail())
  const bowlMat = getSurfaceMaterial(finish, bowlColor, 1, sheen)

  // Fruit colours and sizes
  const fruit: { color: string; r: number; x: number; z: number; y: number }[] = [
    { color: '#f0a020', r: 0.042, x: -0.04, z: -0.01, y: 0 },
    { color: '#d63820', r: 0.036, x: 0.05, z: 0.02, y: 0.006 },
    { color: '#e8d020', r: 0.038, x: 0.0, z: 0.04, y: 0.004 },
    { color: '#7ab828', r: 0.032, x: -0.055, z: 0.03, y: 0.014 },
    { color: '#e07030', r: 0.033, x: 0.04, z: -0.04, y: 0.01 },
  ]

  const bowlRim = 0.14 // outer rim radius
  const bowlBase = 0.06
  const bowlH = 0.07

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Bowl outer body — wide shallow cylinder tapering to a base foot */}
      <mesh castShadow receiveShadow position={[0, bowlH / 2, 0]} material={bowlMat}>
        <cylinderGeometry args={[bowlRim, bowlBase, bowlH, r]} />
      </mesh>
      {/* Bowl rim band — slightly larger flat disc at the top */}
      <mesh castShadow position={[0, bowlH, 0]} material={bowlMat}>
        <cylinderGeometry args={[bowlRim + 0.012, bowlRim - 0.008, 0.018, r]} />
      </mesh>
      {/* Base foot ring */}
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <cylinderGeometry args={[bowlBase + 0.01, bowlBase, 0.02, r]} />
        <meshStandardMaterial {...(bowlMat as object)} />
      </mesh>

      {/* Fruit contents — simple coloured spheres arranged inside */}
      {contents === 'fruit' &&
        fruit.map((f, i) => (
          <mesh key={i} castShadow position={[f.x, bowlH + f.r * 0.8 + f.y, f.z]}>
            <sphereGeometry args={[f.r, 12, 8]} />
            <meshStandardMaterial color={f.color} roughness={0.6} metalness={0} />
          </mesh>
        ))}
    </group>
  )
}
