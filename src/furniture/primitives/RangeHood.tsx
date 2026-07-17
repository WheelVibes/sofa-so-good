import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import {
  ApplianceBodyMaterial,
  applianceBody,
  applianceBodyMeshProps,
  readNum,
  readStr,
} from './shared'

/** Chimney range hood mounted above a stove: tapered canopy + duct cover.
 *  Mounted on the wall (group offset up in Y). Faces +Z (canopy opening down,
 *  duct against the wall at -Z). */
export function RangeHood({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const mountH = readNum(props, 'mountHeight', 1.45) // canopy underside height
  const color = readStr(props, 'color', '#c4c8cc')
  const finish = readStr(props, 'finish', 'steel')
  const metal = applianceBody(color, finish)

  const canopyH = 0.16
  const depth = 0.45

  return (
    <group position={[0, mountH, 0]}>
      {/* Canopy (wider at the bottom lip) */}
      <BeveledBox
        {...applianceBodyMeshProps(metal)}
        castShadow
        receiveShadow
        position={[0, canopyH / 2, 0]}
        args={[width, canopyH, depth]}
        bevel={0.01}
      >
        <ApplianceBodyMaterial finish={metal} />
      </BeveledBox>
      {/* Lower glass/grease lip */}
      <mesh position={[0, 0.002, depth / 2 - 0.06]}>
        <boxGeometry args={[width - 0.04, 0.02, 0.16]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Tapered transition up to the duct — a 4-sided frustum rotated 45° so
          its flat faces front/back/side (a real chimney taper) instead of a
          corner-forward diamond. */}
      <mesh
        {...applianceBodyMeshProps(metal)}
        castShadow
        position={[0, canopyH + 0.12, -depth / 2 + 0.18]}
        rotation={[0, Math.PI / 4, 0]}
      >
        <cylinderGeometry args={[0.14, 0.24, 0.24, 4]} />
        <ApplianceBodyMaterial finish={metal} />
      </mesh>
      {/* Duct cover against the wall */}
      <BeveledBox
        {...applianceBodyMeshProps(metal)}
        castShadow
        position={[0, canopyH + 0.45, -depth / 2 + 0.1]}
        args={[0.26, 0.5, 0.16]}
        bevel={0.01}
      >
        <ApplianceBodyMaterial finish={metal} />
      </BeveledBox>
    </group>
  )
}
