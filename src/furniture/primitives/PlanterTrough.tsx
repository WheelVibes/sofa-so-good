import { hexToRgb } from '../../materials/procedural/noise'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

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
  const sphereSeg = seg(16, detail)

  const [lr, lg, lb] = hexToRgb(leafColor)
  const tint = (f: number) =>
    `rgb(${Math.round(Math.min(255, lr * f))},${Math.round(Math.min(255, lg * f))},${Math.round(Math.min(255, lb * f))})`

  // Foliage clusters spaced along the length (≈ every 0.26 m).
  const n = Math.max(2, Math.round(length / 0.26))
  const clusters = Array.from({ length: n }, (_, i) => {
    const x = -length / 2 + (length * (i + 0.5)) / n
    return x
  })

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
      {/* Greenery: a couple of overlapping blobs per cluster + a taller sprig */}
      {clusters.map((x, i) => (
        <group key={i} position={[x, boxH, (i % 2 ? 1 : -1) * 0.02]}>
          <mesh castShadow position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.15, sphereSeg, sphereSeg]} />
            <meshStandardMaterial color={tint(1)} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0.09, 0.07, 0.05]}>
            <sphereGeometry args={[0.11, sphereSeg, sphereSeg]} />
            <meshStandardMaterial color={tint(0.85)} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[-0.08, 0.08, -0.04]}>
            <sphereGeometry args={[0.1, sphereSeg, sphereSeg]} />
            <meshStandardMaterial color={tint(0.92)} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0, 0.26, 0]}>
            <sphereGeometry args={[0.08, sphereSeg, sphereSeg]} />
            <meshStandardMaterial color={tint(1.12)} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
