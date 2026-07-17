import { RoundedBox } from '@react-three/drei'
import {
  getSurfaceMaterial,
  getUpholsteryMaterial,
  getWoodMaterial,
} from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Bench — a backless seat for the foot of a bed or an entryway. Styles:
 * 'upholstered' (padded cushion top on wood legs), 'storage' (a closed box
 * with a lid + plinth) and 'slat' (a wood-slat top on legs). Faces +Z.
 */
export function Bench({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2)
  const depth = readNum(props, 'depth', 0.4)
  const height = readNum(props, 'height', 0.45)
  const color = readStr(props, 'color', '#b08968')
  const legColor = readStr(props, 'legColor', '#3a2c1d')
  const material = readStr(props, 'material', 'fabric')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'upholstered')

  const legMat = getWoodMaterial(legColor, 0.4)

  if (style === 'storage') {
    // Closed ottoman box with a slightly proud lid on a recessed plinth.
    const plinthH = 0.05
    const boxH = height - plinthH - 0.04
    const box = getSurfaceMaterial('wood', color, 1.4, sheen)
    const lid = getUpholsteryMaterial(material, color, sheen)
    return (
      <group>
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, plinthH / 2, 0.01]}
          material={box}
          args={[width - 0.06, plinthH, depth - 0.06]}
        />
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, plinthH + boxH / 2, 0]}
          material={box}
          args={[width, boxH, depth]}
        />
        <RoundedBox
          args={[width + 0.02, 0.06, depth + 0.02]}
          radius={0.02}
          smoothness={2}
          castShadow
          position={[0, plinthH + boxH + 0.03, 0]}
          material={lid}
        />
      </group>
    )
  }

  // Top on four splayed-ish legs (upholstered cushion or wood slats).
  const legH = height - 0.1
  const legT = 0.05
  const inset = legT / 2 + 0.04
  const xs = [-width / 2 + inset, width / 2 - inset]
  const zs = [-depth / 2 + inset, depth / 2 - inset]
  const topY = legH + 0.05

  return (
    <group>
      {style === 'slat' ? (
        (() => {
          const n = Math.max(3, Math.round(depth / 0.09))
          const sd = (depth - 0.04) / n
          const slatMat = getSurfaceMaterial('wood', color, 1.2, sheen)
          return (
            <>
              {/* Two side rails on the leg tops that the slats rest across —
                  they tie the front/back legs together AND carry the slats
                  (which otherwise floated ~3 cm above the legs). */}
              {xs.map((x) => (
                <BeveledBox
                  key={`rail${x}`}
                  castShadow
                  position={[x, legH + 0.01, 0]}
                  material={slatMat}
                  // Slightly NARROWER than the leg (legT) so the rail's side faces
                  // tuck inside the leg's rather than sitting coplanar with them
                  // (different woods → z-fight where rail meets the leg top).
                  args={[legT - 0.008, 0.04, depth - 0.02]}
                />
              ))}
              {Array.from({ length: n }, (_, i) => (
                <mesh
                  key={i}
                  castShadow
                  receiveShadow
                  position={[0, topY, -depth / 2 + 0.02 + sd * (i + 0.5)]}
                  material={slatMat}
                >
                  <boxGeometry args={[width, 0.04, sd * 0.7]} />
                </mesh>
              ))}
            </>
          )
        })()
      ) : (
        <RoundedBox
          args={[width, 0.12, depth]}
          radius={0.04}
          smoothness={3}
          castShadow
          receiveShadow
          position={[0, topY, 0]}
          material={getUpholsteryMaterial(material, color, sheen)}
        />
      )}
      {xs.map((x) =>
        zs.map((z) => (
          <BeveledBox
            key={`${x}.${z}`}
            castShadow
            position={[x, legH / 2, z]}
            material={legMat}
            args={[legT, legH, legT]}
          />
        )),
      )}
    </group>
  )
}
