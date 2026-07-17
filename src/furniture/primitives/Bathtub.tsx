import { RoundedBox } from '@react-three/drei'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Bathtub — a `freestanding` soaker on low feet, or a `builtin` alcove tub with
 * an apron (sits against a wall). Built as a rounded base body + four rim walls
 * enclosing an OPEN basin (so the recessed interior + water surface are actually
 * visible — a solid capped box would occlude them). A small deck mixer sits on
 * the rim. Floor-anchored, centred, faces +Z.
 */
export function Bathtub({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.6)
  const depth = readNum(props, 'depth', 0.75)
  const color = readStr(props, 'color', '#f3f1ec')
  const finish = readStr(props, 'finish', 'gloss')
  const sheen = readNum(props, 'sheen', 0.4)
  const style = readStr(props, 'style', 'builtin')

  const h = 0.56
  const shell = getSurfaceMaterial(finish, color, 1.2, sheen)
  const water = {
    color: '#cfe2e6',
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
  } as const
  // Chrome fittings route through the shared brushed-metal material (satin so it
  // reads as light steel rather than a black mirror of the dark floor).
  const chrome = metalLeg('#d2d6da', 'satin')
  const freestanding = style === 'freestanding'
  const footH = freestanding ? 0.08 : 0

  // Body regions: a solid rounded base (rounded silhouette + basin floor) with
  // four rim walls rising to the deck, leaving the top open.
  const y0 = footH
  const wallT = freestanding ? 0.07 : 0.09
  const baseH = 0.16
  const innerFloorY = y0 + baseH
  const wallH = h - innerFloorY
  const innerW = width - wallT * 2
  const innerD = depth - wallT * 2
  const wallCY = innerFloorY + wallH / 2
  const waterY = innerFloorY + Math.min(wallH * 0.62, 0.24)
  const baseR = freestanding ? 0.16 : 0.05
  const wallR = Math.min(0.035, wallT * 0.4)

  return (
    <group>
      {/* Solid base body (rounded exterior; its top is the basin floor) */}
      <RoundedBox
        args={[width, baseH, depth]}
        radius={baseR}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, y0 + baseH / 2, 0]}
        material={shell}
      />
      {/* Four rim walls forming the tub sides + open-top deck. Left/right run the
          full depth so they overlap the front/back walls at the corners (no gap). */}
      {[1, -1].map((sz) => (
        <RoundedBox
          key={`fb${sz}`}
          args={[width, wallH, wallT]}
          radius={wallR}
          smoothness={3}
          castShadow
          receiveShadow
          position={[0, wallCY, sz * (depth / 2 - wallT / 2)]}
          material={shell}
        />
      ))}
      {[1, -1].map((sx) => (
        <RoundedBox
          key={`lr${sx}`}
          args={[wallT, wallH, depth]}
          radius={wallR}
          smoothness={3}
          castShadow
          receiveShadow
          position={[sx * (width / 2 - wallT / 2), wallCY, 0]}
          material={shell}
        />
      ))}
      {/* Water surface, recessed inside the walls above the basin floor */}
      <mesh position={[0, waterY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[innerW - 0.02, innerD - 0.02]} />
        <meshStandardMaterial {...water} />
      </mesh>

      {/* Feet (freestanding only) — connect the base to the floor */}
      {freestanding &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}.${sz}`}
              castShadow
              position={[sx * (width / 2 - 0.18), footH / 2, sz * (depth / 2 - 0.14)]}
              material={chrome}
            >
              <cylinderGeometry args={[0.03, 0.04, footH, 10]} />
            </mesh>
          )),
        )}

      {/* Mixer tap at one end — base sits on the deck rim */}
      <group position={[width / 2 - 0.12, h, 0]}>
        <mesh castShadow position={[0, 0.06, 0]} material={chrome}>
          <cylinderGeometry args={[0.018, 0.022, 0.14, 10]} />
        </mesh>
        <mesh
          castShadow
          position={[-0.08, 0.13, 0]}
          rotation={[0, 0, Math.PI / 2.4]}
          material={chrome}
        >
          <cylinderGeometry args={[0.014, 0.014, 0.16, 10]} />
        </mesh>
      </group>
    </group>
  )
}
