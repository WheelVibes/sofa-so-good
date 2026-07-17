import { getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes } from './InstancedBoxes'
import { readNum, readStr } from './shared'

/**
 * Baby crib / cot — a slatted-side cot for a nursery or shared bedroom. Four
 * corner posts carry top rails and vertical slats on all four sides; a mattress
 * sits on an inner platform. `mattressLevel` raises/lowers the base (newborn /
 * sitting), and `endStyle` makes the short ends solid panels or slatted.
 * `convert: 'toddler'` drops the FRONT long side to a low toddler-bed guard
 * (short slats + a low guard rail) while keeping the tall ends/back — a
 * cot-bed conversion. Floor-anchored, centred, faces +Z. Real-world metres.
 */
export function Crib({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.32) // long dimension (along X)
  const depth = readNum(props, 'depth', 0.72)
  const color = readStr(props, 'color', '#cdb89c')
  const mattressColor = readStr(props, 'mattressColor', '#eef1f4')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const endStyle = readStr(props, 'endStyle', 'slat')
  const mattressLevel = readStr(props, 'mattressLevel', 'low')
  const toddler = readStr(props, 'convert', 'crib') === 'toddler'

  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const mattMat = getUpholsteryMaterial('fabric', mattressColor, 0)

  const railTopY = 0.92
  const guardTopY = 0.36 // low toddler-bed guard height on the converted side
  const postT = 0.05
  const slatT = 0.018
  const railT = 0.05
  const platformY = mattressLevel === 'high' ? 0.5 : 0.24

  const hx = width / 2
  const hz = depth / 2

  // The converted side (front, +Z) drops to a low guard; the back/ends stay full.
  const sideTopY = (sz: number) => (toddler && sz === 1 ? guardTopY : railTopY)

  // Vertical slats along a side; n bars spaced evenly between the posts, running
  // from the bottom rail up to `topY` (lowered on a converted toddler side).
  const sideSlats = (axis: 'x' | 'z', topY: number) => {
    const span = (axis === 'x' ? width : depth) - postT * 2
    const n = Math.max(4, Math.round(span / 0.07))
    const step = span / (n - 1)
    const y0 = railT
    const slatH = topY - railT * 2
    return Array.from({ length: n }, (_, i) => {
      const t = -span / 2 + i * step
      return axis === 'x' ? (t as number) : (t as number)
    }).map((t, i) => ({ key: i, t, slatH, y: y0 + slatH / 2 + railT / 2 }))
  }

  // All vertical slats (both long sides, plus both short ends when slatted) are
  // identical axis-aligned boxes sharing the wood material — collapse them into
  // one InstancedMesh (one draw call) instead of ~36–72 separate meshes.
  const slatInstances: BoxInstance[] = []
  for (const sz of [-1, 1]) {
    for (const s of sideSlats('x', sideTopY(sz))) {
      slatInstances.push({
        position: [s.t, s.y, sz * (hz - postT / 2)],
        size: [slatT, s.slatH, slatT],
      })
    }
  }
  if (endStyle !== 'solid') {
    for (const sx of [-1, 1]) {
      for (const s of sideSlats('z', railTopY)) {
        slatInstances.push({
          position: [sx * (hx - postT / 2), s.y, s.t],
          size: [slatT, s.slatH, slatT],
        })
      }
    }
  }

  return (
    <group>
      {/* Corner posts */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`p${sx}.${sz}`}
            castShadow
            receiveShadow
            position={[sx * (hx - postT / 2), railTopY / 2, sz * (hz - postT / 2)]}
            material={wood}
          >
            <boxGeometry args={[postT, railTopY + 0.04, postT]} />
          </mesh>
        )),
      )}

      {/* Top + bottom rails on the two long sides (front side's top rail drops
          to the low toddler guard height when converted) */}
      {[-1, 1].map((sz) =>
        [railT / 2, sideTopY(sz) - railT / 2].map((y, i) => (
          <mesh
            key={`lr${sz}.${i}`}
            castShadow
            position={[0, y, sz * (hz - postT / 2)]}
            material={wood}
          >
            <boxGeometry args={[width - postT * 2, railT, postT]} />
          </mesh>
        )),
      )}
      {/* Top + bottom rails on the two short ends */}
      {[-1, 1].map((sx) =>
        [railT / 2, railTopY - railT / 2].map((y, i) => (
          <mesh
            key={`er${sx}.${i}`}
            castShadow
            position={[sx * (hx - postT / 2), y, 0]}
            material={wood}
          >
            <boxGeometry args={[postT, railT, depth - postT * 2]} />
          </mesh>
        )),
      )}

      {/* All vertical slats (long sides + slatted short ends) in one draw call */}
      <InstancedBoxes instances={slatInstances} castShadow>
        <primitive object={wood} attach="material" />
      </InstancedBoxes>

      {/* Solid short-end panels (when the end style isn't slatted) */}
      {endStyle === 'solid'
        ? [-1, 1].map((sx) => (
            <mesh
              key={`ep${sx}`}
              castShadow
              receiveShadow
              position={[sx * (hx - postT / 2), railTopY / 2, 0]}
              material={wood}
            >
              <boxGeometry args={[postT * 0.8, railTopY - railT, depth - postT * 2]} />
            </mesh>
          ))
        : null}

      {/* Mattress base platform — a solid board spanning to the frame that the
          mattress rests on (previously the mattress floated with no base). */}
      <mesh castShadow receiveShadow position={[0, platformY, 0]} material={wood}>
        <boxGeometry args={[width - postT, 0.02, depth - postT]} />
      </mesh>
      {/* Mattress on the inner platform */}
      <mesh castShadow receiveShadow position={[0, platformY + 0.06, 0]} material={mattMat}>
        <boxGeometry args={[width - postT * 2 - 0.04, 0.1, depth - postT * 2 - 0.04]} />
      </mesh>
    </group>
  )
}
