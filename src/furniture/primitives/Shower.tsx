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
  // Glass panels sit ON the tray (foot at the 0.08 m tray top) rather than
  // spanning down THROUGH it — otherwise the panel plane at x/z = ±half lies
  // coplanar with the tray's side faces over the tray's height and z-fights the
  // opaque tray. Foot-on-tray reads correctly and keeps the assembly connected.
  const trayTop = 0.08
  const glassH = h - trayTop
  const glassY = trayTop + glassH / 2
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
      {/* Glass panels on the two open sides (+X and +Z), foot on the tray top */}
      <mesh position={[half, glassY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[size, glassH]} />
        <GlassMaterial color="#bcd4e6" opacity={0.22} />
      </mesh>
      {/* Second panel only on the corner enclosure; walk-in leaves +Z open */}
      {corner && (
        <mesh position={[0, glassY, half]}>
          <planeGeometry args={[size, glassH]} />
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
      {/* Riser/slide-rail on the −X/−Z corner. Runs the full height from INTO
          the tray (y 0.05, embedded in the 0–0.08 m tray) up to the sliding
          holder, so the whole plumbing column (riser + mixer + holder +
          handset + hose) reads as one grounded assembly attached to the tray
          rather than floating fittings on an absent wall — the deferred
          harness finding. Renamed from "shower-head arm" to "slide rail":
          the approved fitting (assets/ocs/toilet_fittings.png) is a HANDHELD
          set on a chrome slide-rail bar, not a fixed overhead rain head. */}
      <mesh castShadow position={[-half + 0.05, 0.94, -half + 0.05]} material={chrome}>
        <cylinderGeometry args={[0.015, 0.015, 1.78, 10]} />
      </mesh>
      {/* Sliding holder bracket — clamps the handset to the rail partway up
          (a short collar around the riser + a stub arm holding the handset
          cradle), replacing the old fixed diagonal arm to a rain head. */}
      <mesh
        position={[-half + 0.05, 1.55, -half + 0.05]}
        rotation={[Math.PI / 2, 0, 0]}
        material={chrome}
      >
        <cylinderGeometry args={[0.026, 0.026, 0.03, seg(12, detail)]} />
      </mesh>
      <mesh
        position={[-half + 0.115, 1.55, -half + 0.115]}
        rotation={[0, -Math.PI / 4, 0]}
        material={chrome}
      >
        <boxGeometry args={[0.14, 0.02, 0.02]} />
      </mesh>
      {/* Handset (cradled in the holder, socket-facing down like the photo) */}
      <mesh
        castShadow
        position={[-half + 0.18, 1.52, -half + 0.18]}
        rotation={[0.15, -Math.PI / 4, 0]}
        material={chrome}
      >
        <cylinderGeometry args={[0.026, 0.032, 0.16, seg(14, detail)]} />
      </mesh>
      {/* Head plate — the wide spray face at the handset's business end */}
      <mesh
        position={[-half + 0.192, 1.446, -half + 0.192]}
        rotation={[0.15, -Math.PI / 4, 0]}
        material={chrome}
      >
        <cylinderGeometry args={[0.045, 0.045, 0.014, seg(16, detail)]} />
      </mesh>
      {/* Mixer body (bath/shower mixer, low on the riser) */}
      <mesh position={[-half + 0.05, 0.95, -half + 0.05]} material={chrome}>
        <boxGeometry args={[0.08, 0.12, 0.08]} />
      </mesh>
      {/* Hose — a slim flexible tube from the mixer outlet up to the handset,
          following the riser (the photo's "with hose" mixer). Modelled as a
          thin cylinder along the riser rather than a free curve, since the
          rail already occupies that line. */}
      <mesh position={[-half + 0.05, 1.24, -half + 0.05]} material={chrome}>
        <cylinderGeometry args={[0.008, 0.008, 0.58, 8]} />
      </mesh>
    </group>
  )
}
