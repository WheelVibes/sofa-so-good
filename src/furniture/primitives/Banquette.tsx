import { RoundedBox } from '@react-three/drei'
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

interface BanquetteProps {
  props: ParamProps
}

/**
 * Banquette / built-in bench — an upholstered dining-nook bench meant to sit
 * flush to a wall (backrest at the -Z / wall side). An upholstered plinth base
 * to the floor carries a proud seat cushion + a full-width padded backrest with
 * vertical channel tufting. Parametric width; the `material` upholstery kind
 * includes bouclé. Faces +Z, footprint-centred, real metres.
 */
export function Banquette({ props }: BanquetteProps) {
  const width = readNum(props, 'width', 1.6)
  const depth = readNum(props, 'depth', 0.55)
  const color = readStr(props, 'color', '#a9b0a0')
  const material = readStr(props, 'material', 'fabric')
  const pattern = readStr(props, 'pattern', 'plain')
  const sheen = readNum(props, 'sheen', 0)

  const uph = getUpholsteryMaterial(material, color, sheen, pattern)

  const baseH = 0.38
  const seatCushionH = 0.12
  const seatTop = 0.46
  const backTop = 0.95
  const backThick = 0.12
  const backZ = -depth / 2 + backThick / 2

  const backBottom = 0.45 // overlaps the seat cushion top (0.46) so it stays joined
  const backH = backTop - backBottom
  const backCenterY = backBottom + backH / 2

  // Vertical channel-tufting seams across the backrest.
  const seamN = Math.max(3, Math.round(width / 0.34))

  return (
    <group>
      {/* Upholstered plinth base (reaches the floor). */}
      <BeveledBox
        material={uph}
        castShadow
        receiveShadow
        position={[0, baseH / 2, 0]}
        args={[width, baseH, depth]}
      />
      {/* Seat cushion — proud, slightly overlapping the base top so it reads as a
          separate pad while staying one connected assembly. */}
      <RoundedBox
        args={[width - 0.03, seatCushionH, depth - 0.03]}
        radius={0.03}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, seatTop - seatCushionH / 2, 0]}
        material={uph}
      />
      {/* Padded backrest at the wall side. */}
      <RoundedBox
        args={[width, backH, backThick]}
        radius={0.04}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, backCenterY, backZ]}
        material={uph}
      />
      {/* Channel-tufting seams (proud thin ribs, same upholstery so no z-fight). */}
      {Array.from({ length: seamN - 1 }, (_, i) => {
        const x = -width / 2 + (width * (i + 1)) / seamN
        return (
          <mesh
            key={`seam${i}`}
            position={[x, backCenterY, backZ + backThick / 2 - 0.004]}
            material={uph}
          >
            <boxGeometry args={[0.012, backH - 0.06, 0.02]} />
          </mesh>
        )
      })}
    </group>
  )
}
