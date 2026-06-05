import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Kids' toy-storage organiser — a low, kid-height open cubby unit with a back
 * panel and bright fabric bins slotted into most cubbies (a few left open).
 * Lower and more colourful than the KALLAX-style {@link CubeShelf} divider.
 * Floor-anchored, centred on its footprint, faces +Z.
 */
export function ToyStorage({ props }: { props: ParamProps }) {
  const cols = Math.max(2, Math.min(4, Math.round(readNum(props, 'cols', 3))))
  const rows = Math.max(1, Math.min(3, Math.round(readNum(props, 'rows', 2))))
  const color = readStr(props, 'color', '#d8c6a8')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)

  const cube = 0.28 // interior cubby size (kid-reachable)
  const t = 0.025 // panel thickness
  const depth = 0.3
  const width = cols * cube + (cols + 1) * t
  const height = rows * cube + (rows + 1) * t
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  // Cheerful primary-ish bin palette.
  const BIN_COLORS = ['#d98a3b', '#3b78d9', '#4caf6a', '#e0b93e', '#c14d7d', '#5ac2c2']

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

  // Back panel so toys don't fall through (distinguishes it from the divider).
  const back = (
    <mesh receiveShadow position={[0, height / 2, -depth / 2 + t / 2]} material={wood}>
      <boxGeometry args={[width, height, t]} />
    </mesh>
  )

  // Bright fabric bins in most cubbies (deterministic; a few left open).
  const bins = []
  let seed = cols * 71 + rows * 29
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const open = rnd() > 0.7 // ~30% left open
      if (open) continue
      const cx = -width / 2 + t + cube / 2 + c * (cube + t)
      const cy = t + cube / 2 + r * (cube + t)
      const binMat = getFabricMaterial(BIN_COLORS[Math.floor(rnd() * BIN_COLORS.length)])
      bins.push(
        <mesh key={`bin${r}-${c}`} castShadow position={[cx, cy, 0.01]} material={binMat}>
          <boxGeometry args={[cube * 0.9, cube * 0.86, depth * 0.82]} />
        </mesh>,
      )
    }
  }

  return (
    <group>
      {back}
      {verticals}
      {horizontals}
      {bins}
    </group>
  )
}
