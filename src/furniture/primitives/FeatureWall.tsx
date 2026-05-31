import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Fluted / slatted feature wall panel — a floor-to-ceiling backdrop (the
 * popular modern HDB "fluted wood TV wall"). A thin backing board carries N
 * vertical battens: rounded half-dowels for 'fluted', square battens with
 * shadow gaps for 'slat'. Mounted flush against the wall behind it; faces +Z.
 */
export function FeatureWall({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.8)
  const height = readNum(props, 'height', 2.5)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'fluted')

  const mat = getSurfaceMaterial(finish, color, 2, sheen)
  const backT = 0.02
  // Batten pitch ~6 cm; at least 6 across the panel.
  const pitch = style === 'slat' ? 0.09 : 0.06
  const n = Math.max(6, Math.round(width / pitch))
  const step = width / n
  const battenR = style === 'slat' ? step * 0.34 : step * 0.42

  return (
    <group>
      {/* Backing board flush to the wall */}
      <mesh castShadow receiveShadow position={[0, height / 2, backT / 2]} material={mat}>
        <boxGeometry args={[width, height, backT]} />
      </mesh>
      {/* Vertical battens */}
      {Array.from({ length: n }, (_, i) => {
        const x = -width / 2 + step / 2 + i * step
        if (style === 'slat') {
          return (
            <mesh key={i} castShadow position={[x, height / 2, backT + battenR]} material={mat}>
              <boxGeometry args={[battenR * 2, height - 0.04, battenR * 1.6]} />
            </mesh>
          )
        }
        // Fluted: a half-round dowel (cylinder along Y) proud of the board.
        return (
          <mesh key={i} castShadow position={[x, height / 2, backT + battenR * 0.5]} material={mat}>
            <cylinderGeometry args={[battenR, battenR, height - 0.02, 12]} />
          </mesh>
        )
      })}
    </group>
  )
}
