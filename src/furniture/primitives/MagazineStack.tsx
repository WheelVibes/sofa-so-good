import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Stack of magazines — 3–5 thin magazines lying flat in a slightly fanned stack,
 * optionally with one open or at angle. Tabletop or coffee-table prop.
 * Rests at `surfaceHeight`. Floor-anchored, facing +Z.
 * Distinct from BookStack (thinner, larger format, different silhouette).
 */
export function MagazineStack({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const color1 = readStr(props, 'color1', '#c03030')
  const color2 = readStr(props, 'color2', '#2c5a8a')
  const color3 = readStr(props, 'color3', '#c8a840')

  const mat1 = getSurfaceMaterial('gloss', color1, 1, 0.3)
  const mat2 = getSurfaceMaterial('gloss', color2, 1, 0.3)
  const mat3 = getSurfaceMaterial('gloss', color3, 1, 0.3)
  const mat4 = getSurfaceMaterial('gloss', '#4a6840', 1, 0.3)
  const mat5 = getSurfaceMaterial('gloss', '#7a3070', 1, 0.3)
  const pageMat = getSurfaceMaterial('painted', '#f0ead8', 1, 0)

  // Magazines: wider and thinner than books; slightly different fan angles
  const mags = [
    { w: 0.28, h: 0.01, d: 0.22, mat: mat1, angle: 0 },
    { w: 0.27, h: 0.01, d: 0.21, mat: mat2, angle: 0.12 },
    { w: 0.26, h: 0.01, d: 0.2, mat: mat3, angle: -0.08 },
    { w: 0.28, h: 0.009, d: 0.22, mat: mat4, angle: 0.05 },
    { w: 0.25, h: 0.009, d: 0.19, mat: mat5, angle: -0.15 },
  ]

  let stackY = surfaceH
  return (
    <group>
      {mags.map((m, i) => {
        const y = stackY + m.h / 2
        stackY += m.h
        return (
          <group key={i} position={[0, y, 0]} rotation={[0, m.angle, 0]}>
            {/* Cover */}
            <BeveledBox
              args={[m.w, m.h, m.d]}
              material={m.mat}
              castShadow
              receiveShadow
              bevel={0.002}
            />
            {/* Page edge — front face, slightly inset */}
            <mesh position={[0, 0, m.d / 2 + 0.001]}>
              <boxGeometry args={[m.w - 0.003, m.h - 0.001, 0.002]} />
              <meshStandardMaterial {...(pageMat as object)} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
