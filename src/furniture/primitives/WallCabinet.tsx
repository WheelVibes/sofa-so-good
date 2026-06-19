import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/** Run of kitchen upper/wall cabinets: a long body split into N doors with
 *  handles. Mounted high on the wall (group offset up in Y). Faces +Z. */
export function WallCabinet({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 2.4)
  const mountH = readNum(props, 'mountHeight', 1.45) // underside height
  const color = readStr(props, 'color', '#e3dfd6')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const frontStyle = readStr(props, 'frontStyle', 'slab')

  const h = 0.7
  const d = 0.35
  const doors = Math.max(1, Math.round(length / 0.6))
  const gap = 0.012
  const doorW = (length - gap * (doors + 1)) / doors
  const doorH = h - 0.04
  const cy = mountH + h / 2
  const cabMat = getSurfaceMaterial(finish, color, 1, sheen)
  const handleMat = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const

  return (
    <group>
      {/* Carcass */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, cy, 0]}
        material={cabMat}
        args={[length, h, d]}
      />
      {/* Doors + handles (slab or shaker, matching the base counter) */}
      {Array.from({ length: doors }, (_, i) => {
        const x = -length / 2 + gap + doorW / 2 + i * (doorW + gap)
        const handleSide = i % 2 === 0 ? 1 : -1
        return (
          <group key={i}>
            <BeveledBox
              castShadow
              position={[x, cy, d / 2 - 0.005]}
              material={cabMat}
              args={[doorW, doorH, 0.016]}
            />
            {frontStyle === 'shaker' &&
              [
                [0, doorH / 2 - 0.05, doorW - 0.08, 0.05],
                [0, -doorH / 2 + 0.05, doorW - 0.08, 0.05],
                [-doorW / 2 + 0.04, 0, 0.05, doorH - 0.16],
                [doorW / 2 - 0.04, 0, 0.05, doorH - 0.16],
              ].map(([dx, dy, bw, bh], k) => (
                <mesh key={k} position={[x + dx, cy + dy, d / 2 + 0.004]} material={cabMat}>
                  <boxGeometry args={[bw, bh, 0.01]} />
                </mesh>
              ))}
            <mesh
              castShadow
              position={[x + handleSide * (doorW / 2 - 0.04), cy - h / 2 + 0.08, d / 2 + 0.01]}
            >
              <boxGeometry args={[0.018, 0.1, 0.018]} />
              <meshStandardMaterial {...handleMat} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
