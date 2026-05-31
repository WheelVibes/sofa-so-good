import { RoundedBox } from '@react-three/drei'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Bathtub — a `freestanding` oval-ish soaker on low feet, or a `builtin`
 * rectangular tub with an apron (sits against a wall). A recessed inner basin
 * + a small wall/deck mixer. Floor-anchored, centred, faces +Z.
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
  const chrome = { color: '#cfd2d6', roughness: 0.2, metalness: 0.85 } as const
  const radius = style === 'freestanding' ? 0.22 : 0.06
  const footH = style === 'freestanding' ? 0.08 : 0

  return (
    <group>
      {/* Outer shell */}
      <RoundedBox
        args={[width, h - footH, depth]}
        radius={radius}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, footH + (h - footH) / 2, 0]}
        material={shell}
      />
      {/* Inner basin recess (water surface) */}
      <mesh position={[0, h - 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.22, depth - 0.22]} />
        <meshStandardMaterial {...water} />
      </mesh>
      {/* Inner rim wall (thin lip so the basin reads as recessed) */}
      <RoundedBox
        args={[width - 0.16, 0.06, depth - 0.16]}
        radius={radius * 0.6}
        smoothness={3}
        position={[0, h - 0.03, 0]}
        material={shell}
      />

      {/* Feet (freestanding only) */}
      {style === 'freestanding' &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}.${sz}`}
              castShadow
              position={[sx * (width / 2 - 0.18), footH / 2, sz * (depth / 2 - 0.14)]}
            >
              <cylinderGeometry args={[0.03, 0.04, footH, 10]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
          )),
        )}

      {/* Mixer tap at one end */}
      <group position={[width / 2 - 0.12, h, 0]}>
        <mesh castShadow position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.018, 0.022, 0.12, 10]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh castShadow position={[-0.08, 0.12, 0]} rotation={[0, 0, Math.PI / 2.4]}>
          <cylinderGeometry args={[0.014, 0.014, 0.16, 10]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      </group>
    </group>
  )
}
