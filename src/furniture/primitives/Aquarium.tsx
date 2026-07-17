import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Aquarium — a glass fish tank on a stand cabinet. Clear glass walls over a
 * gravel bed and tinted water (filled to just below the rim), with a few simple
 * planted stems for life. `width` sizes the tank; the stand finish is tintable.
 * Floor-anchored, footprint-centred, faces +Z. Real metres.
 */
export function Aquarium({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const standColor = readStr(props, 'standColor', '#3a2f26')
  const standFinish = readStr(props, 'standFinish', 'wood')
  const waterColor = readStr(props, 'waterColor', '#3f7d8c')

  const d = 0.42
  const standH = 0.7
  const tankH = 0.42
  const glassT = 0.012
  const w = width
  const standMat = getSurfaceMaterial(standFinish, standColor, 1, 0.1)
  const innerW = w - glassT * 2
  const innerD = d - glassT * 2

  const tankY = standH + tankH / 2
  const gravelH = 0.05
  const waterH = tankH - 0.05
  const plant = (x: number, z: number, h: number, c: string) => (
    <mesh key={`${x}-${z}`} castShadow position={[x, standH + gravelH + h / 2, z]}>
      <cylinderGeometry args={[0.006, 0.02, h, 6]} />
      <meshStandardMaterial color={c} roughness={0.8} />
    </mesh>
  )

  return (
    <group>
      {/* Stand cabinet */}
      <mesh castShadow receiveShadow position={[0, standH / 2, 0]} material={standMat}>
        <boxGeometry args={[w, standH, d]} />
      </mesh>
      {/* Stand toe recess shadow line (a thin darker plinth) */}
      <mesh position={[0, 0.02, d / 2 - 0.005]}>
        <boxGeometry args={[w - 0.04, 0.04, 0.01]} />
        <meshStandardMaterial color="#1c1813" roughness={0.7} />
      </mesh>
      {/* Gravel bed */}
      <mesh receiveShadow position={[0, standH + gravelH / 2 + 0.005, 0]}>
        <boxGeometry args={[innerW, gravelH, innerD]} />
        <meshStandardMaterial color="#b9a888" roughness={0.95} />
      </mesh>
      {/* Tinted water volume — kept fairly opaque so it reads as a filled tank
          (a near-transparent tint washes out against a bright window and the
          tank looks empty). */}
      <mesh position={[0, standH + gravelH + waterH / 2, 0]}>
        <boxGeometry args={[innerW - 0.004, waterH, innerD - 0.004]} />
        <meshStandardMaterial
          color={waterColor}
          roughness={0.1}
          metalness={0}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Planted stems */}
      {plant(-w * 0.28, -0.06, 0.22, '#3f7a3a')}
      {plant(-w * 0.18, 0.05, 0.16, '#4f9244')}
      {plant(w * 0.26, 0.02, 0.26, '#356b32')}
      {/* Glass tank shell (drawn last). Opacity high enough that the glass box
          itself reads at every tier — at ~0.18 the walls vanished under the
          faked IBL and only the black top rim showed, floating over the stand
          with an empty air gap. metalness 0 avoids a dark mirror-black front. */}
      <mesh position={[0, tankY, 0]}>
        <boxGeometry args={[w, tankH, d]} />
        <meshStandardMaterial
          color="#cfe0e6"
          roughness={0.06}
          metalness={0}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Black rim trim at the top of the glass */}
      <mesh castShadow position={[0, standH + tankH, 0]}>
        <boxGeometry args={[w + 0.01, 0.02, d + 0.01]} />
        <meshStandardMaterial color="#1b1b1e" roughness={0.5} />
      </mesh>
    </group>
  )
}
