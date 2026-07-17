import { RoundedBox } from '@react-three/drei'
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

interface ReclinerProps {
  props: ParamProps
}

/** Enclosing bbox depth (metres) — the deep `reclined` state, where the footrest
 *  is fully extended forward and the back is leaned right back. The wall (back)
 *  edge is pinned at −bboxDepth/2 for BOTH modes so the piece only grows FORWARD
 *  into the room when it reclines (sofa-bed precedent). */
export const RECLINER_BBOX_DEPTH = 1.66

/** Per-mode local-z extent [rear, front] of the actual occupied footprint (both
 *  within the ±RECLINER_BBOX_DEPTH/2 bbox). These serve each mode its honest
 *  depth to defs/seating.ts's props-driven footprintParts. `upright` = back
 *  near-vertical + footrest folded down at the seat front; `reclined` = back
 *  leaned ~30° BACKWARD + footrest extended forward as a leg ramp (so the piece
 *  grows both rearward at the head and forward at the feet as it reclines). */
export const RECLINER_EXTENT: Record<string, { rear: number; front: number }> = {
  upright: { rear: -0.6, front: 0.33 },
  reclined: { rear: -0.8, front: 0.73 },
}

/**
 * Reclining armchair. A plush single-seat lounger whose back tilts and whose
 * footrest swings out. Faces +Z (a seated person looks +Z). `position`:
 * 'upright' (back near-vertical, footrest folded down against the seat front) |
 * 'reclined' (back leaned ~30°, footrest deployed forward+up as a padded leg
 * ramp). The footrest stays CONNECTED to the seat in both states via a visible
 * chromed hinge rod + two steel linkage bars. Real metres, footprint-centred,
 * floor-anchored.
 */
