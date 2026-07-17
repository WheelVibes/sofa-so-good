import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafJitter, leafTintHex } from './leafFoliage'
import { readNum, readStr } from './shared'
import { useDetail } from './useDetail'

/**
 * Outdoor / balcony planter trough: a long rectangular planter box (terracotta /
 * concrete / wood) topped with soil and a run of low bushy greenery — a balcony
 * staple. `length` sizes the box; foliage clusters tile along it. Floor-anchored,
 * facing +Z.
 */
export function PlanterTrough({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 0.9)
  const potColor = readStr(props, 'potColor', '#a6a29a')
  const leafColor = readStr(props, 'leafColor', '#4a7a44')
  const d = 0.28
  const boxH = 0.34
  const detail = useDetail()

  // Foliage clusters spaced along the length (≈ every 0.26 m). Each cluster is a
  // low bushy shrub of reading leaves radiating from the soil (base at the soil
  // top → connected to the box), with a couple of taller sprigs.
  const n = Math.max(2, Math.round(length / 0.26))
  const GOLD = 2.399963
  const perCluster = Math.max(5, Math.round(8 * detail))
  const leaves: BoxInstance[] = []
  let li = 0
  for (let i = 0; i < n; i++) {
    const cx = -length / 2 + (length * (i + 0.5)) / n
    const cz = (i % 2 ? 1 : -1) * 0.02
    for (let k = 0; k < perCluster; k++) {
      const a = k * GOLD + i
      const tilt = 0.3 + ((k % 5) / 5) * 1.0 + leafJitter(li) * 0.12
      const len = 0.15 + (k % 3) * 0.04
      leaves.push({
        position: [cx + Math.sin(a) * 0.03, boxH - 0.005, cz + Math.cos(a) * 0.03],
        size: [0.09, len, 0.09],
        rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
        color: leafTintHex(li++, i),
      })
    }
    // A taller central sprig.
    leaves.push({
      position: [cx, boxH - 0.005, cz],
      size: [0.08, 0.26, 0.08],
      rotation: [0.1, i, 0.05],
      color: leafTintHex(li++, i + 9),
    })
  }

  return (
    <group>
      {/* Planter box (slightly tapered) */}
      <mesh castShadow receiveShadow position={[0, boxH / 2, 0]}>
        <boxGeometry args={[length, boxH, d]} />
        <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
      </mesh>
      {/* Soil */}
      <mesh receiveShadow position={[0, boxH - 0.02, 0]}>
        <boxGeometry args={[length - 0.06, 0.04, d - 0.06]} />
        <meshStandardMaterial color="#3a2c1e" roughness={1} />
      </mesh>
      {/* Bushy shrub greenery */}
      <InstancedLeaves species="oval" color={leafColor} instances={leaves} />
    </group>
  )
}
