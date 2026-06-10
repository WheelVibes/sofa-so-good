import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Slatted outdoor table (balcony / patio bistro) — a square slatted top on four
 * tapered legs with a lower stretcher frame, matching `OutdoorChair`. `size`
 * sets the square top; `height` switches between a low coffee table and a dining/
 * bistro height. Floor-anchored, faces +Z.
 */
export function OutdoorTable({ props }: { props: ParamProps }) {
  const size = readNum(props, 'size', 0.7)
  const h = readNum(props, 'height', 0.72)
  const color = readStr(props, 'color', '#a9763f')
  const finish = readStr(props, 'finish', 'wood')
  const mat = getSurfaceMaterial(finish, color, 1, 0)
  const legT = 0.05
  const topT = 0.04
  const half = size / 2
  const inset = legT / 2 + 0.02
  const legX = half - inset
  // Slatted top: planks running along Z, spaced across X.
  const planks = Math.max(4, Math.round(size / 0.12))
  const gap = 0.012
  const plankW = (size - gap * (planks + 1)) / planks

  const leg = (sx: number, sz: number) => (
    <mesh key={`${sx}-${sz}`} castShadow position={[sx, (h - topT) / 2, sz]} material={mat}>
      <boxGeometry args={[legT, h - topT, legT]} />
    </mesh>
  )

  return (
    <group>
      {leg(-legX, -legX)}
      {leg(legX, -legX)}
      {leg(-legX, legX)}
      {leg(legX, legX)}
      {/* Lower stretcher frame */}
      <mesh castShadow position={[0, h * 0.28, -legX]} material={mat}>
        <boxGeometry args={[size - legT, legT * 0.7, legT * 0.7]} />
      </mesh>
      <mesh castShadow position={[0, h * 0.28, legX]} material={mat}>
        <boxGeometry args={[size - legT, legT * 0.7, legT * 0.7]} />
      </mesh>
      {/* Slatted top */}
      {Array.from({ length: planks }, (_, i) => {
        const x = -half + gap + plankW / 2 + i * (plankW + gap)
        return (
          <mesh key={i} castShadow receiveShadow position={[x, h - topT / 2, 0]} material={mat}>
            <boxGeometry args={[plankW, topT, size]} />
          </mesh>
        )
      })}
    </group>
  )
}
