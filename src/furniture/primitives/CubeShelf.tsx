import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes } from './InstancedBoxes'
import { readNum, readStr } from './shared'

/**
 * Open cube-shelf room divider (KALLAX-style) — a freestanding grid of
 * open cubbies with no back panel, so it reads through both sides. Common
 * in open-concept HDB flats to zone living from dining. A few cubbies carry
 * decorative books/boxes. Faces +Z.
 */
export function CubeShelf({ props }: { props: ParamProps }) {
  const cols = Math.max(1, Math.min(5, Math.round(readNum(props, 'cols', 3))))
  const rows = Math.max(1, Math.min(4, Math.round(readNum(props, 'rows', 2))))
  const color = readStr(props, 'color', '#caa478')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)

  const cube = 0.38 // interior cube size
  const t = 0.03 // panel thickness
  const depth = 0.34
  const width = cols * cube + (cols + 1) * t
  const height = rows * cube + (rows + 1) * t
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const BOX_COLORS = ['#7d3b3b', '#3b5a7d', '#5a7d3b', '#b08a3e', '#6b4a7d']

  // Carcass + wood storage boxes are all axis-aligned boxes sharing `wood`, so
  // they collapse into one InstancedMesh (one draw call) instead of ~5–9 panels
  // plus a box per filled cubby. Decorative books vary in colour, so they ride a
  // second instanced set with per-instance `instanceColor`.
  const woodBoxes: BoxInstance[] = []
  for (let i = 0; i < cols + 1; i++) {
    const x = -width / 2 + t / 2 + i * (cube + t)
    woodBoxes.push({ position: [x, height / 2, 0], size: [t, height, depth] })
  }
  for (let i = 0; i < rows + 1; i++) {
    const y = t / 2 + i * (cube + t)
    woodBoxes.push({ position: [0, y, 0], size: [width, t, depth] })
  }

  // Sparse decorative fills (deterministic — preserve the exact rnd() call order
  // so the layout is byte-identical to the per-mesh version).
  const books: BoxInstance[] = []
  let seed = cols * 131 + rows * 17
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() > 0.5) continue
      const cx = -width / 2 + t + cube / 2 + c * (cube + t)
      if (rnd() > 0.5) {
        // a small stack of books leaning
        books.push({
          position: [cx, t + r * (cube + t) + 0.11, 0.02],
          size: [cube * 0.6, 0.22, depth * 0.6],
          color: BOX_COLORS[Math.floor(rnd() * BOX_COLORS.length)],
        })
      } else {
        // a storage box — rested on the shelf floor of its cubby (its base
        // sits on the shelf top) so it reads as sitting in the cube rather than
        // floating centred in the opening.
        const boxH = cube * 0.88
        const restY = t + r * (cube + t) + boxH / 2
        woodBoxes.push({ position: [cx, restY, 0], size: [cube * 0.9, boxH, depth * 0.86] })
      }
    }
  }

  return (
    <group>
      <InstancedBoxes instances={woodBoxes} castShadow receiveShadow>
        <primitive object={wood} attach="material" />
      </InstancedBoxes>
      <InstancedBoxes instances={books} castShadow>
        <meshStandardMaterial roughness={0.8} metalness={0} />
      </InstancedBoxes>
    </group>
  )
}
