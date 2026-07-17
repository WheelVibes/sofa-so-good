import { RoundedBox } from '@react-three/drei'
import type { Material } from 'three'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { nestPieces } from '../defs/nestingTables'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Small side / end table beside a sofa, armchair, or bed. Shapes:
 *  'round' = round top on three splayed legs (LÖVBACKEN-style); 'square' =
 *  square top on four straight legs (LACK/Hemnes-style); 'drum' = a solid
 *  cylindrical pedestal. `diameter` is the top size for all. The `set` enum
 *  turns it into a nesting set of 2–3 round tables of decreasing size + height
 *  that tuck together (a nest always renders round pieces regardless of the
 *  shape choice — the classic nesting look). Faces +Z. */
export function SideTable({ props }: { props: ParamProps }) {
  const diameter = readNum(props, 'diameter', 0.45)
  const totalH = readNum(props, 'height', 0.5)
  const topColor = readStr(props, 'topColor', '#9e7b53')
  const legColor = readStr(props, 'legColor', '#4a3722')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const shape = readStr(props, 'shape', 'round')
  const set = readStr(props, 'set', 'single')

  const topThk = 0.035
  const topMat = getSurfaceMaterial(finish, topColor, 0.8, sheen)
  const legMat = getSurfaceMaterial(finish, legColor, 0.8, sheen)
  const detail = useDetail()

  // ── Nesting set: 2–3 round tables staggered along +X, each ~4 cm shorter so
  // the smaller ones tuck under the larger. The small height step keeps each
  // table's top face within ε of the next taller one's underside → the whole
  // set reads as one connected assembly for the structural harness. ──────────
  if (set !== 'single') {
    // hStep = topThk + 4 mm: the tuck gap between a piece's top and the next
    // taller piece's top underside stays under the 8 mm connectivity epsilon.
    const hStep = topThk + 0.004
    const pieces = nestPieces(diameter, set)
    return (
      <group>
        {pieces.map((p, i) => (
          <RoundTable
            key={i}
            x={p.x}
            r={p.r}
            totalH={totalH - i * hStep}
            topThk={topThk}
            topMat={topMat}
            legMat={legMat}
            detail={detail}
          />
        ))}
      </group>
    )
  }

  const r = diameter / 2
  const legH = totalH - topThk

  if (shape === 'square') {
    const legT = 0.04
    const inset = legT / 2 + 0.015
    const xs = [-r + inset, r - inset]
    return (
      <group>
        <RoundedBox
          args={[diameter, topThk, diameter]}
          radius={0.01}
          smoothness={2}
          castShadow
          receiveShadow
          position={[0, totalH - topThk / 2, 0]}
          material={topMat}
        />
        {xs.map((x) =>
          xs.map((z) => (
            <mesh key={`${x}.${z}`} castShadow position={[x, legH / 2, z]} material={legMat}>
              <boxGeometry args={[legT, legH, legT]} />
            </mesh>
          )),
        )}
      </group>
    )
  }

  if (shape === 'drum') {
    // Solid cylindrical pedestal sitting just off the floor on a recessed base.
    const baseH = 0.02
    return (
      <group>
        {/* Recessed plinth */}
        <mesh castShadow position={[0, baseH / 2, 0]} material={legMat}>
          <cylinderGeometry args={[r - 0.04, r - 0.04, baseH, seg(32, detail)]} />
        </mesh>
        {/* Drum body */}
        <mesh
          castShadow
          receiveShadow
          position={[0, baseH + (totalH - baseH) / 2, 0]}
          material={topMat}
        >
          <cylinderGeometry args={[r, r, totalH - baseH, seg(36, detail)]} />
        </mesh>
      </group>
    )
  }

  // Round top on three splayed legs.
  return (
    <RoundTable
      x={0}
      r={r}
      totalH={totalH}
      topThk={topThk}
      topMat={topMat}
      legMat={legMat}
      detail={detail}
    />
  )
}

/** A round top on three splayed legs, centred at local X = `x`. Shared by the
 *  single round shape and every piece of a nesting set. */
function RoundTable({
  x,
  r,
  totalH,
  topThk,
  topMat,
  legMat,
  detail,
}: {
  x: number
  r: number
  totalH: number
  topThk: number
  topMat: Material
  legMat: Material
  detail: number
}) {
  const legR = 0.018
  const splay = r * 0.62
  const legH = totalH - topThk
  return (
    <group position={[x, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, totalH - topThk / 2, 0]} material={topMat}>
        <cylinderGeometry args={[r, r, topThk, seg(28, detail)]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6
        const tx = Math.sin(a) * (r - 0.05)
        const tz = Math.cos(a) * (r - 0.05)
        const bx = Math.sin(a) * splay
        const bz = Math.cos(a) * splay
        const mx = (tx + bx) / 2
        const mz = (tz + bz) / 2
        const lean = Math.atan2(Math.hypot(bx - tx, bz - tz), legH)
        return (
          <mesh
            key={i}
            castShadow
            position={[mx, legH / 2, mz]}
            rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
            material={legMat}
          >
            <cylinderGeometry args={[legR, legR * 0.7, legH, seg(10, detail, 8)]} />
          </mesh>
        )
      })}
    </group>
  )
}
