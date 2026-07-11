import { useMemo } from 'react'
import type { ParamProps } from '../types'
import { InstancedCylinders } from './InstancedBoxes'
import { metalLeg, readNum, readStr } from './shared'
import { dryingRackCylinders } from './slatLayout'

/** Foldable A-frame clothes drying rack (a ubiquitous HDB service-yard item):
 *  two splayed leg frames joined by horizontal drying bars. Faces +Z. Every
 *  member is a plain metal rod sharing one brushed-metal material, so the whole
 *  frame renders as a single rotation-capable `InstancedCylinders` draw call
 *  (previously ~11 individual cylinder meshes). The rod layout is pure geometry
 *  in `slatLayout.ts`, rebuilt only when the width changes. */
export function DryingRack({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const color = readStr(props, 'color', '#c9ccd1')
  // Legs / foot rails / drying bars route through the shared brushed-metal
  // material (soft satin brushing, tinted by the rack colour).
  const metal = metalLeg(color, 'satin')
  const rods = useMemo(() => dryingRackCylinders(width), [width])

  return (
    <group>
      <InstancedCylinders instances={rods} radialSegments={8} castShadow>
        <primitive object={metal} attach="material" />
      </InstancedCylinders>
    </group>
  )
}
