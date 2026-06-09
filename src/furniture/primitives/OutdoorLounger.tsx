import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readStr } from './shared'

/**
 * Outdoor lounger / sunbed (balcony / poolside): a low slatted frame on short
 * feet with a thick seat cushion and an inclined back cushion at the head (−Z).
 * `finish` sets the frame (teak/painted/metal/rattan); a fabric cushion sits on
 * top. Faces +Z (you recline looking +Z, head at −Z). Floor-anchored, metres.
 */
export function OutdoorLounger({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#a9763f')
  const finish = readStr(props, 'finish', 'wood')
  const cushion = readStr(props, 'cushion', '#dfe3e1')
  const frameMat = getSurfaceMaterial(finish, color, 1, 0)
  const cushionMat = getFabricMaterial(cushion, 0.9)

  const w = 0.72
  const len = 1.95
  const legH = 0.12
  const baseY = legH
  const baseT = 0.06
  const legT = 0.06
  const legX = w / 2 - 0.05
  const legZ = len / 2 - 0.08
  const cushionY = baseY + baseT / 2 + 0.06

  const leg = (sx: number, sz: number) => (
    <mesh key={`${sx}-${sz}`} castShadow position={[sx, legH / 2, sz]} material={frameMat}>
      <boxGeometry args={[legT, legH, legT]} />
    </mesh>
  )

  // Slatted base across the length.
  const slats = Array.from({ length: 9 }, (_, i) => -len / 2 + 0.12 + (i * (len - 0.24)) / 8)

  return (
    <group>
      {leg(-legX, -legZ)}
      {leg(legX, -legZ)}
      {leg(-legX, legZ)}
      {leg(legX, legZ)}
      {/* Side rails */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * legX, baseY, 0]} material={frameMat}>
          <boxGeometry args={[legT, baseT, len]} />
        </mesh>
      ))}
      {/* Base slats */}
      {slats.map((z) => (
        <mesh key={z} castShadow receiveShadow position={[0, baseY, z]} material={frameMat}>
          <boxGeometry args={[w - legT, baseT * 0.6, 0.06]} />
        </mesh>
      ))}
      {/* Seat cushion (covers the foot ~⅔ of the bed) */}
      <mesh castShadow receiveShadow position={[0, cushionY, 0.28]} material={cushionMat}>
        <boxGeometry args={[w - 0.08, 0.12, len * 0.66]} />
      </mesh>
      {/* Inclined back cushion at the head */}
      <mesh
        castShadow
        receiveShadow
        position={[0, cushionY + 0.16, -len / 2 + 0.34]}
        rotation={[-0.55, 0, 0]}
        material={cushionMat}
      >
        <boxGeometry args={[w - 0.08, 0.1, 0.62]} />
      </mesh>
    </group>
  )
}
