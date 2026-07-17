import { getSolidMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readStr } from './shared'

/**
 * Pet cooling mat — a thin gel pad that lies flat on the floor (a `noClip`
 * covering, like a rug). Reads as a smooth, low-roughness gel surface (cool
 * gel-blue or grey) quilted into channels by a shallow grid of seams. Sizes
 * S/M. Floor-anchored, footprint-centred. Real metres (2–4 mm thick).
 */
const COOLING_MAT_SIZES: Record<string, { w: number; d: number }> = {
  S: { w: 0.5, d: 0.4 },
  M: { w: 0.7, d: 0.5 },
}

export function CoolingMat({ props }: { props: ParamProps }) {
  const size = readStr(props, 'size', 'M')
  const color = readStr(props, 'color', '#7fb2c9')
  const dim = COOLING_MAT_SIZES[size] ?? COOLING_MAT_SIZES.M
  const w = dim.w
  const d = dim.d

  // Gel = smooth + slightly glossy so it catches a soft highlight.
  const gel = getSolidMaterial(color, 0.32, 0)
  const seam = getSolidMaterial('#000000', 0.5, 0)

  // Quilted channel grid: a few thin recessed seams across the pad.
  const cols = 3
  const rows = 2
  const seamW = 0.006
  return (
    <group>
      {/* Pad slab. */}
      <mesh receiveShadow position={[0, 0.004, 0]} material={gel}>
        <boxGeometry args={[w, 0.008, d]} />
      </mesh>
      {/* Vertical channel seams. */}
      {Array.from({ length: cols - 1 }, (_, i) => {
        const x = -w / 2 + (w * (i + 1)) / cols
        return (
          <mesh key={`cx${i}`} position={[x, 0.0085, 0]} material={seam}>
            <boxGeometry args={[seamW, 0.001, d - 0.03]} />
          </mesh>
        )
      })}
      {/* Horizontal channel seams. */}
      {Array.from({ length: rows - 1 }, (_, i) => {
        const z = -d / 2 + (d * (i + 1)) / rows
        return (
          <mesh key={`cz${i}`} position={[0, 0.0085, z]} material={seam}>
            <boxGeometry args={[w - 0.03, 0.001, seamW]} />
          </mesh>
        )
      })}
    </group>
  )
}
