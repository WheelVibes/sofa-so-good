import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { applianceBodyMaterial, readNum, readStr } from './shared'

/** Appliance bodies read better with a slightly rounder edge than furniture
 *  (real white goods have ~1 cm radii) — still auto-clamped by `safeBevelRadius`. */
const APPLIANCE_BEVEL = 0.012

/** Two-door (fridge + freezer) upright refrigerator with recessed handles. */
export function Refrigerator({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const depth = readNum(props, 'depth', 0.7)
  const height = readNum(props, 'height', 1.78)
  const color = readStr(props, 'color', '#d8dade')
  const finish = readStr(props, 'finish', 'steel')

  const split = height * 0.66 // freezer drawer below
  const body = applianceBodyMaterial(color, finish)
  const handleMat = { color: '#9aa0a6', roughness: 0.3, metalness: 0.7 }

  return (
    <group>
      <BeveledBox
        material={body}
        castShadow
        receiveShadow
        position={[0, height / 2, 0]}
        args={[width, height, depth]}
        bevel={APPLIANCE_BEVEL}
      />
      {/* Door seam */}
      <mesh position={[0, split, depth / 2 + 0.001]}>
        <boxGeometry args={[width, 0.01, 0.005]} />
        <meshStandardMaterial color="#9498a0" roughness={0.6} />
      </mesh>
      {/* Handles (left side, both doors) */}
      {[split + (height - split) / 2, split / 2].map((cy, i) => (
        <mesh key={i} castShadow position={[-width / 2 + 0.07, cy, depth / 2 + 0.03]}>
          <boxGeometry args={[0.03, i === 0 ? height - split - 0.2 : split - 0.2, 0.04]} />
          <MetalMaterial {...handleMat} />
        </mesh>
      ))}
    </group>
  )
}
