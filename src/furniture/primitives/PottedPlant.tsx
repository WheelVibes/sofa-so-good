import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafJitter, leafTintHex } from './leafFoliage'
import type { LeafSpecies } from './leafTexture'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Potted foliage plant: pot + soil + foliage. The `type` enum picks the
 *  silhouette — a clustered bush, upright snake plant, arching palm, or a
 *  tall fiddle-leaf fig — `potShape` picks the planter (tapered / cylinder /
 *  square box), and `size` scales the whole plant. */
export function PottedPlant({ props }: { props: ParamProps }) {
  const sizeKey = readStr(props, 'size', 'medium')
  const type = readStr(props, 'type', 'bush')
  const potShape = readStr(props, 'potShape', 'tapered')
  const potColor = readStr(props, 'potColor', '#b9743f')
  const leafColor = readStr(props, 'leafColor', '#3f6b3a')
  const stand = readStr(props, 'stand', 'none')
  const standColor = readStr(props, 'standColor', '#7a5230')

  const scale = sizeKey === 'small' ? 0.7 : sizeKey === 'large' ? 1.35 : 1

  const detail = useDetail()
  const potH = 0.32
  const potRTop = 0.2
  const potRBot = potShape === 'tapered' ? 0.14 : 0.2
  const potSeg = seg(24, detail)

  // Raised mid-century plant stand: 3 splayed wooden legs carry a ring that
  // cradles the pot. The pot (and everything above it) is lifted so its lower
  // body seats INSIDE the ring; the legs run from the floor up to the ring, so
  // the whole piece is one grounded assembly. Sized to the (scaled) pot so a
  // larger plant gets a proportionally larger cradle.
  const raised = stand === 'raised'
  const standH = 0.5
  // Pot rests with its lower body inside the ring; ring at standH, pot lifted so
  // its base sits ~4 cm below the ring top (an overlap the ring cradles).
  const lift = raised ? standH - 0.05 : 0
  const cradleR = potRBot * scale + 0.01 // ring hugs the pot base
  const legSeg = seg(8, detail)
  const plantStand = raised ? (
    <group>
      {/* Ring that cradles the pot */}
      <mesh castShadow position={[0, standH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cradleR, 0.014, seg(10, detail), seg(24, detail)]} />
        <meshStandardMaterial color={standColor} roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Three splayed legs: floor → ring */}
      {Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6
        // Modest splay so the foot circle stays within the honest footprint
        // (even at the large size): dia ≤ ~0.56 m.
        const footR = cradleR + 0.06
        const topR = cradleR - 0.005
        // A leg leaning outward from the ring rim to a wider foot circle.
        const lean = Math.atan2(footR - topR, standH)
        const legLen = Math.hypot(standH, footR - topR)
        const mx = (Math.cos(a) * (footR + topR)) / 2
        const mz = (Math.sin(a) * (footR + topR)) / 2
        return (
          <mesh
            key={i}
            castShadow
            position={[mx, standH / 2, mz]}
            rotation={[Math.sin(a) * lean, 0, -Math.cos(a) * lean]}
          >
            <cylinderGeometry args={[0.011, 0.014, legLen, legSeg]} />
            <meshStandardMaterial color={standColor} roughness={0.6} metalness={0.15} />
          </mesh>
        )
      })}
    </group>
  ) : null

  // ---- Real reading leaves (per-species alpha silhouettes on curved planes,
  // instanced). Each leaf attaches at its base to the stem/trunk (which reaches
  // the soil) and extends to its tip, so the plant is one grounded structure.
  // Counts tier-scale via `detail` (Performance modest, High lusher).
  const nLeaves = (base: number) =>
    Math.max(6, Math.min(Math.round(base * detail), Math.round(base * 1.6)))
  const GOLD = 2.399963 // golden angle → even azimuthal spread without RNG

  let species: LeafSpecies = 'oval'
  const leaves: BoxInstance[] = []
  if (type === 'bush') {
    species = 'oval'
    const n = nLeaves(24)
    for (let i = 0; i < n; i++) {
      const a = i * GOLD
      const j = leafJitter(i)
      // Fill a rounded dome: tilt from near-upright (top) to near-horizontal.
      const tilt = 0.3 + ((i % 6) / 6) * 1.05 + j * 0.12
      const baseY = potH + 0.2 + (i % 4) * 0.028
      const len = 0.26 * (0.85 + leafJitter(i, 2) * 0.18)
      const w = 0.13 * (0.9 + leafJitter(i, 3) * 0.15)
      leaves.push({
        position: [Math.sin(a) * 0.035, baseY, Math.cos(a) * 0.035],
        size: [w, len, w],
        rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
        color: leafTintHex(i),
      })
    }
  } else if (type === 'snake') {
    species = 'blade'
    const n = nLeaves(11)
    for (let i = 0; i < n; i++) {
      const a = i * GOLD
      const ring = 0.05 + (i % 3) * 0.028
      const h = 0.7 + ((i * 37) % 5) * 0.09
      const lean = 0.1 + (i % 4) * 0.04
      leaves.push({
        position: [Math.sin(a) * ring, potH - 0.01, Math.cos(a) * ring],
        size: [0.11, h, 0.11],
        rotation: [Math.cos(a) * lean, a, -Math.sin(a) * lean],
        color: leafTintHex(i),
      })
    }
  } else if (type === 'palm') {
    species = 'frond'
    const n = nLeaves(9)
    const crownY = potH + 0.7
    for (let i = 0; i < n; i++) {
      const a = i * GOLD
      const arch = 0.86 + (i % 3) * 0.12
      const len = 0.55 + (i % 3) * 0.07
      leaves.push({
        position: [Math.sin(a) * 0.05, crownY, Math.cos(a) * 0.05],
        size: [0.34, len, 0.34],
        rotation: [Math.cos(a) * arch, a, -Math.sin(a) * arch],
        color: leafTintHex(i),
      })
    }
  } else if (type === 'fiddle') {
    species = 'fiddle'
    const n = nLeaves(9)
    for (let i = 0; i < n; i++) {
      const a = i * GOLD + (i % 2) * 0.5
      // Up the trunk but within its span so each base overlaps the trunk.
      const h = potH + 0.46 + (i / n) * 0.4
      const tilt = 0.5 + (i % 3) * 0.14
      const len = 0.32 + (i % 3) * 0.05
      leaves.push({
        position: [Math.sin(a) * 0.028, h, Math.cos(a) * 0.028],
        size: [0.27, len, 0.27],
        rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
        color: leafTintHex(i),
      })
    }
  }

  return (
    <group>
      {plantStand}
      <group position={[0, lift, 0]} scale={scale}>
        {/* Pot, rim + soil — square box planter or a round (tapered/cylinder) pot */}
        {potShape === 'square' ? (
          <>
            <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
              <boxGeometry args={[potRTop * 2, potH, potRTop * 2]} />
              <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
            </mesh>
            <mesh castShadow position={[0, potH, 0]}>
              <boxGeometry args={[potRTop * 2 + 0.02, 0.04, potRTop * 2 + 0.02]} />
              <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
            </mesh>
            <mesh position={[0, potH - 0.02, 0]}>
              <boxGeometry args={[potRTop * 2 - 0.04, 0.03, potRTop * 2 - 0.04]} />
              <meshStandardMaterial color="#3a2a1c" roughness={1} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
              <cylinderGeometry args={[potRTop, potRBot, potH, potSeg]} />
              <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
            </mesh>
            <mesh castShadow position={[0, potH, 0]}>
              <cylinderGeometry args={[potRTop + 0.012, potRTop, 0.04, potSeg]} />
              <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
            </mesh>
            <mesh position={[0, potH - 0.02, 0]}>
              <cylinderGeometry args={[potRTop - 0.02, potRTop - 0.02, 0.03, potSeg]} />
              <meshStandardMaterial color="#3a2a1c" roughness={1} />
            </mesh>
          </>
        )}
        {/* Woody structure: a stem (bush) or slim trunk (palm/fiddle) reaching
            from the soil up into the foliage — the leaves attach to it. Snake
            plant has no trunk (blades rise straight from the soil). */}
        {type === 'bush' && (
          <mesh castShadow position={[0, potH + 0.14, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.3, 8]} />
            <meshStandardMaterial color="#5a4324" roughness={0.9} />
          </mesh>
        )}
        {type === 'palm' && (
          <mesh castShadow position={[0, potH + 0.35, 0]}>
            <cylinderGeometry args={[0.022, 0.032, 0.7, seg(8, detail)]} />
            <meshStandardMaterial color="#6a5230" roughness={0.9} />
          </mesh>
        )}
        {type === 'fiddle' && (
          <mesh castShadow position={[0, potH + 0.45, 0]}>
            <cylinderGeometry args={[0.024, 0.034, 0.9, seg(8, detail)]} />
            <meshStandardMaterial color="#6a5230" roughness={0.9} />
          </mesh>
        )}
        <InstancedLeaves species={species} color={leafColor} instances={leaves} />
      </group>
    </group>
  )
}
