import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { hexToRgb } from '../../materials/procedural/noise'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Desk / tabletop plant — a small succulent or trailing mini-plant in a compact
 * ceramic pot. Designed for desks, shelves, window sills. Distinctly smaller and
 * more petite than `PottedPlant` (which targets floor / corner placement). Two
 * types: 'succulent' (chunky rosette leaves) and 'trailing' (a few arching stems
 * with small oval leaves). Rests at `surfaceHeight`. Facing +Z.
 */
export function DeskPlant({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.72)
  const potColor = readStr(props, 'potColor', '#c4956a')
  const leafColor = readStr(props, 'leafColor', '#4a8a44')
  const type = readStr(props, 'type', 'succulent')
  const potFinish = readStr(props, 'potFinish', 'painted')

  const potMat = getSurfaceMaterial(potFinish, potColor, 1, 0.08)
  const r = seg(16, useDetail())

  const [lr, lg, lb] = hexToRgb(leafColor)
  const tint = (f: number) =>
    `rgb(${Math.round(Math.min(255, lr * f))},${Math.round(Math.min(255, lg * f))},${Math.round(Math.min(255, lb * f))})`

  const potH = 0.08
  const potRTop = 0.055
  const potRBot = 0.042

  // Succulent: a compact rosette of thick fleshy leaves radiating from center
  const succulentLeaves = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    const ring = 0.018 + (i % 3) * 0.006
    const len = 0.032 + (i % 4) * 0.008
    const tilt = 0.5 + (i % 3) * 0.15
    return { a, ring, len, tilt, shade: 0.8 + (i % 4) * 0.1 }
  })

  // Inner smaller leaves at center
  const innerLeaves = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * Math.PI * 2 + 0.4
    return { a, ring: 0.008, len: 0.02, tilt: 0.2, shade: 1.1 }
  })

  // Trailing: a few cascading stems with small oval leaves
  const trailingStems = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * Math.PI * 2
    const lean = 0.7 + (i % 2) * 0.2
    const len = 0.06 + (i % 3) * 0.018
    return { a, lean, len }
  })

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Pot */}
      <mesh castShadow receiveShadow position={[0, potH / 2, 0]} material={potMat}>
        <cylinderGeometry args={[potRTop, potRBot, potH, r]} />
      </mesh>
      {/* Rim */}
      <mesh castShadow position={[0, potH, 0]} material={potMat}>
        <cylinderGeometry args={[potRTop + 0.006, potRTop, 0.012, r]} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, potH - 0.008, 0]}>
        <cylinderGeometry args={[potRTop - 0.006, potRTop - 0.006, 0.01, r]} />
        <meshStandardMaterial color="#2c1e0f" roughness={1} />
      </mesh>

      {type === 'succulent' && (
        <>
          {/* Outer rosette leaves */}
          {succulentLeaves.map((l, i) => (
            <mesh
              key={i}
              castShadow
              position={[Math.sin(l.a) * l.ring, potH + 0.012, Math.cos(l.a) * l.ring]}
              rotation={[Math.cos(l.a) * l.tilt, l.a, -Math.sin(l.a) * l.tilt]}
            >
              <boxGeometry args={[0.012, l.len, 0.02]} />
              <meshStandardMaterial color={tint(l.shade)} roughness={0.7} metalness={0} />
            </mesh>
          ))}
          {/* Inner smaller leaves */}
          {innerLeaves.map((l, i) => (
            <mesh
              key={`in${i}`}
              castShadow
              position={[Math.sin(l.a) * l.ring, potH + 0.018, Math.cos(l.a) * l.ring]}
              rotation={[Math.cos(l.a) * l.tilt, l.a, -Math.sin(l.a) * l.tilt]}
            >
              <boxGeometry args={[0.009, l.len, 0.014]} />
              <meshStandardMaterial color={tint(l.shade)} roughness={0.7} metalness={0} />
            </mesh>
          ))}
        </>
      )}

      {type === 'trailing' && (
        <>
          {/* Stems arching out of the pot */}
          {trailingStems.map((s, i) => (
            <group key={i} position={[Math.sin(s.a) * 0.01, potH + 0.01, Math.cos(s.a) * 0.01]}>
              <mesh
                castShadow
                rotation={[Math.cos(s.a) * s.lean, s.a, -Math.sin(s.a) * s.lean]}
                position={[Math.sin(s.a) * s.len * 0.5, s.len * 0.4, Math.cos(s.a) * s.len * 0.5]}
              >
                <cylinderGeometry args={[0.002, 0.003, s.len, 5]} />
                <meshStandardMaterial color="#5a8030" roughness={0.9} />
              </mesh>
              {/* Small oval leaf at end */}
              <mesh
                castShadow
                position={[
                  Math.sin(s.a) * s.len * 0.95,
                  s.len * 0.72,
                  Math.cos(s.a) * s.len * 0.95,
                ]}
                scale={[0.018, 0.006, 0.024]}
              >
                <sphereGeometry args={[1, 8, 6]} />
                <meshStandardMaterial
                  color={tint(0.95 + (i % 3) * 0.1)}
                  roughness={0.65}
                  metalness={0}
                />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  )
}
