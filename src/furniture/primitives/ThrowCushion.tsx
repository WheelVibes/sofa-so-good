import { RoundedBox } from '@react-three/drei'
import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Throw cushion / scatter cushion — a plump fabric pillow to dress sofas and
 * beds. Floor-anchored to `surfaceHeight`. Facing +Z. Real metres.
 * Distinct from `Ottoman` (which is an oversized floor seat). Use `noClip` so
 * it can sit on a sofa without collision rejection.
 */
export function ThrowCushion({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.52)
  const color = readStr(props, 'color', '#b08068')
  const accentColor = readStr(props, 'accentColor', '#7a5a48')
  const shape = readStr(props, 'shape', 'square')
  const pattern = readStr(props, 'pattern', 'plain')

  const fabricPat = pattern === 'plain' ? 'plain' : pattern === 'stripe' ? 'stripe' : 'plain'
  const mat = getFabricMaterial(color, 0.88, fabricPat)
  const accentMat = getFabricMaterial(accentColor, 0.88, fabricPat)

  const isRound = shape === 'round'
  const isRect = shape === 'rect'

  // Sizes
  const w = isRect ? 0.55 : 0.45
  const d = isRect ? 0.35 : 0.45
  const h = 0.13 // pillow puff height
  const r = isRound ? 0.2 : 0.06 // rounded corner radius

  const puffH = h * 0.72 // main puff
  const flangeH = h * 0.18 // thin flange rim

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Main puffed body — a RoundedBox mimics the pillow bulge */}
      <RoundedBox
        args={[w, puffH, d]}
        radius={r}
        smoothness={3}
        position={[0, puffH / 2, 0]}
        material={mat}
        castShadow
      />
      {/* Thin flange border seam — slightly wider, very thin */}
      <RoundedBox
        args={[w + 0.02, flangeH, d + 0.02]}
        radius={0.015}
        smoothness={2}
        position={[0, flangeH / 2 - 0.002, 0]}
        material={accentMat}
        castShadow
      />
    </group>
  )
}
