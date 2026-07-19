import { useMemo } from 'react'
import { getSolidMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { InstancedBoxes } from './InstancedBoxes'
import { readNum, readStr } from './shared'
import {
  buildStaircase,
  type StaircasePart,
  type StaircaseRailing,
  type StaircaseStyle,
  staircaseInstanceBuckets,
} from './staircaseModel'

const STYLES: readonly StaircaseStyle[] = ['straight', 'lshape', 'ushape', 'spiral']
const RAILINGS: readonly StaircaseRailing[] = ['none', 'side', 'both']

function asStyle(v: string): StaircaseStyle {
  return (STYLES as readonly string[]).includes(v) ? (v as StaircaseStyle) : 'straight'
}
function asRailing(v: string): StaircaseRailing {
  return (RAILINGS as readonly string[]).includes(v) ? (v as StaircaseRailing) : 'none'
}

/**
 * Parametric staircase. The geometry is computed by the pure `buildStaircase`
 * model (treads / risers / landings / railing posts + handrail / spiral newel)
 * and this component only maps each `StaircasePart` onto a mesh: every part is a
 * box at `part.position` rotated by `part.rot` around Y. Treads + landings take
 * a wood/painted/etc. surface material from `material`/`color`; risers darken
 * the same tint slightly; railings + the spiral newel use a brushed-metal solid.
 * Built in real metres, floor-anchored, footprint-centred, first flight facing
 * +Z — matching the other primitives.
 */
export function Staircase({ props }: { props: ParamProps }) {
  const style = asStyle(readStr(props, 'style', 'straight'))
  const steps = readNum(props, 'steps', 13)
  const width = readNum(props, 'width', 0.9)
  const riserHeight = readNum(props, 'riserHeight', 0.17)
  const treadDepth = readNum(props, 'treadDepth', 0.26)
  const railing = asRailing(readStr(props, 'railing', 'side'))
  const material = readStr(props, 'material', 'wood')
  const color = readStr(props, 'color', '#9c6b3f')

  const parts = useMemo<StaircasePart[]>(
    () => buildStaircase({ style, steps, width, riserHeight, treadDepth, railing }),
    [style, steps, width, riserHeight, treadDepth, railing],
  )

  const treadMat = getSurfaceMaterial(material, color, 1.2)
  const riserMat = getSurfaceMaterial(material, color, 1.2, 0)
  const metalMat = getSolidMaterial('#c2c7cb', 0.3, 0.8)

  // Bucket parts for instancing: risers (one surface material) and metal members
  // (posts/rails/newel, one brushed-metal material) each collapse to ONE
  // InstancedBoxes draw call — ~26 per-part meshes → 2 for a default flight.
  // Treads + landings stay as BeveledBox meshes: their subtle chamfer catches
  // light on the visible horizontal surface, and there is no instanced
  // beveled-box primitive (instancing them would drop the chamfer — a visible
  // regression on the most prominent stair surface). Rotation (incl. the rail's
  // pitch/roll rake) is baked into the instance matrix as T·R·S, exactly
  // matching the old per-mesh `rotation={[pitch, rot, roll]}` (AE=0, unit-tested).
  const { risers, metal, meshParts } = useMemo(() => staircaseInstanceBuckets(parts), [parts])

  return (
    <group>
      {meshParts.map((p, i) => (
        <BeveledBox
          // biome-ignore lint/suspicious/noArrayIndexKey: parts list is stable per spec
          key={i}
          castShadow
          receiveShadow
          position={p.position}
          rotation={[p.pitch ?? 0, p.rot ?? 0, p.roll ?? 0]}
          material={treadMat}
          args={p.size}
        />
      ))}
      {risers.length > 0 && (
        <InstancedBoxes instances={risers} castShadow receiveShadow>
          <primitive object={riserMat} attach="material" />
        </InstancedBoxes>
      )}
      {metal.length > 0 && (
        <InstancedBoxes instances={metal} castShadow receiveShadow>
          <primitive object={metalMat} attach="material" />
        </InstancedBoxes>
      )}
    </group>
  )
}
