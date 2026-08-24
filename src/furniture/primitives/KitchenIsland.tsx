import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Freestanding kitchen island — a base cabinet with a stone worktop that
 * overhangs one long side (+Z) as a breakfast bar (knee space for stools),
 * cabinet fronts on the other side. Optional sink or hob inset. Faces +Z
 * (the seating/overhang side). Floor-anchored, centred, real-world metres.
 */
export function KitchenIsland({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 1.6) // along X
  const depth = readNum(props, 'depth', 0.95) // along Z (incl. overhang)
  const color = readStr(props, 'color', '#3a4754')
  const worktopColor = readStr(props, 'worktopColor', '#2c2f34')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0.1)
  const top = readStr(props, 'top', 'plain') // plain / sink / hob
  const worktopFinish = readStr(props, 'worktopFinish', 'marble')

  const cabinetH = 0.85
  const topT = 0.05
  const overhang = 0.28
  const cabDepth = depth - overhang
  const cabMat = getSurfaceMaterial(finish, color, 1.2, sheen)
  const stone = getSurfaceMaterial(worktopFinish, worktopColor, 1.4, 0.55)
  const handle = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const
  // Faucet spout routes through the shared brushed-metal material (bright
  // stainless); the small cabinet door pull keeps its plain hardware props.
  const metal = metalLeg('#cfd2d6', 'stainless')

  // Cabinet sits toward −Z; worktop spans the full depth (overhangs +Z).
  const cabCz = -overhang / 2
  const cabs = Math.max(1, Math.round(length / 0.6))
  const gap = 0.012
  const cabW = (length - gap * (cabs + 1)) / cabs

  return (
    <group>
      {/* Base cabinet */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, cabinetH / 2, cabCz]}
        material={cabMat}
        args={[length, cabinetH, cabDepth]}
      />
      {/* Cabinet door fronts on the −Z face */}
      {Array.from({ length: cabs }, (_, i) => {
        const x = -length / 2 + gap + cabW / 2 + i * (cabW + gap)
        return (
          <group key={i}>
            <BeveledBox
              position={[x, cabinetH / 2, cabCz - cabDepth / 2 - 0.003]}
              material={cabMat}
              args={[cabW, cabinetH - 0.06, 0.02]}
            />
            <mesh position={[x, cabinetH - 0.14, cabCz - cabDepth / 2 - 0.02]}>
              <boxGeometry args={[Math.min(cabW * 0.4, 0.16), 0.016, 0.016]} />
              <MetalMaterial {...handle} />
            </mesh>
          </group>
        )
      })}
      {/* Worktop (overhangs +Z). With a sink it's built as a frame around the
          basin cutout so the basin is genuinely recessed (no solid box poking
          through the slab). */}
      {(() => {
        const topY = cabinetH + topT / 2
        const worktopW = length + 0.04
        const ow = 0.5 // sink cutout width (X)
        const od = 0.36 // sink cutout depth (Z)
        const sz = cabCz // basin centred over the cabinet run
        const slab = (key: string, x: number, z: number, wx: number, dz: number) => (
          <BeveledBox
            key={key}
            castShadow
            receiveShadow
            position={[x, topY, z]}
            material={stone}
            args={[wx, topT, dz]}
          />
        )
        if (top !== 'sink') {
          return slab('full', 0, 0, worktopW, depth)
        }
        const sideW = worktopW / 2 - ow / 2
        const backD = sz - od / 2 - -depth / 2 // from -depth/2 to sz-od/2
        const frontD = depth / 2 - (sz + od / 2)
        return (
          <group>
            {slab('l', -(worktopW / 2 + ow / 2) / 2, 0, sideW, depth)}
            {slab('r', (worktopW / 2 + ow / 2) / 2, 0, sideW, depth)}
            {backD > 0.004 && slab('b', 0, (-depth / 2 + (sz - od / 2)) / 2, ow, backD)}
            {frontD > 0.004 && slab('f', 0, (sz + od / 2 + depth / 2) / 2, ow, frontD)}
          </group>
        )
      })()}

      {/* Recessed sink basin + curved-spout faucet */}
      {top === 'sink' &&
        (() => {
          // Recessed stainless basin: rim just below the worktop surface, walls
          // dropping into the cabinet cavity, so no face is coplanar with the top.
          const steel = { color: '#b7bdc2', roughness: 0.25, metalness: 0.8 } as const
          const sz = cabCz
          const od = 0.36 // matches the worktop cutout depth
          const surfaceY = cabinetH + topT
          const bw = 0.46
          const bd = 0.32
          const wallT = 0.02
          const rimY = surfaceY - 0.008
          const floorY = cabinetH - 0.15 // basin drops into the cabinet
          const wallH = rimY - floorY
          const wallCY = floorY + wallH / 2
          const walls: [number, number, number, number][] = [
            [-bw / 2 + wallT / 2, 0, wallT, bd],
            [bw / 2 - wallT / 2, 0, wallT, bd],
            [0, -bd / 2 + wallT / 2, bw, wallT],
            [0, bd / 2 - wallT / 2, bw, wallT],
          ]
          return (
            <group>
              {/* Bowl floor */}
              <mesh receiveShadow position={[0, floorY, sz]}>
                <boxGeometry args={[bw - wallT * 2, 0.016, bd - wallT * 2]} />
                <MetalMaterial {...steel} />
              </mesh>
              {/* Bowl walls */}
              {walls.map(([dx, dz, wx, dd], k) => (
                <mesh key={k} receiveShadow position={[dx, wallCY, sz + dz]}>
                  <boxGeometry args={[wx, wallH, dd]} />
                  <MetalMaterial {...steel} />
                </mesh>
              ))}
              {/* Faucet: base + riser + curved spout (behind the basin) */}
              <mesh castShadow position={[0, surfaceY + 0.02, sz - od / 2 - 0.02]} material={metal}>
                <cylinderGeometry args={[0.03, 0.035, 0.04, 12]} />
              </mesh>
              <mesh castShadow position={[0, surfaceY + 0.15, sz - od / 2 - 0.02]} material={metal}>
                <cylinderGeometry args={[0.014, 0.014, 0.26, 10]} />
              </mesh>
              <mesh
                castShadow
                position={[0, surfaceY + 0.27, sz - od / 2 + 0.05]}
                rotation={[Math.PI / 2.2, 0, 0]}
                material={metal}
              >
                <cylinderGeometry args={[0.013, 0.013, 0.18, 10]} />
              </mesh>
            </group>
          )
        })()}
      {top === 'hob' &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}.${sz}`}
              position={[sx * 0.16, cabinetH + topT + 0.005, cabCz + sz * 0.13]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[0.08, 20]} />
              <meshStandardMaterial color="#1c1c1e" roughness={0.4} metalness={0.3} />
            </mesh>
          )),
        )}
    </group>
  )
}
