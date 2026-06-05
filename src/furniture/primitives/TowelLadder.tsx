import {
  getFabricMaterial,
  getSolidMaterial,
  getSurfaceMaterial,
} from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Freestanding blanket-ladder-style towel rail — two side rails leaning back
 * slightly with evenly-spaced horizontal rungs, a couple of towels draped over.
 * A decorative, freestanding counterpart to the wall-mounted {@link TowelRail}.
 * Floor-anchored, centred, faces +Z (towels hang toward the room); the top
 * leans back (toward -Z) as if resting against the wall behind it.
 */
export function TowelLadder({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.46)
  const height = readNum(props, 'height', 1.4)
  const finish = readStr(props, 'finish', 'chrome')
  const towelColor = readStr(props, 'towelColor', '#d9e2e6')
  const rungs = Math.max(3, Math.min(7, Math.round(readNum(props, 'rungs', 5))))

  // Rail/rung material from the finish (metal presets, or wood grain).
  const frame =
    finish === 'wood'
      ? getSurfaceMaterial('wood', '#9a7a52', 1.4, 0)
      : finish === 'black'
        ? getSolidMaterial('#2a2c2f', 0.4, 0.6)
        : finish === 'brass'
          ? getSolidMaterial('#b08d3e', 0.35, 0.8)
          : getSolidMaterial('#c6c9cd', 0.25, 0.85) // chrome (default)
  const towelMat = getFabricMaterial(towelColor)

  const railR = 0.018
  const rungR = 0.013
  const depth = 0.22 // base-to-top back-shift (the lean)
  // Z of a rung/rail point at fractional height f∈[0,1]: feet forward (+), top back (−).
  const zAt = (f: number) => depth / 2 - f * depth
  const railLen = Math.hypot(height, depth)
  const lean = Math.atan2(depth, height) // tilt the rails' top toward −Z

  return (
    <group>
      {/* Two leaning side rails */}
      {[-1, 1].map((s) => (
        <mesh
          key={`rail${s}`}
          castShadow
          receiveShadow
          position={[(s * width) / 2, height / 2, zAt(0.5)]}
          rotation={[-lean, 0, 0]}
          material={frame}
        >
          <cylinderGeometry args={[railR, railR, railLen, 12]} />
        </mesh>
      ))}

      {/* Horizontal rungs, evenly spaced up the rails */}
      {Array.from({ length: rungs }, (_, i) => {
        const f = (i + 0.6) / (rungs + 0.2)
        const y = f * height
        return (
          <mesh
            key={`rung${i}`}
            castShadow
            position={[0, y, zAt(f)]}
            rotation={[0, 0, Math.PI / 2]}
            material={frame}
          >
            <cylinderGeometry args={[rungR, rungR, width - railR * 2, 10]} />
          </mesh>
        )
      })}

      {/* Two towels draped over the 2nd and 4th rungs (front + back panels). */}
      {[1, 3].map((ri) => {
        const f = (ri + 0.6) / (rungs + 0.2)
        const y = f * height
        const z = zAt(f)
        return (
          <group key={`towel${ri}`} position={[0, y, z]}>
            <mesh castShadow position={[0, -0.2, 0.03]} material={towelMat}>
              <boxGeometry args={[width * 0.66, 0.42, 0.02]} />
            </mesh>
            <mesh castShadow position={[0, -0.18, -0.03]} material={towelMat}>
              <boxGeometry args={[width * 0.66, 0.38, 0.02]} />
            </mesh>
            <mesh castShadow position={[0, 0.014, 0]} material={towelMat}>
              <boxGeometry args={[width * 0.66, 0.025, 0.075]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
