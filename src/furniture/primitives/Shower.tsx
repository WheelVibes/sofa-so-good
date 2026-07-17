import type { ParamProps } from '../types'
import { GlassMaterial } from './GlassMaterial'
import { metalLeg, readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Corner shower: low tray + two glass panels + wall riser with head and
 *  mixer. The glass faces +X/+Z (open corner toward −X/−Z walls). The panels
 *  use the tier-gated `GlassMaterial` (real transmission on High/Maximum). */
export function Shower({ props }: { props: ParamProps }) {
  const size = readNum(props, 'size', 0.9)
  const detail = useDetail()
  const trayColor = readStr(props, 'trayColor', '#eceae6')
  const style = readStr(props, 'style', 'corner')
  const corner = style === 'corner'
  const h = 2.0
  const half = size / 2
  // Fittings route through the shared brushed-metal material (stainless).
  const chrome = metalLeg('#cdd2d6', 'stainless')

  return (
    <group>
      {/* Tray */}
      <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[size, 0.08, size]} />
        <meshStandardMaterial color={trayColor} roughness={0.3} metalness={0.05} />
      </mesh>
      {/* Drain */}
      <mesh position={[0, 0.085, 0]} rotation={[Math.PI / 2, 0, 0]} material={chrome}>
        <cylinderGeometry args={[0.05, 0.05, 0.01, seg(16, detail)]} />
      </mesh>
      {/* Glass panels on the two open sides (+X and +Z) */}
      <mesh position={[half, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[size, h]} />
        <GlassMaterial color="#bcd4e6" opacity={0.22} />
      </mesh>
      {/* Second panel only on the corner enclosure; walk-in leaves +Z open */}
      {corner && (
        <mesh position={[0, h / 2, half]}>
          <planeGeometry args={[size, h]} />
          <GlassMaterial color="#bcd4e6" opacity={0.22} />
        </mesh>
      )}
      {/* Glass frame edges */}
      <mesh position={[half, h, 0]} material={chrome}>
        <boxGeometry args={[0.02, 0.02, size]} />
      </mesh>
      {corner && (
        <mesh position={[0, h, half]} material={chrome}>
          <boxGeometry args={[size, 0.02, 0.02]} />
        </mesh>
      )}
      {/* Walk-in: a stabiliser bar from the screen top to the back wall */}
      {!corner && (
        <mesh position={[half, h - 0.05, -half + 0.1]} material={chrome}>
          <boxGeometry args={[0.02, 0.02, size - 0.2]} />
        </mesh>
      )}
      {/* Riser rail on the −X/−Z corner wall */}
      <mesh castShadow position={[-half + 0.05, 1.1, -half + 0.05]} material={chrome}>
        <cylinderGeometry args={[0.015, 0.015, 1.2, 10]} />
      </mesh>
      {/* Shower head */}
      <mesh
        position={[-half + 0.18, 1.85, -half + 0.18]}
        rotation={[Math.PI / 2, 0, 0]}
        material={chrome}
      >
        <cylinderGeometry args={[0.07, 0.07, 0.03, seg(18, detail)]} />
      </mesh>
      {/* Mixer */}
      <mesh position={[-half + 0.05, 0.95, -half + 0.05]} material={chrome}>
        <boxGeometry args={[0.08, 0.12, 0.08]} />
      </mesh>
    </group>
  )
}
