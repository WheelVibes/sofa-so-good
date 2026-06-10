import { getFabricMaterial, getRattanMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Wall tapestry — a woven / macramé hanging on a wooden dowel. `style` picks a
 * soft woven panel or a macramé panel with a knotted fringe along the bottom.
 * Mounted on a wall (group offset to the dowel height); faces +Z so it sits
 * flat against the wall behind it. Built at real-world metres.
 */
export function WallTapestry({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const drop = readNum(props, 'drop', 0.95)
  const topY = readNum(props, 'mountHeight', 1.7)
  const color = readStr(props, 'color', '#d9cdb6')
  const rodColor = readStr(props, 'rodColor', '#b08a5a')
  const style = readStr(props, 'style', 'macrame')

  const panelMat = style === 'woven' ? getRattanMaterial(color, 4) : getFabricMaterial(color, 0.96)
  const fringe = style === 'macrame'
  // Panel hangs below the dowel; the dowel overhangs the panel a touch.
  const panelTopY = topY - 0.03
  const panelH = fringe ? drop * 0.8 : drop
  const panelCY = panelTopY - panelH / 2

  const tassels = Math.max(5, Math.round(width / 0.06))

  return (
    <group position={[0, 0, 0]}>
      {/* Dowel rod */}
      <mesh castShadow position={[0, topY, 0.012]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, width + 0.12, 12]} />
        <meshStandardMaterial color={rodColor} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Hanging panel */}
      <mesh castShadow receiveShadow position={[0, panelCY, 0.004]} material={panelMat}>
        <boxGeometry args={[width, panelH, 0.012]} />
      </mesh>
      {/* Macramé knotted fringe along the bottom */}
      {fringe &&
        Array.from({ length: tassels }, (_, i) => {
          const x = -width / 2 + (i + 0.5) * (width / tassels)
          const len = drop * 0.2 * (0.7 + ((i * 7) % 5) * 0.08)
          return (
            <mesh
              key={i}
              castShadow
              position={[x, panelTopY - panelH - len / 2 + 0.01, 0.004]}
              material={panelMat}
            >
              <cylinderGeometry args={[0.008, 0.005, len, 5]} />
            </mesh>
          )
        })}
    </group>
  )
}
