import { getSolidMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Standing coat / hat rack — a central pole on splayed feet with a ring of
 * hooks near the top (and a couple of upper pegs). An entryway staple.
 * `style` is a wood tree or a slim metal stand. Floor-anchored, centred.
 */
export function CoatRack({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 1.75)
  const color = readStr(props, 'color', '#6f553f')
  const style = readStr(props, 'style', 'wood')
  const sheen = readNum(props, 'sheen', 0.2)

  const poleMat =
    style === 'metal'
      ? getSolidMaterial(color, 0.35, 0.8)
      : getSurfaceMaterial('wood', color, 0.6, sheen)
  const poleR = style === 'metal' ? 0.02 : 0.032
  const hookMat = poleMat

  // Hooks at two heights for coats + hats.
  const tiers = [
    { y: height - 0.05, n: 4, len: 0.12, tilt: 0.5 },
    { y: height - 0.28, n: 4, len: 0.14, tilt: 0.7 },
  ]

  return (
    <group>
      {/* Central pole */}
      <mesh castShadow position={[0, height / 2, 0]} material={poleMat}>
        <cylinderGeometry args={[poleR, poleR * 1.2, height, 12]} />
      </mesh>
      {/* Top knob */}
      <mesh castShadow position={[0, height + 0.02, 0]} material={poleMat}>
        <sphereGeometry args={[poleR * 1.6, 12, 10]} />
      </mesh>
      {/* Three splayed tripod feet — each runs from the pole base (top, ~0.34 m
          up) out and DOWN to rest on the floor at ~0.26 m radius, so the rack
          reads as a stable, grounded coat tree. The earlier feet were tilted
          only ~29° off vertical with too-low a centre, so their lower ends sank
          through the floor and the base looked unsupported. */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        const tilt = 0.653 // ~37° from vertical
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.cos(a) * 0.13, 0.175, Math.sin(a) * 0.13]}
            rotation={[Math.sin(a) * tilt, -a, Math.cos(a) * tilt]}
            material={poleMat}
          >
            <cylinderGeometry args={[0.02, 0.014, 0.428, 8]} />
          </mesh>
        )
      })}
      {/* Hooks */}
      {tiers.flatMap((t, ti) =>
        Array.from({ length: t.n }, (_, i) => {
          const a = (i / t.n) * Math.PI * 2 + (ti === 0 ? 0 : Math.PI / t.n)
          return (
            <mesh
              key={`${ti}.${i}`}
              castShadow
              position={[Math.cos(a) * 0.04, t.y, Math.sin(a) * 0.04]}
              rotation={[Math.sin(a) * t.tilt, -a, Math.cos(a) * t.tilt]}
              material={hookMat}
            >
              <cylinderGeometry args={[0.01, 0.008, t.len, 8]} />
            </mesh>
          )
        }),
      )}
    </group>
  )
}
