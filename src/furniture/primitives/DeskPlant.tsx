import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafTintHex } from './leafFoliage'
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

  const potH = 0.08
  const potRTop = 0.055
  const potRBot = 0.042

  // Succulent: a compact rosette of plump leaves radiating from the centre, plus
  // a few smaller upright inner leaves — all based at the soil (connected).
  const succulentLeaves: BoxInstance[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const ring = 0.014 + (i % 3) * 0.006
    const len = 0.04 + (i % 4) * 0.008
    const tilt = 0.6 + (i % 3) * 0.18
    succulentLeaves.push({
      position: [Math.sin(a) * ring, potH + 0.004, Math.cos(a) * ring],
      size: [0.026, len, 0.026],
      rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
      color: leafTintHex(i),
    })
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    succulentLeaves.push({
      position: [Math.sin(a) * 0.007, potH + 0.006, Math.cos(a) * 0.007],
      size: [0.02, 0.026, 0.02],
      rotation: [Math.cos(a) * 0.2, a, -Math.sin(a) * 0.2],
      color: leafTintHex(i, 3),
    })
  }

  // Trailing: a few cascading stems (cylinders) each ending in a pothos leaf.
  const trailingStems = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * Math.PI * 2
    const lean = 0.7 + (i % 2) * 0.2
    const len = 0.06 + (i % 3) * 0.018
    return { a, lean, len }
  })
  const trailingLeaves: BoxInstance[] = trailingStems.map((s, i) => ({
    position: [Math.sin(s.a) * s.len * 0.9, potH + 0.01 + s.len * 0.6, Math.cos(s.a) * s.len * 0.9],
    size: [0.03, 0.04, 0.03],
    rotation: [1.4 + s.lean, s.a, 0],
    color: leafTintHex(i, 5),
  }))

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
        <InstancedLeaves species="succulent" color={leafColor} instances={succulentLeaves} />
      )}

      {type === 'trailing' && (
        <>
          {/* Stems arching out of the pot */}
          {trailingStems.map((s, i) => (
            <mesh
              key={i}
              castShadow
              rotation={[Math.cos(s.a) * s.lean, s.a, -Math.sin(s.a) * s.lean]}
              position={[
                Math.sin(s.a) * s.len * 0.5,
                potH + 0.01 + s.len * 0.4,
                Math.cos(s.a) * s.len * 0.5,
              ]}
            >
              <cylinderGeometry args={[0.002, 0.003, s.len, 5]} />
              <meshStandardMaterial color="#5a8030" roughness={0.9} />
            </mesh>
          ))}
          <InstancedLeaves species="pothos" color={leafColor} instances={trailingLeaves} />
        </>
      )}
    </group>
  )
}