export function Recliner({ props }: ReclinerProps) {
  const width = readNum(props, 'width', 0.85)
  const position = readStr(props, 'position', 'upright')
  const color = readStr(props, 'color', '#6b5747')
  const material = readStr(props, 'material', 'leather')
  const pattern = readStr(props, 'pattern', 'plain')
  const sheen = readNum(props, 'sheen', 0)

  const reclined = position === 'reclined'
  const mat = getUpholsteryMaterial(material, color, sheen, pattern)
  const steel = metalLeg('#8a8d92', 'satin')

  // The back (wall) edge is pinned at −RECLINER_BBOX_DEPTH/2 via the back pivot
  // below; the chair grows forward as it reclines.
  const footH = 0.07
  const baseH = 0.33
  const baseTop = footH + baseH // 0.40
  const cushionH = 0.13

  const armW = 0.14
  const innerW = width - armW * 2

  // Back pivot sits forward of the pinned wall edge so the reclined back's
  // rearmost projection lands at ~backZ (keeps the piece inside its bbox).
  const pivotZ = -0.425
  const seatDepth = 0.62
  const seatBackZ = pivotZ
  const seatFrontZ = seatBackZ + seatDepth // 0.195
  const seatCenterZ = (seatBackZ + seatFrontZ) / 2

  const backH = 0.58
  const backThk = 0.14
  const lean = reclined ? 0.5 : 0.08 // radians (≈29° vs near-vertical)

  const armTop = 0.6
  const armH = armTop - footH
  const armCenterZ = (pivotZ + seatFrontZ + 0.05) / 2

  // Footrest deploy geometry (per mode).
  const hingeY = baseTop
  const hingeZ = seatFrontZ + 0.02

  return (
    <group>
      {/* Upholstered seat base block on short feet */}
      <RoundedBox
        args={[width, baseH, seatDepth]}
        radius={0.04}
        smoothness={2}
        castShadow
        receiveShadow
        position={[0, footH + baseH / 2, seatCenterZ]}
        material={mat}
      />
      {/* Seat cushion */}
      <RoundedBox
        args={[innerW + 0.02, cushionH, seatDepth - 0.06]}
        radius={0.05}
        smoothness={3}
        castShadow
        position={[0, baseTop + cushionH / 2, seatCenterZ + 0.02]}
        material={mat}
      />

      {/* Arms (both modes) */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={`arm${s}`}
          args={[armW, armH, seatDepth + 0.1]}
          radius={0.05}
          smoothness={2}
          castShadow
          position={[(s * (width - armW)) / 2, footH + armH / 2, armCenterZ]}
          material={mat}
        />
      ))}

      {/* Reclining back — pivots BACKWARD about the seat-back edge (−lean tilts
          the back top toward −Z / away from the sitter) */}
      <group position={[0, baseTop, pivotZ]} rotation={[-lean, 0, 0]}>
        <RoundedBox
          args={[innerW + 0.02, backH, backThk]}
          radius={0.05}
          smoothness={2}
          castShadow
          position={[0, backH / 2, -backThk / 2 + 0.02]}
          material={mat}
        />
        {/* Padded headrest at the top of the back */}
        <RoundedBox
          args={[innerW - 0.04, 0.16, backThk + 0.03]}
          radius={0.05}
          smoothness={3}
          castShadow
          position={[0, backH - 0.02, 0.02]}
          material={mat}
        />
      </group>

      {/* Chromed hinge rod at the seat front — the footrest pivot (both modes) */}
      <mesh
        castShadow
        position={[0, hingeY, hingeZ]}
        rotation={[0, 0, Math.PI / 2]}
        material={steel}
      >
        <cylinderGeometry args={[0.018, 0.018, innerW + 0.06, 12]} />
      </mesh>

      {/* Footrest + visible steel linkage, positioned per mode */}
      {reclined ? (
        <>
          {/* Two steel scissor-linkage bars bridging the seat front to the
              deployed footrest underside (visible mechanism). */}
          {[-1, 1].map((s) => (
            <mesh
              key={`lnk${s}`}
              castShadow
              position={[s * (innerW / 2 - 0.06), baseTop - 0.06, seatFrontZ + 0.16]}
              rotation={[-0.5, 0, 0]}
              material={steel}
            >
              <boxGeometry args={[0.03, 0.34, 0.03]} />
            </mesh>
          ))}
          {/* Deployed footrest — a padded leg ramp extending forward, its back
              edge overlapping the hinge rod at the seat front. */}
          <RoundedBox
            args={[innerW + 0.02, 0.11, 0.5]}
            radius={0.04}
            smoothness={2}
            castShadow
            receiveShadow
            position={[0, baseTop + 0.02, seatFrontZ + 0.26]}
            rotation={[-0.12, 0, 0]}
            material={mat}
          />
        </>
      ) : (
        <>
          {/* Folded footrest — a padded flap hanging down against the seat
              front, its top overlapping the hinge rod. */}
          <RoundedBox
            args={[innerW + 0.02, 0.4, 0.09]}
            radius={0.03}
            smoothness={2}
            castShadow
            position={[0, baseTop - 0.18, seatFrontZ + 0.06]}
            material={mat}
          />
          {/* Short linkage stubs flanking the flap top (the stowed mechanism) */}
          {[-1, 1].map((s) => (
            <mesh
              key={`lnk${s}`}
              castShadow
              position={[s * (innerW / 2 - 0.05), baseTop - 0.06, seatFrontZ + 0.02]}
              material={steel}
            >
              <boxGeometry args={[0.03, 0.16, 0.03]} />
            </mesh>
          ))}
        </>
      )}

      {/* Short tapered feet under the seat base */}
      {[-1, 1].map((sx) =>
        [seatBackZ + 0.1, seatFrontZ - 0.1].map((z, zi) => (
          <mesh
            key={`ft${sx}.${zi}`}
            castShadow
            position={[sx * (width / 2 - 0.1), footH / 2, z]}
            material={steel}
          >
            <cylinderGeometry args={[0.028, 0.022, footH, 10]} />
          </mesh>
        )),
      )}
    </group>
  )
}
