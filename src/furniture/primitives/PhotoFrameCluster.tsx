import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Photo-frame cluster — 3 tabletop picture frames of varied sizes arranged as a
 * styled group. One tall portrait, one landscape, one small square, slightly
 * offset/overlapping for a lived-in look. Rests at `surfaceHeight`. Facing +Z.
 * Distinct from wall-mounted WallArt.
 */
export function PhotoFrameCluster({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const frameColor = readStr(props, 'frameColor', '#2c2420')
  const matColor = readStr(props, 'matColor', '#f0ead8')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0.1)

  const frameMat = getSurfaceMaterial(finish, frameColor, 1, sheen)
  const matMat = getSurfaceMaterial('painted', matColor, 1, 0.02)
  // Art colours — slightly different for each frame
  const art1Mat = getSurfaceMaterial('painted', '#b0c4b8', 1, 0.05)
  const art2Mat = getSurfaceMaterial('painted', '#c8b89a', 1, 0.05)
  const art3Mat = getSurfaceMaterial('painted', '#a8b4c0', 1, 0.05)

  const frameThick = 0.014
  const depth = 0.022 // frame depth (front to back)

  // Frame definitions: [width, height, x offset, y offset on surface, z offset, y rotation, art mat]
  const frames: [number, number, number, number, number, number, typeof art1Mat][] = [
    [0.1, 0.14, -0.07, 0, 0, -0.05, art1Mat], // portrait left — slightly turned
    [0.13, 0.1, 0.06, 0, 0.01, 0.08, art2Mat], // landscape right — slightly turned
    [0.08, 0.08, 0.0, 0, -0.02, 0.0, art3Mat], // small square front
  ]

  return (
    <group position={[0, surfaceH, 0]}>
      {frames.map(([fw, fh, ox, oy, oz, ry, artMat], i) => {
        const baseY = oy + fh / 2 + 0.002 // sits on the surface
        return (
          <group key={i} position={[ox, baseY, oz]} rotation={[0, ry, 0]}>
            {/* Outer frame border — top */}
            <BeveledBox
              args={[fw, frameThick, depth]}
              material={frameMat}
              position={[0, fh / 2 - frameThick / 2, 0]}
              castShadow
              bevel={0.003}
            />
            {/* bottom */}
            <BeveledBox
              args={[fw, frameThick, depth]}
              material={frameMat}
              position={[0, -fh / 2 + frameThick / 2, 0]}
              castShadow
              bevel={0.003}
            />
            {/* left */}
            <BeveledBox
              args={[frameThick, fh - frameThick * 2, depth]}
              material={frameMat}
              position={[-fw / 2 + frameThick / 2, 0, 0]}
              castShadow
              bevel={0.003}
            />
            {/* right */}
            <BeveledBox
              args={[frameThick, fh - frameThick * 2, depth]}
              material={frameMat}
              position={[fw / 2 - frameThick / 2, 0, 0]}
              castShadow
              bevel={0.003}
            />
            {/* Mat / white border inside frame */}
            <BeveledBox
              args={[fw - frameThick * 2, fh - frameThick * 2, depth * 0.4]}
              material={matMat}
              position={[0, 0, 0]}
              bevel={0.002}
            />
            {/* Art area — sits PROUD of the mat (back embedded in the mat, front
                just above it) so the photo reads in the window and its back plane
                isn't coplanar with the mat back (different colours → z-fight). */}
            <BeveledBox
              args={[fw - frameThick * 2 - 0.016, fh - frameThick * 2 - 0.016, depth * 0.2]}
              material={artMat}
              position={[0, 0, depth * 0.2]}
              bevel={0.001}
            />
            {/* Small support foot — back base so frame leans slightly */}
            <BeveledBox
              args={[fw * 0.15, 0.008, 0.06]}
              material={frameMat}
              position={[0, -fh / 2 + 0.004, -depth * 0.2]}
              rotation={[-0.15, 0, 0]}
              bevel={0.002}
            />
          </group>
        )
      })}
    </group>
  )
}
