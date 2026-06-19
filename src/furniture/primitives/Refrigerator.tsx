import type { ParamProps } from '../types'
import {
  ApplianceBodyMaterial,
  applianceBody,
  applianceBodyMeshProps,
  readNum,
  readStr,
} from './shared'

/** Two-door (fridge + freezer) upright refrigerator with recessed handles. */
export function Refrigerator({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const depth = readNum(props, 'depth', 0.7)
  const height = readNum(props, 'height', 1.78)
  const color = readStr(props, 'color', '#d8dade')
  const finish = readStr(props, 'finish', 'steel')

  const split = height * 0.66 // freezer drawer below
  const body = applianceBody(color, finish)
  const handleMat = { color: '#9aa0a6', roughness: 0.3, metalness: 0.7 }

  return (
    <group>
      <mesh
        {...applianceBodyMeshProps(body)}
        castShadow
        receiveShadow
        position={[0, height / 2, 0]}
      >
        <boxGeometry args={[width, height, depth]} />
        <ApplianceBodyMaterial finish={body} />
      </mesh>
      {/* Door seam */}
      <mesh position={[0, split, depth / 2 + 0.001]}>
        <boxGeometry args={[width, 0.01, 0.005]} />
        <meshStandardMaterial color="#9498a0" roughness={0.6} />
      </mesh>
      {/* Handles (left side, both doors) */}
      {[split + (height - split) / 2, split / 2].map((cy, i) => (
        <mesh key={i} castShadow position={[-width / 2 + 0.07, cy, depth / 2 + 0.03]}>
          <boxGeometry args={[0.03, i === 0 ? height - split - 0.2 : split - 0.2, 0.04]} />
          <meshStandardMaterial {...handleMat} />
        </mesh>
      ))}
    </group>
  )
}
