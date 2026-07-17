import { getMetalMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Raised feeding station — a timber stand carrying one or two recessed steel
 * bowls at a comfortable height for a small→medium dog (an elevated feeder eases
 * neck strain). The stand is a top board on four legs; each bowl sits in a dark
 * recess ring with a tapered stainless bowl inside. Floor-anchored,
 * footprint-centred, faces +Z; keep clear access in front (`frontClearance`).
 * Real metres.
 */
export function FeedingStation({ props }: { props: ParamProps }) {
  const bowls = readStr(props, 'bowls', '2')
  const standH = readNum(props, 'standHeight', 0.14)
  const standColor = readStr(props, 'color', '#9d7c54')
  const finish = readStr(props, 'finish', 'wood')
  const bowlColor = readStr(props, 'bowlColor', '#c9ccd0')
  const detail = useDetail()
  const r = seg(24, detail)

  const wood = getSurfaceMaterial(finish, standColor, 1.1)
  const steel = getMetalMaterial(bowlColor, 'stainless')
  const recessMat = getSurfaceMaterial('painted', '#33363b', 1)

  const n = bowls === '1' ? 1 : 2
  const bowlR = 0.1
  const topT = 0.03
  const legT = 0.04
  // Board just wide enough for the bowls with margins.
  const w = n === 1 ? bowlR * 2 + 0.1 : bowlR * 4 + 0.16
  const d = bowlR * 2 + 0.08
  const topY = standH + topT / 2
  const boardTop = standH + topT
  const halfW = w / 2
  const halfD = d / 2
  const centres = n === 1 ? [0] : [-(bowlR + 0.03), bowlR + 0.03]

  return (
    <group>
      {/* Top board. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, topY, 0]}
        material={wood}
        args={[w, topT, d]}
      />
      {/* Four legs. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <BeveledBox
            key={`leg${sx}${sz}`}
            castShadow
            receiveShadow
            position={[sx * (halfW - legT / 2 - 0.01), standH / 2, sz * (halfD - legT / 2 - 0.01)]}
            material={wood}
            args={[legT, standH, legT]}
          />
        )),
      )}
      {/* Bowls: a steel bowl sitting proud in a thin recess ring so the steel
          rim reads from above (not a dark hole). */}
      {centres.map((cx) => (
        <group key={cx.toFixed(3)} position={[cx, boardTop, 0]}>
          {/* Thin recess ring at the board surface (the cut-out lip). */}
          <mesh
            receiveShadow
            position={[0, 0.001, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={recessMat}
          >
            <ringGeometry args={[bowlR * 0.88, bowlR + 0.01, r]} />
          </mesh>
          {/* Steel bowl: a shallow tapered well; its wide rim sits just above the
              board so the stainless catches light. */}
          <mesh castShadow receiveShadow position={[0, 0.005, 0]} material={steel}>
            <cylinderGeometry args={[bowlR * 0.88, bowlR * 0.55, 0.055, r]} />
          </mesh>
          {/* Inner base of the bowl (a slightly darker steel disc for depth). */}
          <mesh receiveShadow position={[0, -0.018, 0]} material={steel}>
            <cylinderGeometry args={[bowlR * 0.55, bowlR * 0.55, 0.004, r]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
