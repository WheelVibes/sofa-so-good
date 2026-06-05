import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MirrorMaterial } from './MirrorMaterial'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Leaning full-length floor mirror: a tall framed reflective panel that
 * stands on the floor and tilts back slightly against the wall behind it.
 * Faces +Z. The pane uses the same tier-robust reflective treatment as the
 * wall mirror (light base + faint emissive floor so it never goes black on
 * the Low tier, boosted envMapIntensity to catch the IBL where it's on).
 */
export function FloorMirror({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6)
  const detail = useDetail()
  const height = readNum(props, 'height', 1.6)
  const frameColor = readStr(props, 'frameColor', '#6f553f')
  const frameFinish = readStr(props, 'frameFinish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const shape = readStr(props, 'shape', 'rect')

  const frameD = 0.05
  const frameMat = getSurfaceMaterial(frameFinish, frameColor, 1, sheen)
  // Real planar reflection on High/Maximum, else the tier-cheap fake-shiny pane.
  const pane = <MirrorMaterial tint="#dfe8ee" />

  if (shape === 'round') {
    // Cheval-style round mirror swivelling between two posts on a foot bar.
    const r = width / 2
    const standH = 0.12 // foot clearance below the ring
    const cy = standH + r
    const postX = r + 0.04
    return (
      <group>
        <group position={[0, cy, 0]} rotation={[0.05, 0, 0]}>
          <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} material={frameMat}>
            <torusGeometry args={[r, 0.03, seg(16, detail), seg(48, detail)]} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <circleGeometry args={[r - 0.01, seg(48, detail)]} />
            {pane}
          </mesh>
        </group>
        {/* Two side posts */}
        {[-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * postX, cy / 2 + 0.04, -0.02]} material={frameMat}>
            <boxGeometry args={[0.03, cy + 0.1, 0.03]} />
          </mesh>
        ))}
        {/* Foot bar + two splayed feet */}
        <mesh castShadow position={[0, 0.03, -0.02]} material={frameMat}>
          <boxGeometry args={[postX * 2 + 0.06, 0.04, 0.04]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`f${s}`} castShadow position={[s * postX, 0.02, 0.08]} material={frameMat}>
            <boxGeometry args={[0.04, 0.03, 0.28]} />
          </mesh>
        ))}
      </group>
    )
  }

  const lean = 0.12 // radians, top tilts back toward the wall
  return (
    // Pivot at the floor so the lean rotates about the base.
    <group rotation={[lean, 0, 0]}>
      <group position={[0, height / 2, 0]}>
        {/* Frame */}
        <mesh castShadow receiveShadow position={[0, 0, 0]} material={frameMat}>
          <boxGeometry args={[width + 0.06, height + 0.06, frameD]} />
        </mesh>
        {/* Reflective pane, slightly proud of the frame face */}
        <mesh position={[0, 0, frameD / 2 + 0.005]}>
          <planeGeometry args={[width, height]} />
          {pane}
        </mesh>
      </group>
    </group>
  )
}
