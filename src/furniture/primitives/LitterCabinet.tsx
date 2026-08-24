import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/**
 * Litter concealment cabinet — a bench-style wood cabinet that hides a covered
 * litter box, doubling as furniture. A side entry hole lets the cat in; the rear
 * carries ventilation cut-outs (a row of slots) for airflow; a hinged front door
 * gives cleaning access. The interior is sized to clear a covered litter box
 * (≈56×46×41 cm). Floor-anchored, footprint-centred, faces +Z. Real metres;
 * carcass panels connect (structural read).
 */
export function LitterCabinet({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.72)
  const depth = readNum(props, 'depth', 0.52)
  const height = readNum(props, 'height', 0.5)
  const color = readStr(props, 'color', '#9d7c54')
  const finish = readStr(props, 'finish', 'wood')
  const entrySide = readStr(props, 'entrySide', 'left')

  const wood = getSurfaceMaterial(finish, color, 1.2)
  const t = 0.018
  const halfW = width / 2
  const halfD = depth / 2
  const midY = height / 2

  const holeR = 0.14
  const sideSign = entrySide === 'right' ? 1 : -1

  return (
    <group>
      {/* Top (bench seat). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, height - t / 2, 0]}
        material={wood}
        args={[width, t, depth]}
      />
      {/* Bottom floor. */}
      <BeveledBox
        receiveShadow
        position={[0, t / 2, 0]}
        material={wood}
        args={[width - 2 * t, t, depth]}
      />
      {/* Back panel with ventilation slots: build as top + bottom bands + posts
          between, leaving a row of gaps in the middle for airflow. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, height - 0.06, -halfD + t / 2]}
        material={wood}
        args={[width, 0.09, t]}
      />
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, 0.08, -halfD + t / 2]}
        material={wood}
        args={[width, 0.14, t]}
      />
      {/* Vent bars dividing the middle band into slots. */}
      {Array.from({ length: 6 }).map((_, i) => {
        const gap = (width - 0.06) / 6
        const x = -width / 2 + 0.03 + gap * (i + 0.5)
        return (
          <BeveledBox
            key={i}
            castShadow
            position={[x, height * 0.5, -halfD + t / 2]}
            material={wood}
            args={[0.025, height - 0.24, t]}
          />
        )
      })}
      {/* Non-entry side: full panel. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[-sideSign * (halfW - t / 2), midY, 0]}
        material={wood}
        args={[t, height, depth]}
      />
      {/* Entry side: a panel with a round hole (a ring annulus stands in for
          the panel-with-a-hole). */}
      <mesh
        position={[sideSign * (halfW - t / 2), midY, 0]}
        rotation={[0, sideSign * (Math.PI / 2), 0]}
        material={wood}
      >
        <ringGeometry args={[holeR, Math.min(height, depth) * 0.52, 24]} />
      </mesh>
      {/* Front door panel (a flat inset door with a small pull). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, midY, halfD - t / 2]}
        material={wood}
        args={[width - 0.02, height - 0.02, t]}
      />
      <mesh castShadow position={[halfW - 0.09, midY, halfD]}>
        <sphereGeometry args={[0.014, 10, 10]} />
        <MetalMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  )
}
