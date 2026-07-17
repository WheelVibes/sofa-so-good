import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import { Vector2 } from 'three'
import { getUpholsteryMaterial, getWoodMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Ottoman / pouf — a soft upholstered footstool or extra seat that pairs with
 * a sofa or armchair. `shape` is a round drum, a square cube, or a wider
 * rectangle; `tufting` adds a grid of button divots to the top; `feet` sits it
 * on short wood feet or flush to the floor. Floor-anchored, centred.
 */
export function Ottoman({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6)
  const depth = readNum(props, 'depth', 0.6)
  const height = readNum(props, 'height', 0.42)
  const color = readStr(props, 'color', '#b9683f')
  const legColor = readStr(props, 'legColor', '#3a2c1d')
  const material = readStr(props, 'material', 'fabric')
  const sheen = readNum(props, 'sheen', 0)
  const shape = readStr(props, 'shape', 'round')
  const tufting = readStr(props, 'tufting', 'none')
  const feet = readStr(props, 'feet', 'wood')

  const uphol = getUpholsteryMaterial(material, color, sheen)
  const legMat = getWoodMaterial(legColor, 0.4)
  const detail = useDetail()

  // Knitted pouffe: a soft floor cushion with a gently barrelled (bulged)
  // silhouette — a single lathed body, no feet, seated flush on the floor. The
  // widest point sits at the footprint radius so the collision box stays honest;
  // the top/bottom pull in slightly for the plump, hand-knitted look.
  const pouffeProfile = useMemo(() => {
    const r = Math.min(width, depth) / 2
    return [
      new Vector2(0, 0),
      new Vector2(r * 0.72, 0),
      new Vector2(r * 0.9, height * 0.14),
      new Vector2(r, height * 0.5),
      new Vector2(r * 0.86, height * 0.86),
      new Vector2(r * 0.6, height - 0.005),
      new Vector2(0, height),
    ]
  }, [width, depth, height])

  if (shape === 'pouffe') {
    const r = Math.min(width, depth) / 2
    return (
      <group>
        <mesh castShadow receiveShadow material={uphol}>
          <latheGeometry args={[pouffeProfile, seg(32, detail)]} />
        </mesh>
        {/* Braided top button + a faint seam ring, reading as the knit crown. */}
        <mesh position={[0, height - 0.01, 0]} material={uphol}>
          <sphereGeometry args={[r * 0.1, 10, 8]} />
        </mesh>
      </group>
    )
  }

  const footH = feet === 'wood' ? 0.07 : 0
  const bodyH = height - footH
  const bodyY = footH + bodyH / 2
  const r = shape === 'round' ? Math.min(width, depth) / 2 : 0

  // Button-tufting divots: a small grid of darkened dimples on the top.
  const tuftMat = getUpholsteryMaterial(material, color, Math.min(1, sheen + 0.15))
  const tuftY = footH + bodyH - 0.01
  const buttons: [number, number][] = []
  if (tufting === 'buttons') {
    const nx = shape === 'rect' ? 3 : 2
    const nz = 2
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -width * 0.28 + (width * 0.56 * i) / (nx - 1)
        const z = -depth * 0.24 + (depth * 0.48 * j) / (nz - 1)
        if (shape === 'round' && Math.hypot(x, z) > r - 0.06) continue
        buttons.push([x, z])
      }
    }
  }

  return (
    <group>
      {/* Body */}
      {shape === 'round' ? (
        <mesh castShadow receiveShadow position={[0, bodyY, 0]} material={uphol}>
          <cylinderGeometry args={[r, r * 0.96, bodyH, seg(32, detail)]} />
        </mesh>
      ) : (
        <RoundedBox
          args={[width, bodyH, depth]}
          radius={0.05}
          smoothness={3}
          castShadow
          receiveShadow
          position={[0, bodyY, 0]}
          material={uphol}
        />
      )}

      {/* Button tufting */}
      {buttons.map(([x, z], i) => (
        <mesh key={i} position={[x, tuftY, z]} material={tuftMat}>
          <sphereGeometry args={[0.018, 10, 8]} />
        </mesh>
      ))}

      {/* Feet */}
      {feet === 'wood' &&
        (shape === 'round'
          ? Array.from({ length: 3 }, (_, i) => {
              const a = (i / 3) * Math.PI * 2 + Math.PI / 6
              const fr = r * 0.7
              return (
                <mesh
                  key={i}
                  castShadow
                  position={[Math.cos(a) * fr, footH / 2, Math.sin(a) * fr]}
                  material={legMat}
                >
                  <cylinderGeometry args={[0.022, 0.016, footH, 10]} />
                </mesh>
              )
            })
          : [-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <mesh
                  key={`${sx}.${sz}`}
                  castShadow
                  position={[sx * (width / 2 - 0.08), footH / 2, sz * (depth / 2 - 0.08)]}
                  material={legMat}
                >
                  <cylinderGeometry args={[0.022, 0.016, footH, 10]} />
                </mesh>
              )),
            ))}
    </group>
  )
}
