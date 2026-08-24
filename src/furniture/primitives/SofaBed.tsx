import { RoundedBox } from '@react-three/drei'
import { getFabricMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

interface SofaBedProps {
  props: ParamProps
}

/** Depth of the piece by mode (metres). Sofa is a normal 3-seat depth; the
 *  fold-out bed extends forward to a real single-mattress sleeping surface.
 *  The `bed` depth is also the def's `defaultFootprint.d` (the enclosing bbox);
 *  `footprintParts` in defs/seating.ts serves the shallower sofa box per mode. */
export const SOFA_BED_DEPTH: Record<string, number> = { sofa: 0.95, bed: 1.2 }

/**
 * Sofa-bed / click-clack sleeper. A 3-seat sofa whose backrest folds flat to
 * become a ~1.9 × 1.1 m sleeping surface. Faces +Z (a seated person looks +Z);
 * the back edge (wall side) is pinned at −bboxDepth/2 for BOTH modes so the
 * piece only grows forward into the room when unfolded to `bed`. Optional
 * storage drawer under the seat. Real metres, footprint-centred, floor-anchored.
 *
 * `mode`: 'sofa' (seat cushions + a visible fold-line seam in the backrest,
 * sturdy frame on short legs) | 'bed' (flat mattress at ~0.45 m with a visible
 * mid fold seam + retained side arms).
 */
export function SofaBed({ props }: SofaBedProps) {
  const width = readNum(props, 'width', 1.9)
  const mode = readStr(props, 'mode', 'sofa')
  const hasStorage = readStr(props, 'storage', 'yes') !== 'no'
  const color = readStr(props, 'color', '#6f7a82')
  const pillowColor = readStr(props, 'pillowColor', '#b8836a')
  const material = readStr(props, 'material', 'fabric')
  const pattern = readStr(props, 'pattern', 'plain')
  const sheen = readNum(props, 'sheen', 0)
  const legColor = readStr(props, 'legColor', '#2c2620')

  const isBed = mode === 'bed'
  const pieceDepth = SOFA_BED_DEPTH[mode] ?? 0.95
  const bboxDepth = SOFA_BED_DEPTH.bed // enclosing bbox depth
  // Back (wall) edge pinned; piece grows forward as it unfolds.
  const backZ = -bboxDepth / 2
  const frontZ = backZ + pieceDepth
  const centerZ = (backZ + frontZ) / 2

  const footH = 0.08
  const baseH = 0.3 // upholstered frame block (deep enough to host a drawer)
  const baseTop = footH + baseH // 0.38
  const armW = 0.14
  const innerW = width - armW * 2
  const mat = getUpholsteryMaterial(material, color, sheen, pattern)

  // Sofa-mode seat + back
  const cushionCount = 3
  const cushionGap = 0.03
  const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount
  const cushionH = 0.12
  const seatTop = baseTop + cushionH // ~0.5
  const backH = 0.4
  const recline = 0.09

  // Arms: full profile in sofa mode, lower in bed mode (just above the mattress)
  const armTop = isBed ? 0.42 : 0.62
  const armH = armTop - footH

  // Bed-mode mattress
  const mattH = 0.12
  const mattD = pieceDepth - 0.06
  const mattTop = baseTop + mattH

  return (
    <group>
      {/* Upholstered frame block, raised on the feet */}
      <RoundedBox
        args={[width, baseH, pieceDepth]}
        radius={0.04}
        smoothness={2}
        castShadow
        receiveShadow
        position={[0, footH + baseH / 2, centerZ]}
        material={mat}
      />

      {/* Arms (retained in both modes) */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={`arm${s}`}
          args={[armW, armH, pieceDepth]}
          radius={0.05}
          smoothness={2}
          castShadow
          position={[(s * (width - armW)) / 2, footH + armH / 2, centerZ]}
          material={mat}
        />
      ))}

      {/* ── Sofa mode ─────────────────────────────────────────── */}
      {!isBed && (
        <>
          {/* Reclined backrest with a visible horizontal fold-line seam */}
          <group position={[0, baseTop, backZ + 0.09]} rotation={[recline, 0, 0]}>
            <RoundedBox
              args={[innerW, backH, 0.16]}
              radius={0.05}
              smoothness={2}
              castShadow
              position={[0, backH / 2, 0]}
              material={mat}
            />
            {/* Fold-line groove across the back face (where it hinges flat) */}
            <mesh position={[0, backH * 0.5, 0.085]}>
              <boxGeometry args={[innerW - 0.04, 0.02, 0.02]} />
              <meshStandardMaterial color="#1f242a" roughness={0.8} />
            </mesh>
          </group>
          {/* Seat cushions, pulled slightly forward off the back */}
          {Array.from({ length: cushionCount }, (_, i) => {
            const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap)
            return (
              <RoundedBox
                key={`sc${i}`}
                args={[cushionW, cushionH, pieceDepth - 0.24]}
                radius={0.05}
                smoothness={3}
                castShadow
                position={[x, baseTop + cushionH / 2, centerZ + 0.04]}
                material={mat}
              />
            )
          })}
          {/* Back cushions resting on the seat against the back */}
          {Array.from({ length: cushionCount }, (_, i) => {
            const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap)
            return (
              <RoundedBox
                key={`bc${i}`}
                args={[cushionW - 0.02, 0.3, 0.13]}
                radius={0.05}
                smoothness={3}
                castShadow
                position={[x, seatTop + 0.13, backZ + 0.19]}
                rotation={[recline, 0, 0]}
                material={mat}
              />
            )
          })}
          {/* Throw pillows near each arm */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={`p${s}`}
              args={[0.32, 0.32, 0.12]}
              radius={0.05}
              smoothness={2}
              castShadow
              position={[s * (innerW / 2 - 0.2), seatTop + 0.15, backZ + 0.3]}
              rotation={[0.3, s * 0.18, s * 0.12]}
              material={getFabricMaterial(pillowColor, 0.95, pattern)}
            />
          ))}
        </>
      )}

      {/* ── Bed mode ──────────────────────────────────────────── */}
      {isBed && (
        <>
          {/* Flat sleeping mattress on the extended base */}
          <RoundedBox
            args={[innerW, mattH, mattD]}
            radius={0.04}
            smoothness={2}
            castShadow
            receiveShadow
            position={[0, baseTop + mattH / 2, centerZ]}
            material={mat}
          />
          {/* Fold seam across the middle of the mattress (the click-clack hinge) */}
          <mesh position={[0, mattTop - 0.005, centerZ]}>
            <boxGeometry args={[innerW - 0.04, 0.014, 0.02]} />
            <meshStandardMaterial color="#1f242a" roughness={0.8} />
          </mesh>
          {/* Two pillows at the head (wall) end */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={`bp${s}`}
              args={[innerW / 2 - 0.06, 0.1, 0.3]}
              radius={0.05}
              smoothness={3}
              castShadow
              position={[s * (innerW / 4), mattTop + 0.05, backZ + 0.22]}
              material={getFabricMaterial(pillowColor, 0.95, pattern)}
            />
          ))}
        </>
      )}

      {/* Storage drawer under the seat — proud front face + bar handle */}
      {hasStorage && (
        <group>
          <RoundedBox
            args={[width - 0.1, baseH - 0.08, 0.02]}
            radius={0.01}
            smoothness={2}
            castShadow
            position={[0, footH + baseH / 2, frontZ + 0.006]}
            material={mat}
          />
          <mesh castShadow position={[0, footH + baseH / 2, frontZ + 0.03]}>
            <boxGeometry args={[width * 0.28, 0.024, 0.024]} />
            <MetalMaterial color="#8a8d92" roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      )}

      {/* Tapered feet, placed under the actual piece extent for this mode */}
      {[-1, 1].map((sx) =>
        [backZ + 0.12, frontZ - 0.12].map((z, zi) => (
          <mesh key={`${sx}.${zi}`} position={[sx * (width / 2 - 0.1), footH / 2, z]} castShadow>
            <cylinderGeometry args={[0.03, 0.022, footH, 12]} />
            <meshStandardMaterial color={legColor} roughness={0.4} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  )
}
