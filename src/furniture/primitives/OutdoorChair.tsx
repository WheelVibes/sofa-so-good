import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readStr } from './shared'

/**
 * Slatted outdoor lounge chair (balcony / patio): two side frames with front +
 * back legs and an armrest, a slatted seat, and an angled slatted back. Faces +Z
 * (you sit looking +Z, back at −Z). Floor-anchored. `finish` = teak/painted/metal.
 */
export function OutdoorChair({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#a9763f')
  const finish = readStr(props, 'finish', 'wood')
  const mat = getSurfaceMaterial(finish, color, 1, 0)
  const w = 0.62
  const seatY = 0.4
  const legT = 0.05
  const slatT = 0.02

  // Horizontal seat slats (front −Z … +Z) and angled back slats.
  const seatSlats = [-0.2, -0.07, 0.06, 0.19]
  const backSlats = [0.46, 0.58, 0.7, 0.82]

  const sideFrame = (sx: number) => (
    <group position={[sx, 0, 0]}>
      {/* front + back legs */}
      <mesh castShadow position={[0, seatY / 2, 0.24]} material={mat}>
        <boxGeometry args={[legT, seatY, legT]} />
      </mesh>
      <mesh castShadow position={[0, seatY / 2, -0.26]} material={mat}>
        <boxGeometry args={[legT, seatY, legT]} />
      </mesh>
      {/* seat side rail */}
      <mesh castShadow position={[0, seatY, 0]} material={mat}>
        <boxGeometry args={[legT, slatT, 0.56]} />
      </mesh>
      {/* armrest */}
      <mesh castShadow position={[0, 0.62, 0.02]} material={mat}>
        <boxGeometry args={[legT, slatT, 0.5]} />
      </mesh>
      {/* arm support to the front leg */}
      <mesh castShadow position={[0, 0.51, 0.24]} material={mat}>
        <boxGeometry args={[legT, 0.22, legT]} />
      </mesh>
    </group>
  )

  return (
    <group>
      {sideFrame(-w / 2 + legT / 2)}
      {sideFrame(w / 2 - legT / 2)}
      {/* Seat slats */}
      {seatSlats.map((z) => (
        <mesh
          key={`s${z}`}
          castShadow
          receiveShadow
          position={[0, seatY + slatT, z]}
          material={mat}
        >
          <boxGeometry args={[w - legT, slatT, 0.1]} />
        </mesh>
      ))}
      {/* Back slats, slightly reclined (tilted about X) */}
      {backSlats.map((y, i) => (
        <mesh
          key={`b${y}`}
          castShadow
          receiveShadow
          position={[0, y, -0.26 - i * 0.02]}
          rotation={[-0.18, 0, 0]}
          material={mat}
        >
          <boxGeometry args={[w - legT, 0.09, slatT]} />
        </mesh>
      ))}
    </group>
  )
}
