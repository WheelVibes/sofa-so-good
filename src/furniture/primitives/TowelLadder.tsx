import {
  getFabricMaterial,
  getSurfaceMaterial,
  type MetalFinish,
} from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Freestanding heated towel ladder — two vertical side posts on small feet,
 * joined by a stack of horizontal rungs, with optional towels draped over
 * upper rungs. A blanket-ladder style stand (distinct from the wall-mounted
 * {@link TowelRail}). `finish` is a metal tone (chrome / black / brass) or
 * wood. Floor-anchored, centred on its footprint, faces +Z.
 */
export function TowelLadder({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.5)
  const height = readNum(props, 'height', 1.5)
  const finish = readStr(props, 'finish', 'chrome')
  const bars = Math.max(3, Math.min(8, Math.round(readNum(props, 'bars', 5))))
  const towel = readStr(props, 'towel', 'yes') === 'yes'
  const towelColor = readStr(props, 'towelColor', '#e8e3d8')

  // Metal frame tones route through the shared brushed-metal material: chrome →
  // bright stainless, black → matte black-steel, brass → warm satin brushing.
  // A non-metal `finish` (wood) falls back to the wood surface material.
  const FRAME: Record<string, { color: string; metal: MetalFinish }> = {
    chrome: { color: '#cfd3d6', metal: 'stainless' },
    black: { color: '#2b2d30', metal: 'black-steel' },
    brass: { color: '#b8923f', metal: 'satin' },
  }
  const frame = FRAME[finish]
  const mat = frame
    ? metalLeg(frame.color, frame.metal)
    : getSurfaceMaterial('wood', readStr(props, 'color', '#6f553f'), 0.6, 0.2)

  const postR = 0.016
  const rungR = 0.012
  const halfW = width / 2
  const footD = 0.26 // foot depth (along Z) so the ladder stands
  const towelMat = getFabricMaterial(towelColor)

  const bottomY = 0.1
  const topY = height - 0.06
  const rungYs = Array.from({ length: bars }, (_, i) =>
    bars === 1 ? (bottomY + topY) / 2 : bottomY + ((topY - bottomY) * i) / (bars - 1),
  )
  // Drape towels over the top two rungs.
  const drapeRungs = new Set([rungYs.length - 1, rungYs.length - 2])

  return (
    <group>
      {/* Side posts */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * halfW, height / 2, 0]} material={mat}>
          <cylinderGeometry args={[postR, postR, height, 12]} />
        </mesh>
      ))}
      {/* Feet — a perpendicular bar under each post */}
      {[-1, 1].map((s) => (
        <mesh
          key={`f${s}`}
          castShadow
          position={[s * halfW, 0.018, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mat}
        >
          <cylinderGeometry args={[postR, postR, footD, 10]} />
        </mesh>
      ))}
      {/* Rungs */}
      {rungYs.map((y, i) => (
        <mesh key={i} castShadow position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} material={mat}>
          <cylinderGeometry args={[rungR, rungR, width - postR * 2, 10]} />
        </mesh>
      ))}
      {/* Draped towels — front + back panels hanging over the top rungs */}
      {towel &&
        rungYs.flatMap((y, i) =>
          drapeRungs.has(i)
            ? [1, -1].map((s) => (
                <mesh
                  key={`t${i}.${s}`}
                  castShadow
                  receiveShadow
                  position={[0, y - 0.2, s * 0.024]}
                  material={towelMat}
                >
                  <boxGeometry args={[width * 0.74, 0.4, 0.006]} />
                </mesh>
              ))
            : [],
        )}
    </group>
  )
}
