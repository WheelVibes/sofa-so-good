import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { type BoxInstance, InstancedBoxes } from './InstancedBoxes'
import { metalLeg, readNum, readStr } from './shared'

/** Tall utility / broom cabinet — the HDB service-yard / store-room full-height
 *  cupboard for brooms, mops, the vacuum and cleaning stock. A closed carcass on
 *  a recessed dark plinth (toe-kick) with two interior shelves in the upper
 *  third; proud door fronts stand OUTSIDE the carcass with a shadow-gap reveal
 *  (the TVConsole lesson — fronts never buried). `doors`: single / double.
 *  `doorStyle`: panel (flat) or louvre (horizontal slats, InstancedBoxes).
 *  Faces +Z. Real metres, floor-anchored. */
export function UtilityCabinet({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.5)
  const depth = readNum(props, 'depth', 0.4)
  const height = readNum(props, 'height', 2.0)
  const bodyColor = readStr(props, 'color', '#e4ddcf')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const doors = readStr(props, 'doors', 'single')
  const doorStyle = readStr(props, 'doorStyle', 'panel')
  const double = doors === 'double'
  const louvre = doorStyle === 'louvre'

  const plinthH = 0.07
  const panelT = 0.018
  const carcassBottom = plinthH
  const carcassH = height - plinthH
  const innerW = width - panelT * 2
  const wood = getSurfaceMaterial(finish, bodyColor, 1.2, sheen)
  const handleMat = metalLeg('#3a3d42', 'satin')

  // Door front geometry (proud of the carcass, shadow-gap reveal).
  const gap = 0.008
  const doorZ = depth / 2 + 0.006 // door centre — back overlaps the carcass front
  const doorH = carcassH - gap * 2
  const doorY = carcassBottom + carcassH / 2
  const leaves = double ? 2 : 1
  const leafW = (innerW - gap * (leaves + 1)) / leaves

  // Interior shelves (upper third), behind the closed doors.
  const shelfYs = [carcassBottom + carcassH * 0.62, carcassBottom + carcassH * 0.8]

  const renderLeaf = (cx: number, hingeRight: boolean) => {
    if (!louvre) {
      return (
        <group key={cx}>
          <BeveledBox
            castShadow
            receiveShadow
            position={[cx, doorY, doorZ]}
            material={wood}
            args={[leafW, doorH, panelT]}
          />
          {/* Vertical bar handle near the meeting edge */}
          <mesh
            castShadow
            position={[
              cx + (hingeRight ? -leafW / 2 + 0.03 : leafW / 2 - 0.03),
              doorY,
              doorZ + 0.02,
            ]}
            material={handleMat}
          >
            <boxGeometry args={[0.02, 0.22, 0.024]} />
          </mesh>
        </group>
      )
    }
    // Louvre leaf: a frame (2 stiles + top/bottom rail) with tilted slats.
    const stileW = 0.04
    const railH = 0.05
    const slatFieldH = doorH - railH * 2
    const slatCount = Math.max(6, Math.round(slatFieldH / 0.06))
    const slatGap = slatFieldH / slatCount
    const slats: BoxInstance[] = Array.from({ length: slatCount }, (_, i) => ({
      position: [cx, doorY - slatFieldH / 2 + slatGap * (i + 0.5), doorZ + 0.002],
      size: [leafW - stileW * 2 + 0.006, 0.02, panelT + 0.01],
      rotation: [0.42, 0, 0],
    }))
    return (
      <group key={cx}>
        {/* Stiles */}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={s}
            castShadow
            position={[cx + s * (leafW / 2 - stileW / 2), doorY, doorZ]}
            material={wood}
            args={[stileW, doorH, panelT]}
          />
        ))}
        {/* Top + bottom rails */}
        {[doorY + doorH / 2 - railH / 2, doorY - doorH / 2 + railH / 2].map((y, i) => (
          <BeveledBox
            key={`r${i}`}
            castShadow
            position={[cx, y, doorZ]}
            material={wood}
            args={[leafW, railH, panelT]}
          />
        ))}
        {/* Tilted louvre slats (one draw call) */}
        <InstancedBoxes instances={slats} castShadow>
          <primitive object={wood} attach="material" />
        </InstancedBoxes>
        <mesh
          castShadow
          position={[cx + (hingeRight ? -leafW / 2 + 0.05 : leafW / 2 - 0.05), doorY, doorZ + 0.02]}
          material={handleMat}
        >
          <boxGeometry args={[0.02, 0.22, 0.024]} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Recessed plinth / toe-kick (grounded) */}
      <mesh castShadow position={[0, plinthH / 2, -0.01]}>
        <boxGeometry args={[width - 0.04, plinthH, depth - 0.04]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Side panels */}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={s}
          castShadow
          receiveShadow
          position={[s * (width / 2 - panelT / 2), carcassBottom + carcassH / 2, 0]}
          material={wood}
          args={[panelT, carcassH, depth]}
        />
      ))}
      {/* Back panel */}
      <BeveledBox
        receiveShadow
        position={[0, carcassBottom + carcassH / 2, -depth / 2 + panelT / 2]}
        material={wood}
        args={[innerW, carcassH, panelT]}
      />
      {/* Bottom + top decks */}
      {[carcassBottom + panelT / 2, height - panelT / 2].map((y, i) => (
        <BeveledBox
          key={`d${i}`}
          castShadow
          receiveShadow
          position={[0, y, 0]}
          material={wood}
          args={[innerW, panelT, depth]}
        />
      ))}
      {/* Interior shelves (upper third) */}
      {shelfYs.map((y, i) => (
        <BeveledBox
          key={`s${i}`}
          receiveShadow
          position={[0, y, 0.006]}
          material={wood}
          args={[innerW, panelT, depth - panelT]}
        />
      ))}
      {/* Doors */}
      {double
        ? [renderLeaf(-(leafW + gap) / 2, false), renderLeaf((leafW + gap) / 2, true)]
        : renderLeaf(0, true)}
    </group>
  )
}
