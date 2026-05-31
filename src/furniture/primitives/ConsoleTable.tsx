import { getSurfaceMaterial, getWoodMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Console table — a narrow, waist-height table for an entryway or behind a
 * sofa. `style` is 'shelf' (a lower display shelf) or 'drawers' (two drawer
 * fronts under the top). Slim depth; four square legs. Faces +Z.
 */
export function ConsoleTable({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2)
  const depth = readNum(props, 'depth', 0.35)
  const color = readStr(props, 'color', '#6f553f')
  const legColor = readStr(props, 'legColor', '#4a3722')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'shelf')

  const h = 0.8
  const topT = 0.04
  const legT = 0.05
  const inset = legT / 2 + 0.02
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const legMat = getWoodMaterial(legColor, 0.45)
  const metal = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const

  const xs = [-width / 2 + inset, width / 2 - inset]
  const zs = [-depth / 2 + inset, depth / 2 - inset]

  return (
    <group>
      {/* Top */}
      <mesh castShadow receiveShadow position={[0, h - topT / 2, 0]} material={wood}>
        <boxGeometry args={[width, topT, depth]} />
      </mesh>
      {/* Legs */}
      {xs.map((x) =>
        zs.map((z) => (
          <mesh key={`${x}.${z}`} castShadow position={[x, (h - topT) / 2, z]} material={legMat}>
            <boxGeometry args={[legT, h - topT, legT]} />
          </mesh>
        )),
      )}
      {style === 'drawers' ? (
        <>
          {/* Drawer band just under the top, with two fronts + bar pulls */}
          <mesh castShadow position={[0, h - topT - 0.09, 0]} material={wood}>
            <boxGeometry args={[width - inset * 2, 0.16, depth - inset * 2]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * width * 0.22, h - topT - 0.09, depth / 2 + 0.012]}>
              <boxGeometry args={[width * 0.2, 0.018, 0.02]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          ))}
        </>
      ) : (
        /* Lower display shelf */
        <mesh castShadow receiveShadow position={[0, 0.18, 0]} material={wood}>
          <boxGeometry args={[width - inset * 2, 0.03, depth - inset * 2]} />
        </mesh>
      )}
    </group>
  )
}
