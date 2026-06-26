import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { GlassMaterial } from './GlassMaterial'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Bar cart — a slim rolling trolley for an entertaining corner. A metal frame
 * (brass / black / chrome) carries two or three shelves (glass / wood /
 * marble), a push handle at one end, a guard rail around the top, and four
 * castor wheels. Floor-anchored, centred, faces +Z (handle at the back).
 */
export function BarCart({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.72)
  const depth = readNum(props, 'depth', 0.42)
  const tiers = Math.max(2, Math.round(readNum(props, 'tiers', 2)))
  const frame = readStr(props, 'frame', 'brass')
  const shelf = readStr(props, 'shelf', 'glass')
  const shelfColor = readStr(props, 'shelfColor', '#6f553f')

  const totalH = 0.82
  const wheelR = 0.025
  const railH = 0.06
  const postT = 0.014

  // Frame members route through the shared brushed-metal material so they read
  // as real anisotropic metal: brass → warm satin brushing, chrome → bright
  // stainless, black → matte black-steel. Tint carries the brass/black colour.
  const frameMat =
    frame === 'brass'
      ? metalLeg('#b08d57', 'satin')
      : frame === 'chrome'
        ? metalLeg('#cfd2d6', 'stainless')
        : metalLeg('#26262a', 'black-steel')

  // Glass shelves render the tier-gated GlassMaterial (real transmission on
  // High/Maximum); wood/marble use the cached surface material instances.
  const shelfMat =
    shelf === 'marble'
      ? getSurfaceMaterial('marble', '#e9e6df', 1.0, 0.6)
      : getSurfaceMaterial('wood', shelfColor, 0.8, 0.1)

  // Shelf Y positions: bottom just above wheels, top below the handle.
  const yBottom = wheelR * 2 + 0.04
  const yTop = totalH - 0.12
  const ys = Array.from({ length: tiers }, (_, i) =>
    tiers === 1 ? yTop : yBottom + (yTop - yBottom) * (i / (tiers - 1)),
  )

  const px = width / 2 - postT
  const pz = depth / 2 - postT
  const posts: [number, number][] = [
    [-px, -pz],
    [px, -pz],
    [-px, pz],
    [px, pz],
  ]

  const shelfThk = shelf === 'glass' ? 0.012 : 0.02

  return (
    <group>
      {/* Corner posts */}
      {posts.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, totalH / 2, z]} material={frameMat}>
          <cylinderGeometry args={[postT, postT, totalH, 12]} />
        </mesh>
      ))}

      {/* Shelves */}
      {ys.map((y, i) =>
        shelf === 'glass' ? (
          <mesh key={i} castShadow receiveShadow position={[0, y, 0]}>
            <boxGeometry args={[width - postT, shelfThk, depth - postT]} />
            <GlassMaterial color="#bfd6d8" opacity={0.34} />
          </mesh>
        ) : (
          <mesh key={i} castShadow receiveShadow position={[0, y, 0]} material={shelfMat as never}>
            <boxGeometry args={[width - postT, shelfThk, depth - postT]} />
          </mesh>
        ),
      )}

      {/* Top guard rail (three sides, open at the front for access) */}
      {[
        {
          pos: [0, yTop + railH, -pz] as [number, number, number],
          len: width - postT,
          axis: 'x' as const,
        },
        {
          pos: [-px, yTop + railH, 0] as [number, number, number],
          len: depth - postT,
          axis: 'z' as const,
        },
        {
          pos: [px, yTop + railH, 0] as [number, number, number],
          len: depth - postT,
          axis: 'z' as const,
        },
      ].map((r, i) => (
        <mesh
          key={i}
          position={r.pos}
          rotation={[r.axis === 'z' ? 0 : Math.PI / 2, 0, r.axis === 'z' ? Math.PI / 2 : 0]}
          material={frameMat}
        >
          <cylinderGeometry args={[0.006, 0.006, r.len, 8]} />
        </mesh>
      ))}

      {/* Push handle, arching over the back edge */}
      <group position={[0, totalH - 0.02, -pz]}>
        <mesh position={[0, 0.05, -0.04]} rotation={[0, 0, Math.PI / 2]} material={frameMat}>
          <cylinderGeometry args={[0.01, 0.01, width - postT, 10]} />
        </mesh>
      </group>

      {/* Castor wheels */}
      {posts.map(([x, z], i) => (
        <mesh key={`w${i}`} castShadow position={[x, wheelR, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[wheelR, wheelR, 0.02, 12]} />
          <meshStandardMaterial color="#1c1c1e" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
    </group>
  )
}
