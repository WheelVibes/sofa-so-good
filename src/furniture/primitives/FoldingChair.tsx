import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readStr } from './shared'

/**
 * Folding café / bistro chair — the balcony two-seater's companion. Each side
 * is a scissor-crossed leg pair (the folding-frame silhouette) carrying a
 * slatted seat and a slim slatted back. `finish` picks teak / rattan / painted /
 * a powder-coated metal look. Faces +Z (you sit looking +Z), floor-anchored,
 * centred. Real-world metres.
 */
export function FoldingChair({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#3a4038')
  const finish = readStr(props, 'finish', 'gloss')
  const isMetal = finish === 'gloss'
  const mat = isMetal ? metalLeg(color, 'black-steel') : getSurfaceMaterial(finish, color, 1, 0)

  const w = 0.42
  const depth = 0.44
  const seatY = 0.45
  const legT = 0.03
  const angle = 0.5 // scissor splay
  const H = 0.52 // leg length
  // Centre a rotated leg so its lowest corner rests on the floor.
  const legCenterY = (H / 2) * Math.cos(angle) + (legT / 2) * Math.sin(angle)
  const sideX = w / 2 - legT / 2

  const sideFrame = (sx: number) => (
    <group key={`sf${sx}`} position={[sx, 0, 0]}>
      {/* Scissor-crossed legs (the folding silhouette) */}
      <mesh castShadow position={[0, legCenterY, 0]} rotation={[angle, 0, 0]} material={mat}>
        <boxGeometry args={[legT, H, legT]} />
      </mesh>
      <mesh castShadow position={[0, legCenterY, 0]} rotation={[-angle, 0, 0]} material={mat}>
        <boxGeometry args={[legT, H, legT]} />
      </mesh>
      {/* Back upright rising from the seat rear */}
      <mesh castShadow position={[0, seatY + 0.17, -depth / 2 + legT / 2]} material={mat}>
        <boxGeometry args={[legT, 0.34, legT]} />
      </mesh>
    </group>
  )

  const seatSlatZ = [-0.13, 0, 0.13]
  const backSlatY = [0.58, 0.7]

  return (
    <group>
      {sideFrame(-sideX)}
      {sideFrame(sideX)}
      {/* Slatted seat spanning the two side frames */}
      {seatSlatZ.map((z) => (
        <mesh key={`ss${z}`} castShadow receiveShadow position={[0, seatY, z]} material={mat}>
          <boxGeometry args={[w, 0.02, 0.1]} />
        </mesh>
      ))}
      {/* Front + back seat rails tying the frames together */}
      {[-1, 1].map((sz) => (
        <mesh
          key={`rail${sz}`}
          castShadow
          position={[0, seatY - 0.03, sz * (depth / 2 - legT)]}
          material={mat}
        >
          <boxGeometry args={[w - legT, legT, legT]} />
        </mesh>
      ))}
      {/* Slim slatted back */}
      {backSlatY.map((y) => (
        <mesh key={`bs${y}`} castShadow position={[0, y, -depth / 2 + legT / 2]} material={mat}>
          <boxGeometry args={[w - legT, 0.04, legT * 0.7]} />
        </mesh>
      ))}
    </group>
  )
}
