import { getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Baby changing table — a drawer/shelf cabinet with a padded changing mat and
 * raised guard rails on top. `base` is closed drawers or open shelves. Faces
 * +Z; floor-anchored, centred. Built at real-world metres.
 */
export function ChangingTable({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.95)
  const depth = readNum(props, 'depth', 0.55)
  const color = readStr(props, 'color', '#e6ddca')
  const padColor = readStr(props, 'padColor', '#cfe0d6')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const base = readStr(props, 'base', 'drawers')

  const bodyH = 0.9
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const pad = getUpholsteryMaterial('fabric', padColor, 0)
  const railR = 0.02
  const railH = 0.12
  const metal = { color: '#9a958d', roughness: 0.5, metalness: 0.2 } as const

  return (
    <group>
      {/* Carcass */}
      <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]} material={wood}>
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>
      {base === 'drawers'
        ? [0, 1, 2].map((r) => (
            <group key={r}>
              <mesh position={[0, 0.18 + r * 0.24, depth / 2 + 0.003]} material={wood}>
                <boxGeometry args={[width - 0.06, 0.2, 0.02]} />
              </mesh>
              <mesh position={[0, 0.18 + r * 0.24, depth / 2 + 0.02]}>
                <boxGeometry args={[0.16, 0.016, 0.016]} />
                <meshStandardMaterial {...metal} />
              </mesh>
            </group>
          ))
        : [0.28, 0.62].map((y, i) => (
            <mesh key={i} castShadow position={[0, y, 0.01]} material={wood}>
              <boxGeometry args={[width - 0.08, 0.03, depth - 0.06]} />
            </mesh>
          ))}
      {/* Padded changing mat */}
      <mesh castShadow receiveShadow position={[0, bodyH + 0.04, 0]} material={pad}>
        <boxGeometry args={[width - 0.06, 0.08, depth - 0.06]} />
      </mesh>
      {/* Guard rails (back + two ends) */}
      {[
        {
          pos: [0, bodyH + 0.08 + railH / 2, -depth / 2 + 0.05] as [number, number, number],
          len: width - 0.06,
          axis: 'x' as const,
        },
        {
          pos: [-width / 2 + 0.05, bodyH + 0.08 + railH / 2, 0] as [number, number, number],
          len: depth - 0.06,
          axis: 'z' as const,
        },
        {
          pos: [width / 2 - 0.05, bodyH + 0.08 + railH / 2, 0] as [number, number, number],
          len: depth - 0.06,
          axis: 'z' as const,
        },
      ].map((r, i) => (
        <mesh
          key={i}
          position={r.pos}
          rotation={[r.axis === 'z' ? Math.PI / 2 : 0, 0, r.axis === 'x' ? Math.PI / 2 : 0]}
          material={wood}
        >
          <cylinderGeometry args={[railR, railR, r.len, 8]} />
        </mesh>
      ))}
    </group>
  )
}
