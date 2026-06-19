import { RoundedBox } from '@react-three/drei'
import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Folded throw blanket — a loosely folded fabric throw draped over a sofa arm
 * or the foot of a bed. Rests at `surfaceHeight`. Floor-anchored, facing +Z.
 * The form is two RoundedBox slabs (bottom fold + top fold) with a slight lean
 * so it reads as casual fabric, not a hard box.
 */
export function ThrowBlanket({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.52)
  const color = readStr(props, 'color', '#c4b49a')
  const accentColor = readStr(props, 'accentColor', '#a89278')
  const pattern = readStr(props, 'pattern', 'plain')

  const pat = pattern === 'stripe' ? 'stripe' : pattern === 'herringbone' ? 'herringbone' : 'plain'
  const mat = getFabricMaterial(color, 0.92, pat)
  const mat2 = getFabricMaterial(accentColor, 0.9, pat)

  // Loosely folded: a thick base + a thinner top fold leaning slightly
  const bW = 0.44
  const bD = 0.28
  const bH = 0.08

  const tW = 0.44
  const tD = 0.22
  const tH = 0.06

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Lower / inner fold */}
      <RoundedBox
        args={[bW, bH, bD]}
        radius={0.025}
        smoothness={3}
        position={[0, bH / 2, 0]}
        material={mat}
        castShadow
        receiveShadow
      />
      {/* Upper / outer fold — slightly narrower depth, tilted forward a touch */}
      <RoundedBox
        args={[tW, tH, tD]}
        radius={0.022}
        smoothness={3}
        position={[0, bH + tH / 2 - 0.006, -0.01]}
        rotation={[0.07, 0, 0]}
        material={mat2}
        castShadow
      />
      {/* Small draped corner — tiny soft wedge at front-left to break symmetry */}
      <RoundedBox
        args={[0.1, 0.05, 0.12]}
        radius={0.018}
        smoothness={2}
        position={[-0.15, bH - 0.01, bD / 2 - 0.01]}
        rotation={[0.25, 0.1, 0.05]}
        material={mat}
        castShadow
      />
    </group>
  )
}
