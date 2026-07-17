import { RoundedBox } from '@react-three/drei'
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/** Ottoman storage bench / upholstered blanket box — a padded lift-lid chest at
 *  the foot of a bed or in a hallway. A fully-upholstered box body on short
 *  tapered legs (or a recessed plinth) carries a lift lid hinged along its back
 *  edge (a piano-hinge dowel bridges lid → body). Faces +Z. Real metres,
 *  footprint-centred, floor-anchored.
 *
 *  `style`: 'plain' (a piped welt seam around the lid edge) | 'tufted' (a grid
 *  of buttoned dimples pressed into the lid, the classic blanket-box look).
 *  `base`: 'legs' (short tapered feet) | 'plinth' (recessed dark toe-kick). */
export function StorageBench({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const depth = readNum(props, 'depth', 0.45)
  const color = readStr(props, 'color', '#5b6670')
  const material = readStr(props, 'material', 'fabric')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'plain')
  const base = readStr(props, 'base', 'legs')
  const legColor = readStr(props, 'legColor', '#2c2620')
  const tufted = style === 'tufted'

  const legH = base === 'legs' ? 0.09 : 0.05
  const totalH = 0.45
  const lidH = 0.06
  const bodyH = totalH - legH - lidH // upholstered box body
  const bodyY = legH
  const bodyTop = bodyY + bodyH
  const mat = getUpholsteryMaterial(material, color, sheen)
  const r = 0.03

  return (
    <group>
      {/* Upholstered box body — reaches down onto the base */}
      <RoundedBox
        args={[width, bodyH, depth]}
        radius={r}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, bodyY + bodyH / 2, 0]}
        material={mat}
      />

      {/* Base: short tapered feet or a recessed plinth (both reach the floor) */}
      {base === 'legs' ? (
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}.${sz}`}
              castShadow
              position={[sx * (width / 2 - 0.08), legH / 2, sz * (depth / 2 - 0.08)]}
            >
              <cylinderGeometry args={[0.028, 0.02, legH, 12]} />
              <meshStandardMaterial color={legColor} roughness={0.4} metalness={0.3} />
            </mesh>
          )),
        )
      ) : (
        <mesh castShadow position={[0, legH / 2, 0]}>
          <boxGeometry args={[width - 0.1, legH, depth - 0.08]} />
          <meshStandardMaterial color={legColor} roughness={0.6} metalness={0.1} />
        </mesh>
      )}

      {/* Lift lid — overlaps the body top, sits slightly proud of the sides */}
      <RoundedBox
        args={[width + 0.01, lidH, depth + 0.01]}
        radius={0.02}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, bodyTop + lidH / 2 - 0.008, 0]}
        material={mat}
      />

      {/* Piano hinge along the back top edge — bridges lid ↔ body */}
      <mesh
        castShadow
        position={[0, bodyTop, -depth / 2 + 0.012]}
        rotation={[0, 0, Math.PI / 2]}
        material={metalLeg('#8a8d92', 'satin')}
      >
        <cylinderGeometry args={[0.008, 0.008, width - 0.04, 8]} />
      </mesh>

      {/* Lid detail: piped welt seam (plain) or a grid of tufted buttons */}
      {tufted ? (
        (() => {
          const cols = Math.max(2, Math.round((width - 0.1) / 0.24))
          const gw = (width - 0.16) / cols
          const gd = (depth - 0.16) / 2
          return Array.from({ length: cols * 2 }, (_, k) => {
            const i = k % cols
            const j = Math.floor(k / cols)
            const x = -(width - 0.16) / 2 + gw / 2 + i * gw
            const z = -(depth - 0.16) / 2 + gd / 2 + j * gd
            return (
              <mesh key={k} position={[x, bodyTop + lidH - 0.02, z]}>
                <sphereGeometry args={[0.014, 8, 6]} />
                <meshStandardMaterial color={color} roughness={0.7} />
              </mesh>
            )
          })
        })()
      ) : (
        // Piped welt: a thin raised frame ringing the lid top edge.
        <group position={[0, bodyTop + lidH - 0.006, 0]}>
          {[-1, 1].map((sz) => (
            <mesh key={`f${sz}`} position={[0, 0, sz * (depth / 2 - 0.02)]}>
              <boxGeometry args={[width - 0.03, 0.012, 0.012]} />
              <meshStandardMaterial color={color} roughness={0.75} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh key={`s${sx}`} position={[sx * (width / 2 - 0.02), 0, 0]}>
              <boxGeometry args={[0.012, 0.012, depth - 0.03]} />
              <meshStandardMaterial color={color} roughness={0.75} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
