import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Trestle desk — a worktop resting on two trestle supports (the maker / studio
 * desk). Faces +Z. `legStyle`:
 *  - 'trestle-a' — splayed wooden A-frame trestles with a low stretcher tie;
 *  - 'trestle-h' — vertical wooden H-frame trestles (front + back legs + a
 *    mid crossbar);
 *  - 'adjustable' — steel telescoping legs with visible height-adjust pin holes.
 * A long lower stretcher ties the two trestles. Worktop width 1.2–1.6 m tracked
 * via footprintParams. Real metres, footprint-centred, floor-anchored.
 */
export function TrestleDesk({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.4)
  const depth = readNum(props, 'depth', 0.7)
  const color = readStr(props, 'color', '#b9986a')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const legStyle = readStr(props, 'legStyle', 'trestle-a')

  const height = 0.74
  const topThk = 0.04
  const topY = height - topThk / 2
  const legTopY = height - topThk // legs meet the worktop underside

  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const steel = metalLeg('#8a8d92', 'satin')
  const holeMat = { color: '#26282b', roughness: 0.6, metalness: 0.3 }

  const trestleX = width / 2 - 0.18
  const legZ = depth / 2 - 0.08

  function TrestleA({ x }: { x: number }) {
    // Splayed legs meeting a beam under the worktop; low stretcher tie.
    const topZ = 0
    const footZ = depth / 2 - 0.05
    const dy = legTopY - 0.06
    return (
      <group position={[x, 0, 0]}>
        {/* Beam under the worktop (runs along depth) */}
        <BeveledBox
          castShadow
          position={[0, legTopY - 0.03, topZ]}
          material={wood}
          args={[0.07, 0.06, depth - 0.05]}
        />
        {/* Two splayed legs to the floor (front + back) */}
        {[-1, 1].map((s) => {
          const zBot = s * footZ
          const len = Math.hypot(zBot - topZ, dy)
          const ang = Math.atan2(zBot - topZ, dy)
          return (
            <mesh
              key={s}
              castShadow
              position={[0, (legTopY - 0.06) / 2 + 0.02, (topZ + zBot) / 2]}
              rotation={[ang, 0, 0]}
              material={wood}
            >
              <boxGeometry args={[0.06, len, 0.06]} />
            </mesh>
          )
        })}
        {/* Low stretcher tie between the two splayed legs */}
        <BeveledBox
          castShadow
          position={[0, 0.2, 0]}
          material={wood}
          args={[0.05, 0.05, depth - 0.24]}
        />
      </group>
    )
  }

  function TrestleH({ x }: { x: number }) {
    return (
      <group position={[x, 0, 0]}>
        {/* Top beam under the worktop */}
        <BeveledBox
          castShadow
          position={[0, legTopY - 0.03, 0]}
          material={wood}
          args={[0.07, 0.06, depth - 0.05]}
        />
        {/* Front + back vertical legs */}
        {[-1, 1].map((s) => (
          <BeveledBox
            key={s}
            castShadow
            position={[0, legTopY / 2, s * legZ]}
            material={wood}
            args={[0.06, legTopY, 0.06]}
          />
        ))}
        {/* Mid crossbar (the H) */}
        <BeveledBox
          castShadow
          position={[0, 0.42, 0]}
          material={wood}
          args={[0.05, 0.06, legZ * 2]}
        />
      </group>
    )
  }

  function TrestleAdjustable({ x }: { x: number }) {
    return (
      <group position={[x, 0, 0]}>
        {/* Steel top beam under the worktop */}
        <mesh castShadow position={[0, legTopY - 0.03, 0]} material={steel}>
          <boxGeometry args={[0.06, 0.05, depth - 0.05]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 0, s * legZ]}>
            {/* Telescoping leg (outer + inner tube look) + foot pad */}
            <mesh castShadow position={[0, legTopY * 0.62, 0]} material={steel}>
              <boxGeometry args={[0.05, legTopY * 0.78, 0.05]} />
            </mesh>
            <mesh castShadow position={[0, legTopY * 0.26, 0]} material={steel}>
              <boxGeometry args={[0.062, legTopY * 0.54, 0.062]} />
            </mesh>
            <mesh castShadow position={[0, 0.012, 0]} material={steel}>
              <boxGeometry args={[0.08, 0.024, 0.08]} />
            </mesh>
            {/* Visible height-adjust pin holes down the outer tube */}
            {[0.3, 0.38, 0.46, 0.54].map((y, i) => (
              <mesh key={i} castShadow position={[0.033, y, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
                <meshStandardMaterial {...holeMat} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Mid crossbar tying the two legs */}
        <mesh castShadow position={[0, 0.4, 0]} material={steel}>
          <boxGeometry args={[0.04, 0.04, legZ * 2]} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Worktop */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, topY, 0]}
        material={wood}
        args={[width, topThk, depth]}
      />

      {[-trestleX, trestleX].map((x, i) => (
        <group key={i}>
          {legStyle === 'trestle-h' ? (
            <TrestleH x={x} />
          ) : legStyle === 'adjustable' ? (
            <TrestleAdjustable x={x} />
          ) : (
            <TrestleA x={x} />
          )}
        </group>
      ))}
    </group>
  )
}
