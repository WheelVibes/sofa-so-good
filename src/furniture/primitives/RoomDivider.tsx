import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes } from './InstancedBoxes'
import { readNum, readStr } from './shared'
import { battenCount, battenOffset, battenStep } from './slatLayout'

/**
 * Freestanding room divider — a timber screen for zoning an open-concept flat
 * (living ↔ dining) or screening an entry foyer. `style` is a see-through run
 * of vertical 'slat' battens, a solid 'fluted' panel, or an open 'grid'
 * lattice. Sits in a slim floor frame so it stands on its own. Thin footprint,
 * tall; a real obstacle (collides), faces +Z. Built at real-world metres.
 */
export function RoomDivider({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.6)
  const height = readNum(props, 'height', 2.0)
  const color = readStr(props, 'color', '#7a5c3c')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'slat')

  const mat = getSurfaceMaterial(finish, color, 1.4, sheen)
  const frameT = 0.05 // frame post / rail thickness
  const depth = 0.06 // screen thickness
  const innerW = width - frameT * 2
  const innerH = height - frameT * 2

  // Slat / grid spacing.
  const battenW = 0.035
  const gap = style === 'grid' ? 0.11 : 0.075
  const nCols = battenCount(innerW, battenW, gap)
  const colStep = battenStep(innerW, battenW, nCols)
  const nRows = style === 'grid' ? battenCount(innerH, battenW, gap) : 0
  const rowStep = battenStep(innerH, battenW, nRows)

  // Every wood part is an axis-aligned box sharing `mat` — the outer frame
  // (two posts + top/bottom rails), the solid fluted backing panel, and the
  // slat/grid battens. Collapse them all into one InstancedMesh (one draw call)
  // instead of one mesh per batten (~20+ for a wide grid). Only the fluted
  // half-round ribs are cylinders, so they stay as separate meshes.
  const boxes: BoxInstance[] = [
    // Outer frame posts.
    { position: [-(width / 2 - frameT / 2), height / 2, 0], size: [frameT, height, depth] },
    { position: [width / 2 - frameT / 2, height / 2, 0], size: [frameT, height, depth] },
    // Top/bottom rails.
    { position: [0, frameT / 2, 0], size: [width - frameT * 2, frameT, depth] },
    { position: [0, height - frameT / 2, 0], size: [width - frameT * 2, frameT, depth] },
  ]
  if (style === 'fluted') {
    // Solid backing panel for the flutes.
    boxes.push({ position: [0, height / 2, 0], size: [innerW, innerH, depth * 0.6] })
  } else {
    // Vertical battens (slat + grid).
    for (let i = 0; i < nCols; i++) {
      const x = battenOffset(innerW, battenW, colStep, i)
      boxes.push({ position: [x, height / 2, 0], size: [battenW, innerH, depth * 0.7] })
    }
    // Horizontal battens for the grid lattice.
    if (style === 'grid') {
      for (let j = 0; j < nRows; j++) {
        const y = frameT + battenW / 2 + j * rowStep
        boxes.push({ position: [0, y, 0], size: [innerW, battenW, depth * 0.7] })
      }
    }
  }

  return (
    <group>
      <InstancedBoxes instances={boxes} castShadow receiveShadow>
        <primitive object={mat} attach="material" />
      </InstancedBoxes>
      {/* Fluted half-round ribs (cylinders, so not instanced with the boxes). */}
      {style === 'fluted' &&
        Array.from({ length: nCols }, (_, i) => {
          const x = battenOffset(innerW, battenW, colStep, i)
          return (
            <mesh key={i} castShadow position={[x, height / 2, depth * 0.35]} material={mat}>
              <cylinderGeometry
                args={[battenW / 2, battenW / 2, innerH, 8, 1, false, 0, Math.PI]}
              />
            </mesh>
          )
        })}
    </group>
  )
}
