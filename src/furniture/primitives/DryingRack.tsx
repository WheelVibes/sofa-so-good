import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/** Foldable A-frame clothes drying rack (a ubiquitous HDB service-yard item):
 *  two splayed leg frames joined by horizontal drying bars. Faces +Z. */
export function DryingRack({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const color = readStr(props, 'color', '#c9ccd1')
  const h = 0.95
  const spread = 0.5
  // Legs / foot rails / drying bars route through the shared brushed-metal
  // material (soft satin brushing, tinted by the rack colour).
  const metal = metalLeg(color, 'satin')
  const halfW = width / 2

  // Two A-frames at ±spread/2 in Z; each is an inverted-V of two legs.
  const frames = [-spread / 2, spread / 2]
  const bars = 5

  return (
    <group>
      {frames.map((z, fi) => (
        <group key={fi}>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              castShadow
              position={[s * halfW * 0.35, h / 2, z]}
              rotation={[0, 0, s * 0.32]}
              material={metal}
            >
              <cylinderGeometry args={[0.015, 0.015, h, 8]} />
            </mesh>
          ))}
          {/* Foot rail */}
          <mesh position={[0, 0.02, z]} rotation={[0, 0, Math.PI / 2]} material={metal}>
            <cylinderGeometry args={[0.012, 0.012, width * 0.8, 8]} />
          </mesh>
        </group>
      ))}
      {/* Top drying bars spanning the two frames */}
      {Array.from({ length: bars }, (_, i) => {
        const z = -spread / 2 + (spread * i) / (bars - 1)
        return (
          <mesh
            key={`b${i}`}
            castShadow
            position={[0, h - 0.04, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={metal}
          >
            <cylinderGeometry args={[0.008, 0.008, width * 0.78, 6]} />
          </mesh>
        )
      })}
    </group>
  )
}
