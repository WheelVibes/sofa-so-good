import { getPaintedMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Litter box in three real-dimension styles: `open` (a shallow tray ≈46×36×10
 * cm with a low rim), `covered` (a hooded box ≈56×46×41 cm with a front entry
 * arch) and `top-entry` (a closed tub ≈50×38×40 cm with a lid hole on top).
 * Floor-anchored, footprint-centred, faces +Z (the entry is on the +Z front).
 * Real metres; walls connect to a solid floor pan. `frontClearance` on the def
 * keeps access space in front.
 */
export function LitterBox({ props }: { props: ParamProps }) {
  const style = readStr(props, 'style', 'open')
  const color = readStr(props, 'color', '#5a6b74')
  const litterColor = '#d9cdb0'
  const r = seg(20, useDetail())

  const body = getPaintedMaterial(color, false)
  const litter = getPaintedMaterial(litterColor, false, 0.95)
  const wall = 0.02

  if (style === 'open') {
    const w = 0.46
    const d = 0.36
    const h = 0.1
    return (
      <group>
        {/* Floor pan. */}
        <BeveledBox receiveShadow position={[0, wall / 2, 0]} material={body} args={[w, wall, d]} />
        {/* Four rim walls. */}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`x${s}`}
            castShadow
            receiveShadow
            position={[s * (w / 2 - wall / 2), h / 2, 0]}
            material={body}
            args={[wall, h, d]}
          />
        ))}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`z${s}`}
            castShadow
            receiveShadow
            position={[0, h / 2, s * (d / 2 - wall / 2)]}
            material={body}
            args={[w, h, wall]}
          />
        ))}
        {/* Litter fill. */}
        <BeveledBox
          position={[0, h * 0.42, 0]}
          material={litter}
          args={[w - wall * 2, 0.03, d - wall * 2]}
        />
      </group>
    )
  }

  if (style === 'top-entry') {
    const w = 0.5
    const d = 0.38
    const h = 0.4
    const holeR = 0.11
    return (
      <group>
        {/* Floor pan. */}
        <BeveledBox receiveShadow position={[0, wall / 2, 0]} material={body} args={[w, wall, d]} />
        {/* Four full walls. */}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`x${s}`}
            castShadow
            receiveShadow
            position={[s * (w / 2 - wall / 2), h / 2, 0]}
            material={body}
            args={[wall, h, d]}
          />
        ))}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`z${s}`}
            castShadow
            receiveShadow
            position={[0, h / 2, s * (d / 2 - wall / 2)]}
            material={body}
            args={[w, h, wall]}
          />
        ))}
        {/* Lid: a flat annulus (a round entry hole cut in the top). */}
        <mesh
          castShadow
          receiveShadow
          position={[0, h, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={body}
        >
          <ringGeometry args={[holeR, Math.min(w, d) * 0.5, r]} />
        </mesh>
      </group>
    )
  }

  // covered (default): hooded box with a front entry arch.
  const w = 0.56
  const d = 0.46
  const baseH = 0.2
  const hoodH = 0.21
  const doorW = 0.24
  const doorH = 0.22
  return (
    <group>
      {/* Lower tub. */}
      <BeveledBox receiveShadow position={[0, wall / 2, 0]} material={body} args={[w, wall, d]} />
      {[-1, 1].map((s) => (
        <BeveledBox
          key={`x${s}`}
          castShadow
          receiveShadow
          position={[s * (w / 2 - wall / 2), baseH / 2, 0]}
          material={body}
          args={[wall, baseH, d]}
        />
      ))}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={`z${s}`}
          castShadow
          receiveShadow
          position={[0, baseH / 2, s * (d / 2 - wall / 2)]}
          material={body}
          args={[w, baseH, wall]}
        />
      ))}
      {/* Litter fill in the tub. */}
      <BeveledBox
        position={[0, baseH * 0.55, 0]}
        material={litter}
        args={[w - wall * 2, 0.03, d - wall * 2]}
      />
      {/* Hood: side + back + roof walls, front left open with an entry arch. */}
      <group position={[0, baseH, 0]}>
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`hx${s}`}
            castShadow
            receiveShadow
            position={[s * (w / 2 - wall / 2), hoodH / 2, 0]}
            material={body}
            args={[wall, hoodH, d]}
          />
        ))}
        {/* Back wall. */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, hoodH / 2, -d / 2 + wall / 2]}
          material={body}
          args={[w, hoodH, wall]}
        />
        {/* Roof. */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, hoodH - wall / 2, 0]}
          material={body}
          args={[w, wall, d]}
        />
        {/* Front wall with a doorway: two jambs + a lintel. */}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={`fj${s}`}
            castShadow
            position={[s * (doorW / 2 + (w - doorW) / 4), hoodH / 2, d / 2 - wall / 2]}
            material={body}
            args={[(w - doorW) / 2, hoodH, wall]}
          />
        ))}
        <BeveledBox
          castShadow
          position={[0, hoodH - (hoodH - doorH) / 2, d / 2 - wall / 2]}
          material={body}
          args={[doorW, hoodH - doorH, wall]}
        />
      </group>
    </group>
  )
}
