import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Small sculptural / abstract object — a tabletop sculpture accent for
 * shelves, consoles and coffee tables. Three style variants:
 *   'twist'  – a stacked pair of twisted square prisms on a small plinth
 *   'arch'   – a minimal arch form (two uprights + a crossbar)
 *   'sphere' – a polished orb on a ring stand
 * Rests at `surfaceHeight`. Floor-anchored, facing +Z. Real metres.
 */
export function SmallSculpture({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const color = readStr(props, 'color', '#c0a87a')
  const finish = readStr(props, 'finish', 'gloss')
  const sheen = readNum(props, 'sheen', 0.5)
  const style = readStr(props, 'style', 'twist')

  const mat = getSurfaceMaterial(finish, color, 1, sheen)
  const baseMat = getSurfaceMaterial('painted', '#2a2620', 1, 0.1)

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Small rectangular plinth base */}
      <BeveledBox
        args={[0.1, 0.018, 0.1]}
        material={baseMat}
        position={[0, 0.009, 0]}
        receiveShadow
        bevel={0.004}
      />

      {style === 'twist' && (
        <>
          {/* Lower block — rotated 15° */}
          <BeveledBox
            args={[0.06, 0.08, 0.06]}
            material={mat}
            position={[0, 0.058, 0]}
            rotation={[0, 0.26, 0]}
            castShadow
            bevel={0.005}
          />
          {/* Upper block — rotated -22° for twist feel */}
          <BeveledBox
            args={[0.048, 0.07, 0.048]}
            material={mat}
            position={[0, 0.133, 0]}
            rotation={[0, -0.38, 0]}
            castShadow
            bevel={0.005}
          />
        </>
      )}

      {style === 'arch' && (
        <>
          {/* Left upright */}
          <BeveledBox
            args={[0.018, 0.14, 0.018]}
            material={mat}
            position={[-0.036, 0.088, 0]}
            castShadow
            bevel={0.004}
          />
          {/* Right upright */}
          <BeveledBox
            args={[0.018, 0.14, 0.018]}
            material={mat}
            position={[0.036, 0.088, 0]}
            castShadow
            bevel={0.004}
          />
          {/* Crossbar spanning the two uprights */}
          <BeveledBox
            args={[0.09, 0.018, 0.018]}
            material={mat}
            position={[0, 0.16, 0]}
            castShadow
            bevel={0.004}
          />
        </>
      )}

      {style === 'sphere' && (
        <>
          {/* Ring stand */}
          <mesh position={[0, 0.028, 0]}>
            <torusGeometry args={[0.038, 0.008, 12, 24]} />
            <meshStandardMaterial {...(mat as object)} />
          </mesh>
          {/* Orb */}
          <mesh castShadow position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.06, 24, 16]} />
            <meshStandardMaterial {...(mat as object)} />
          </mesh>
        </>
      )}
    </group>
  )
}
