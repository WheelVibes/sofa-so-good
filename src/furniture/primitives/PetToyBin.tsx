import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Pet toy bin — a small open storage basket for toys. Woven-read fabric walls
 * (the shared fabric material's weave normal, no bespoke texture art), round or
 * rectangular, open-topped with an optional flat lid. Floor-anchored,
 * footprint-centred, faces +Z. Real metres.
 */
export function PetToyBin({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.4)
  const depth = readNum(props, 'depth', 0.4)
  const height = readNum(props, 'height', 0.32)
  const shape = readStr(props, 'shape', 'round')
  const color = readStr(props, 'color', '#b8a382')
  const lid = readStr(props, 'lid', 'no')
  const detail = useDetail()
  const r = seg(28, detail)

  const weave = getFabricMaterial(color, 0.92)
  const base = getFabricMaterial(color, 0.95)
  const wall = 0.02

  if (shape === 'round') {
    const outer = Math.min(width, depth) / 2
    return (
      <group>
        {/* Base disc. */}
        <mesh receiveShadow position={[0, 0.012, 0]} material={base}>
          <cylinderGeometry args={[outer - 0.005, outer - 0.005, 0.024, r]} />
        </mesh>
        {/* Woven wall (open cylinder shell). */}
        <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={weave}>
          <cylinderGeometry args={[outer, outer, height, r, 1, true]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={weave}>
          <cylinderGeometry args={[outer - wall, outer - wall, height - 0.01, r, 1, true]} />
        </mesh>
        {/* Rim ring. */}
        <mesh castShadow position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]} material={weave}>
          <torusGeometry args={[outer - wall / 2, wall * 0.7, 8, r]} />
        </mesh>
        {lid === 'yes' ? (
          <mesh castShadow receiveShadow position={[0, height + 0.012, 0]} material={base}>
            <cylinderGeometry args={[outer + 0.005, outer + 0.005, 0.024, r]} />
          </mesh>
        ) : null}
      </group>
    )
  }

  // Rectangular basket: four woven walls + a base.
  const w = width
  const d = depth
  const halfW = w / 2
  const halfD = d / 2
  return (
    <group>
      <BeveledBox
        receiveShadow
        position={[0, 0.012, 0]}
        material={base}
        args={[w - 0.01, 0.024, d - 0.01]}
      />
      {/* Front/back walls (±Z). */}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={`fb${s}`}
          castShadow
          receiveShadow
          position={[0, height / 2, s * (halfD - wall / 2)]}
          material={weave}
          args={[w, height, wall]}
        />
      ))}
      {/* Side walls (±X). */}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={`sw${s}`}
          castShadow
          receiveShadow
          position={[s * (halfW - wall / 2), height / 2, 0]}
          material={weave}
          args={[wall, height, d - 2 * wall]}
        />
      ))}
      {lid === 'yes' ? (
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, height + 0.012, 0]}
          material={base}
          args={[w + 0.01, 0.024, d + 0.01]}
        />
      ) : null}
    </group>
  )
}
