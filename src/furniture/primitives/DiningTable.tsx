import { getSurfaceMaterial, getWoodMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

interface DiningTableProps {
  props: ParamProps
}

const SEAT_DIMENSIONS: Record<string, { w: number; d: number }> = {
  '4': { w: 1.4, d: 0.85 },
  '6': { w: 1.8, d: 0.95 },
  '8': { w: 2.2, d: 1.0 },
}

/**
 * Dining table primitive: rectangular top + 4 legs.
 * Footprint width/depth are derived from the `seats` enum so the
 * inspector exposes a single dropdown rather than two sliders.
 */
export function DiningTable({ props }: DiningTableProps) {
  const seatsKey = readStr(props, 'seats', '4')
  const dim = SEAT_DIMENSIONS[seatsKey] ?? SEAT_DIMENSIONS['4']
  const topColor = readStr(props, 'topColor', '#9e7b53')
  const legColor = readStr(props, 'legColor', '#5b4126')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const shape = readStr(props, 'shape', 'rect')

  const topThickness = 0.04
  const totalH = 0.74
  const legThickness = 0.06
  const legInset = 0.1

  const legY = (totalH - topThickness) / 2
  const xL = -dim.w / 2 + legInset + legThickness / 2
  const xR = dim.w / 2 - legInset - legThickness / 2
  const zN = -dim.d / 2 + legInset + legThickness / 2
  const zS = dim.d / 2 - legInset - legThickness / 2

  const legPositions: [number, number, number][] = [
    [xL, legY, zN],
    [xR, legY, zN],
    [xL, legY, zS],
    [xR, legY, zS],
  ]

  const topMat = getSurfaceMaterial(finish, topColor, 1.5, sheen)
  const legMat = getWoodMaterial(legColor, 0.5)

  // Oval table: an elongated top on a twin-pedestal trestle (two columns +
  // cross-feet along the length, extended-DOCKSTA style).
  if (shape === 'oval') {
    const rx = dim.w / 2
    const scaleZ = dim.d / dim.w
    const colX = dim.w * 0.26
    const colH = totalH - topThickness - 0.04
    return (
      <group>
        <mesh
          castShadow
          receiveShadow
          position={[0, totalH - topThickness / 2, 0]}
          scale={[1, 1, scaleZ]}
          material={topMat}
        >
          <cylinderGeometry args={[rx, rx, topThickness, 48]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            {/* Column */}
            <mesh castShadow position={[s * colX, colH / 2 + 0.04, 0]} material={legMat}>
              <cylinderGeometry args={[0.06, 0.08, colH, 18]} />
            </mesh>
            {/* Cross-foot running across the depth */}
            <mesh castShadow receiveShadow position={[s * colX, 0.03, 0]} material={legMat}>
              <boxGeometry args={[0.1, 0.05, dim.d * 0.62]} />
            </mesh>
          </group>
        ))}
        {/* Stretcher beam linking the two pedestals */}
        <mesh castShadow position={[0, 0.12, 0]} material={legMat}>
          <boxGeometry args={[colX * 2, 0.05, 0.05]} />
        </mesh>
      </group>
    )
  }

  // Round pedestal table (IKEA DOCKSTA / LISABO style): circular top on a
  // central column + disc foot. Diameter fits the seat footprint.
  if (shape === 'round') {
    const radius = Math.min(dim.w, dim.d) / 2
    return (
      <group>
        <mesh
          castShadow
          receiveShadow
          position={[0, totalH - topThickness / 2, 0]}
          material={topMat}
        >
          <cylinderGeometry args={[radius, radius, topThickness, 40]} />
        </mesh>
        {/* Pedestal column */}
        <mesh castShadow position={[0, (totalH - topThickness) / 2 + 0.04, 0]} material={legMat}>
          <cylinderGeometry args={[0.07, 0.09, totalH - topThickness - 0.04, 20]} />
        </mesh>
        {/* Disc foot */}
        <mesh castShadow receiveShadow position={[0, 0.025, 0]} material={legMat}>
          <cylinderGeometry args={[radius * 0.42, radius * 0.46, 0.05, 28]} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, totalH - topThickness / 2, 0]} material={topMat}>
        <boxGeometry args={[dim.w, topThickness, dim.d]} />
      </mesh>
      {legPositions.map((p, i) => (
        <mesh key={i} castShadow position={p} material={legMat}>
          <boxGeometry args={[legThickness, totalH - topThickness, legThickness]} />
        </mesh>
      ))}
      {/* Apron rails just under the top, connecting the legs. */}
      {(() => {
        const apronH = 0.06
        const apronY = totalH - topThickness - apronH / 2 - 0.01
        const innerW = dim.w - legInset * 2
        const innerD = dim.d - legInset * 2
        return (
          <>
            {[zN, zS].map((z, i) => (
              <mesh key={`la${i}`} castShadow position={[0, apronY, z]} material={legMat}>
                <boxGeometry args={[innerW, apronH, 0.03]} />
              </mesh>
            ))}
            {[xL, xR].map((x, i) => (
              <mesh key={`wa${i}`} castShadow position={[x, apronY, 0]} material={legMat}>
                <boxGeometry args={[0.03, apronH, innerD]} />
              </mesh>
            ))}
          </>
        )
      })()}
    </group>
  )
}
