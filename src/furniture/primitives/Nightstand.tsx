import { getSurfaceMaterial, getSurfaceMaterialForBox } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/** Bedside cabinet on short legs. Styles: 'drawers' (two drawer fronts),
 *  'drawer-shelf' (one top drawer over an open cubby), and 'open' (a single
 *  open cubby with a mid shelf). Faces +Z. */
/** Legacy named `size` values (m) — current enum values are metre strings
 *  ('0.38'/'0.45'/'0.6') parsed directly, so the footprint resolver tracks them. */
const NIGHTSTAND_WIDTH: Record<string, number> = { narrow: 0.38, standard: 0.45, wide: 0.6 }

export function Nightstand({ props }: { props: ParamProps }) {
  const size = readStr(props, 'size', '0.45')
  const sizeWidth = NIGHTSTAND_WIDTH[size] ?? Number(size)
  // Back-compat: an older placed item may still carry a numeric `width` prop.
  const width = readNum(props, 'width', Number.isFinite(sizeWidth) ? sizeWidth : 0.45)
  const depth = readNum(props, 'depth', 0.4)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'drawers')

  const legH = 0.1
  const bodyH = 0.42
  const wood = getSurfaceMaterial(finish, color, 1, sheen)
  // GRAIN-SCALE: size the visible face's grain from world dimensions and run it
  // along the panel's long axis, instead of one scalar `repeat` that gives every
  // panel its own scale and cross-grains the wide ones (see materials/CLAUDE.md).
  const frontFor = (dims: [number, number, number]) =>
    getSurfaceMaterialForBox(finish, color, dims, sheen)
  const knob = (key: string, cy: number) => (
    <mesh key={key} castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, cy, depth / 2 + 0.025]}>
      <cylinderGeometry args={[0.016, 0.016, 0.035, 10]} />
      <MetalMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
    </mesh>
  )
  const drawerFront = (key: string, cy: number, h: number) => (
    <BeveledBox
      key={key}
      position={[0, cy, depth / 2 + 0.003]}
      material={frontFor([width * 0.84, h, 0.02])}
      args={[width * 0.84, h, 0.02]}
    />
  )

  const legs = [-1, 1].map((sx) =>
    [-1, 1].map((sz) => (
      <BeveledBox
        key={`${sx}.${sz}`}
        castShadow
        position={[sx * (width / 2 - 0.05), legH / 2, sz * (depth / 2 - 0.05)]}
        args={[0.04, legH, 0.04]}
      >
        <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.1} />
      </BeveledBox>
    )),
  )

  if (style === 'drawers') {
    return (
      <group>
        {/* Body */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, legH + bodyH / 2, 0]}
          material={wood}
          args={[width, bodyH, depth]}
        />
        {[0, 1].map((i) => {
          const cy = legH + bodyH * (i === 0 ? 0.72 : 0.28)
          return (
            <group key={i}>
              {drawerFront(`d${i}`, cy, bodyH * 0.38)}
              {knob(`k${i}`, cy)}
            </group>
          )
        })}
        {legs}
      </group>
    )
  }

  // Frame-based styles (open cubby, optionally with a top drawer).
  const wall = 0.02
  const topY = legH + bodyH
  const hasTopDrawer = style === 'drawer-shelf'
  const drawerH = hasTopDrawer ? bodyH * 0.34 : 0
  // The cubby spans from just above the legs up to the underside of the
  // drawer (or the top, when fully open).
  const cubbyTop = topY - drawerH - (hasTopDrawer ? wall : 0)
  const cubbyBottom = legH + wall
  const midShelfY = (cubbyTop + cubbyBottom) / 2

  return (
    <group>
      {/* Top slab */}
      <mesh castShadow receiveShadow position={[0, topY - wall / 2, 0]} material={wood}>
        <boxGeometry args={[width, wall, depth]} />
      </mesh>
      {/* Bottom slab */}
      <mesh castShadow position={[0, legH + wall / 2, 0]} material={wood}>
        <boxGeometry args={[width, wall, depth]} />
      </mesh>
      {/* Sides */}
      {[-1, 1].map((s) => (
        <mesh
          key={`s${s}`}
          castShadow
          position={[s * (width / 2 - wall / 2), legH + bodyH / 2, 0]}
          material={wood}
        >
          <boxGeometry args={[wall, bodyH, depth]} />
        </mesh>
      ))}
      {/* Back panel */}
      <mesh receiveShadow position={[0, legH + bodyH / 2, -depth / 2 + wall / 2]} material={wood}>
        <boxGeometry args={[width - wall * 2, bodyH, wall]} />
      </mesh>
      {/* Mid shelf inside the cubby */}
      <mesh castShadow receiveShadow position={[0, midShelfY, 0]} material={wood}>
        <boxGeometry args={[width - wall * 2, wall, depth - wall]} />
      </mesh>
      {/* Top drawer (drawer-shelf only) */}
      {hasTopDrawer && (
        <>
          {drawerFront('topd', topY - drawerH / 2 - wall, drawerH)}
          {knob('topk', topY - drawerH / 2 - wall)}
        </>
      )}
      {legs}
    </group>
  )
}
