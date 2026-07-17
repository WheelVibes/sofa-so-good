import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Stack of books — a horizontal stack of 4–6 books with a couple of upright
 * leaning volumes at one end. Tabletop/shelf prop, floor-anchored to `surfaceHeight`.
 * Footprint-centred, facing +Z. Built in real metres.
 */
export function BookStack({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const spineColor = readStr(props, 'spineColor', '#7a4028')
  const accentColor = readStr(props, 'accentColor', '#3b5a6b')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0.05)

  const mat0 = getSurfaceMaterial(finish, spineColor, 1, sheen)
  const mat1 = getSurfaceMaterial(finish, accentColor, 1, sheen)
  const mat2 = getSurfaceMaterial(finish, '#8a6840', 1, sheen)
  const mat3 = getSurfaceMaterial(finish, '#4b6b3b', 1, sheen)
  const mat4 = getSurfaceMaterial(finish, '#5a3f5f', 1, sheen)
  const pageMat = getSurfaceMaterial('painted', '#f0ead8', 1, 0)

  // Horizontal stack: 4 books lying flat, slightly staggered in XZ
  const stack = [
    { w: 0.19, h: 0.032, d: 0.13, mat: mat0, ox: 0, oz: 0 },
    { w: 0.17, h: 0.028, d: 0.12, mat: mat1, ox: 0.005, oz: -0.004 },
    { w: 0.2, h: 0.036, d: 0.135, mat: mat2, ox: -0.004, oz: 0.003 },
    { w: 0.16, h: 0.026, d: 0.11, mat: mat3, ox: 0.006, oz: -0.002 },
  ]

  // Leaning books on one end of the stack
  const leaners = [
    { w: 0.13, h: 0.18, d: 0.018, angle: 0.18, mat: mat4, ox: 0.12, oz: 0.005 },
    { w: 0.12, h: 0.16, d: 0.016, angle: 0.08, mat: mat0, ox: 0.145, oz: -0.008 },
  ]

  let stackY = surfaceH
  return (
    <group position={[-0.05, 0, 0]}>
      {/* Horizontal stack — books stacked bottom-up, each resting on the last */}
      {stack.map((b, i) => {
        const y = stackY + b.h / 2
        stackY += b.h
        return (
          <group key={i} position={[b.ox, y, b.oz]}>
            {/* Spine / cover */}
            <BeveledBox
              args={[b.w, b.h, b.d]}
              material={b.mat}
              castShadow
              receiveShadow
              bevel={0.003}
            />
            {/* Page edges — inset from the spine width AND recessed 4 mm behind
                the cover fore-edge (the cover boards overhang the block), so the
                page front doesn't sit coplanar with the cover front → no z-fight. */}
            <mesh position={[0, 0, (b.d - 0.003) / 2 - 0.004]}>
              <boxGeometry args={[b.w - 0.005, b.h - 0.002, 0.003]} />
              <meshStandardMaterial {...(pageMat as object)} />
            </mesh>
          </group>
        )
      })}
      {/* Two leaning books at the right end of the stack */}
      {leaners.map((l, i) => (
        <group
          key={`l${i}`}
          position={[l.ox, surfaceH + l.h / 2 - 0.01, l.oz]}
          rotation={[0, 0, l.angle]}
        >
          <BeveledBox args={[l.d, l.h, l.w]} material={l.mat} castShadow bevel={0.003} />
        </group>
      ))}
    </group>
  )
}
