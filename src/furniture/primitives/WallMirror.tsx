import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MirrorMaterial } from './MirrorMaterial'
import { readNum, readStr } from './shared'

/**
 * Decorative wall mirror — a framed reflective panel that visually opens up a
 * room. `shape` is a round disc, an arched top, or a rectangle. Mounted (faces
 * +Z, offset to `mountHeight`); the glass uses a bright low-roughness metallic
 * material to read as a mirror under the scene lighting/IBL.
 */
export function WallMirror({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const height = readNum(props, 'height', 1.0)
  const centerY = readNum(props, 'mountHeight', 1.5)
  const shape = readStr(props, 'shape', 'round')
  const frameColor = readStr(props, 'frameColor', '#caa46a')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0.2)

  const frameMat = getSurfaceMaterial(finish, frameColor, 1.2, sheen)
  const ft = 0.04 // frame thickness (border)
  const depth = 0.05
  const r = Math.min(width, height) / 2

  if (shape === 'round') {
    return (
      <group position={[0, centerY, 0]}>
        <mesh castShadow position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={frameMat}>
          <cylinderGeometry args={[r, r, depth, 48]} />
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <circleGeometry args={[r - ft, 48]} />
          <MirrorMaterial tint="#d6e0e6" />
        </mesh>
      </group>
    )
  }

  // Rectangle (and arch = rectangle with a rounded cap on top).
  return (
    <group position={[0, centerY, 0]}>
      <mesh castShadow position={[0, 0, 0]} material={frameMat}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.002]}>
        <planeGeometry args={[width - ft * 2, height - ft * 2]} />
        <MirrorMaterial tint="#d6e0e6" />
      </mesh>
      {shape === 'arch' && (
        <>
          <mesh
            castShadow
            position={[0, height / 2, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={frameMat}
          >
            <cylinderGeometry args={[width / 2, width / 2, depth, 32, 1, false, 0, Math.PI]} />
          </mesh>
          <mesh position={[0, height / 2, depth / 2 + 0.002]} rotation={[0, 0, 0]}>
            <circleGeometry args={[width / 2 - ft, 24, 0, Math.PI]} />
            <MirrorMaterial tint="#d6e0e6" />
          </mesh>
        </>
      )}
    </group>
  )
}
