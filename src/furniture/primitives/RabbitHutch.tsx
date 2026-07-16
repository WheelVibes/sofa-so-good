import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Rabbit hutch (parametric) — a raised two-zone hutch (default 135×60×90 cm): an
 * enclosed timber sleeping box with a pitched roof on one side, an open wire run
 * on the other, all lifted on four legs. Reads clearly as "solid box + wire cage"
 * from any angle. Wood carcass + wire bars. `width`/`depth`/`height` clamp to
 * sensible hutch dims. Floor-anchored, footprint-centred, faces +Z. Real metres;
 * legs reach the floor, the frame ties the zones together.
 */
export function RabbitHutch({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.35)
  const depth = readNum(props, 'depth', 0.6)
  const height = readNum(props, 'height', 0.9)
  const woodColor = readStr(props, 'color', '#9d7c54')
  const finish = readStr(props, 'finish', 'wood')
  const wireColor = readStr(props, 'wireColor', '#5b6068')

  const wood = getSurfaceMaterial(finish, woodColor, 1.2)
  const wire = metalLeg(wireColor, 'satin')
  const t = 0.02
  const halfW = width / 2
  const halfD = depth / 2

  const legH = Math.min(0.24, height * 0.28)
  const bodyH = height - legH
  const floorY = legH
  // Split: sleeping box on the left (−X) ~42%, wire run on the right.
  const boxW = width * 0.42
  const runW = width - boxW
  const boxCx = -halfW + boxW / 2
  const runCx = halfW - runW / 2
  const roofH = 0.1
  const barT = 0.008

  // Vertical run bars spread across a length.
  const spread = (length: number, pitch = 0.055) => {
    const n = Math.max(3, Math.round(length / pitch))
    return Array.from({ length: n + 1 }, (_, i) => -length / 2 + (length * i) / n)
  }

  return (
    <group>
      {/* ---- Legs ---- */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <BeveledBox
            key={`leg${sx}${sz}`}
            castShadow
            position={[sx * (halfW - t), legH / 2, sz * (halfD - t)]}
            material={wood}
            args={[0.04, legH, 0.04]}
          />
        )),
      )}
      {/* ---- Shared floor pan ---- */}
      <BeveledBox
        receiveShadow
        castShadow
        position={[0, floorY + t / 2, 0]}
        material={wood}
        args={[width, t, depth]}
      />

      {/* ---- Enclosed sleeping box (solid walls) ---- */}
      {/* Back + left end + a front panel with a doorway (front left corner). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[boxCx, floorY + bodyH / 2, -halfD + t / 2]}
        material={wood}
        args={[boxW, bodyH, t]}
      />
      <BeveledBox
        castShadow
        receiveShadow
        position={[-halfW + t / 2, floorY + bodyH / 2, 0]}
        material={wood}
        args={[t, bodyH, depth]}
      />
      {/* Divider between the box and the run. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[boxCx + boxW / 2, floorY + bodyH / 2, 0]}
        material={wood}
        args={[t, bodyH, depth]}
      />
      {/* Front panel of the box with a lower entry gap (upper band only). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[boxCx, floorY + bodyH - bodyH * 0.28, halfD - t / 2]}
        material={wood}
        args={[boxW, bodyH * 0.44, t]}
      />
      {/* Box top / ceiling. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[boxCx, floorY + bodyH, 0]}
        material={wood}
        args={[boxW, t, depth]}
      />

      {/* ---- Wire run zone ---- */}
      {/* Corner posts. */}
      {[
        [runCx - runW / 2 + t, -halfD + t],
        [runCx - runW / 2 + t, halfD - t],
        [halfW - t, -halfD + t],
        [halfW - t, halfD - t],
      ].map(([x, z], i) => (
        <mesh key={`rp${i}`} castShadow position={[x, floorY + bodyH / 2, z]} material={wire}>
          <cylinderGeometry args={[barT / 2, barT / 2, bodyH, 6]} />
        </mesh>
      ))}
      {/* Top perimeter rails of the run. */}
      {[-1, 1].map((sz) => (
        <mesh
          key={`runrail${sz}`}
          position={[runCx, floorY + bodyH, sz * (halfD - t)]}
          rotation={[0, 0, Math.PI / 2]}
          material={wire}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, runW, 6]} />
        </mesh>
      ))}
      {/* Front + back + right-end vertical bars. */}
      {spread(runW - 2 * t).map((x, i) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`runv${i}-${sz}`}
            castShadow
            position={[runCx + x, floorY + bodyH / 2, sz * (halfD - t)]}
            material={wire}
          >
            <cylinderGeometry args={[barT / 2, barT / 2, bodyH, 5]} />
          </mesh>
        )),
      )}
      {spread(depth - 2 * t).map((z, i) => (
        <mesh
          key={`rune${i}`}
          castShadow
          position={[halfW - t, floorY + bodyH / 2, z]}
          material={wire}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, bodyH, 5]} />
        </mesh>
      ))}
      {/* Wire roof bars over the run. */}
      {spread(runW - 2 * t).map((x, i) => (
        <mesh
          key={`runroof${i}`}
          position={[runCx + x, floorY + bodyH, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={wire}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, depth - 2 * t, 5]} />
        </mesh>
      ))}

      {/* ---- Pitched roof over the sleeping box ---- */}
      {[-1, 1].map((sz) => (
        <BeveledBox
          key={`roof${sz}`}
          castShadow
          receiveShadow
          position={[boxCx, floorY + bodyH + roofH / 2, sz * depth * 0.24]}
          rotation={[sz * 0.5, 0, 0]}
          material={wood}
          args={[boxW + 0.06, t, depth * 0.62]}
        />
      ))}
    </group>
  )
}
