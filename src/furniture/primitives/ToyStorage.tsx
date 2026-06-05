import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Kids' toy-storage organiser (TROFAST-style) — a low, child-height open wood
 * frame of cubbies, each holding a bright fabric bin. Lower than a cube shelf so
 * a toddler can reach the bins. Faces +Z; floor-anchored, centred, real metres.
 */
export function ToyStorage({ props }: { props: ParamProps }) {
  const cols = Math.max(1, Math.min(4, Math.round(readNum(props, 'cols', 3))))
  const rows = Math.max(1, Math.min(3, Math.round(readNum(props, 'rows', 2))))
  const color = readStr(props, 'color', '#d7bfa0')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)

  const cube = 0.3 // interior cubby size (kid-reachable)
  const t = 0.025 // panel thickness
  const depth = 0.34
  const width = cols * cube + (cols + 1) * t
  const height = rows * cube + (rows + 1) * t
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)

  // Bright, primary-leaning bin palette cycled across the cubbies.
  const BIN_COLORS = ['#e0564f', '#f3b53f', '#3f86c4', '#5bab63', '#e58b3f', '#7d6bb0']

  const verticals = Array.from({ length: cols + 1 }, (_, i) => {
    const x = -width / 2 + t / 2 + i * (cube + t)
    return (
      <mesh key={`v${i}`} castShadow receiveShadow position={[x, height / 2, 0]} material={wood}>
        <boxGeometry args={[t, height, depth]} />
      </mesh>
    )
  })
  const horizontals = Array.from({ length: rows + 1 }, (_, i) => {
    const y = t / 2 + i * (cube + t)
    return (
      <mesh key={`h${i}`} castShadow receiveShadow position={[0, y, 0]} material={wood}>
        <boxGeometry args={[width, t, depth]} />
      </mesh>
    )
  })

  // One bright bin per cubby, slightly inset and pulled forward.
  const bins = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = -width / 2 + t + cube / 2 + c * (cube + t)
      const cy = t + cube / 2 + r * (cube + t)
      const binColor = BIN_COLORS[(r * cols + c) % BIN_COLORS.length]
      bins.push(
        <mesh key={`bin${r}-${c}`} castShadow position={[cx, cy, 0.015]}>
          <boxGeometry args={[cube * 0.9, cube * 0.82, depth * 0.86]} />
          <meshStandardMaterial color={binColor} roughness={0.85} />
        </mesh>,
      )
    }
  }

  return (
    <group>
      {verticals}
      {horizontals}
      {bins}
    </group>
  )
}
