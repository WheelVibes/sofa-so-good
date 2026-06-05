import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

interface KitchenCounterProps {
  props: ParamProps
}

/**
 * Kitchen counter primitive: base cabinet + countertop. When `hasSink`
 * is on, a recessed plane stands in for a sink basin and a small
 * cylinder for a faucet. The counter extends along +X (`length`) and
 * has a fixed depth of 0.6 m.
 */
export function KitchenCounter({ props }: KitchenCounterProps) {
  const length = readNum(props, 'length', 2.4)
  const hasSink = readStr(props, 'hasSink', 'no') === 'yes'
  const color = readStr(props, 'color', '#e3dfd6')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const frontStyle = readStr(props, 'frontStyle', 'slab')
  const worktopColor = readStr(props, 'worktopColor', '#34373d')

  const depth = 0.6
  const cabinetH = 0.85
  const topThickness = 0.05
  const totalH = cabinetH + topThickness
  const cabMat = getSurfaceMaterial(finish, color, 1, sheen)
  const handleMat = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const

  // Cabinet fronts along the base run.
  const cabs = Math.max(1, Math.round(length / 0.6))
  const cabGap = 0.012
  const cabW = (length - cabGap * (cabs + 1)) / cabs
  const frontH = cabinetH - 0.06

  const renderFront = (x: number, i: number) => {
    if (frontStyle === 'drawers') {
      // Three stacked drawer fronts with horizontal bar pulls.
      const rows = 3
      const dh = (frontH - 0.02 * (rows - 1)) / rows
      return (
        <group key={i}>
          {Array.from({ length: rows }, (_, r) => {
            const y = 0.03 + dh / 2 + r * (dh + 0.02)
            return (
              <group key={r}>
                <mesh position={[x, y, depth / 2 - 0.005]} material={cabMat}>
                  <boxGeometry args={[cabW, dh, 0.016]} />
                </mesh>
                <mesh position={[x, y, depth / 2 + 0.01]}>
                  <boxGeometry args={[cabW * 0.4, 0.016, 0.018]} />
                  <meshStandardMaterial {...handleMat} />
                </mesh>
              </group>
            )
          })}
        </group>
      )
    }
    return (
      <group key={i}>
        <mesh position={[x, cabinetH / 2, depth / 2 - 0.005]} material={cabMat}>
          <boxGeometry args={[cabW, frontH, 0.016]} />
        </mesh>
        {/* Shaker rails: a recessed panel framed by four thin proud borders */}
        {frontStyle === 'shaker' &&
          [
            [0, frontH / 2 - 0.05, cabW - 0.08, 0.05],
            [0, -frontH / 2 + 0.05, cabW - 0.08, 0.05],
            [-cabW / 2 + 0.04, 0, 0.05, frontH - 0.16],
            [cabW / 2 - 0.04, 0, 0.05, frontH - 0.16],
          ].map(([dx, dy, bw, bh], k) => (
            <mesh
              key={k}
              position={[x + dx, cabinetH / 2 + dy, depth / 2 + 0.004]}
              material={cabMat}
            >
              <boxGeometry args={[bw, bh, 0.01]} />
            </mesh>
          ))}
        <mesh
          position={[x + (i % 2 ? -1 : 1) * (cabW / 2 - 0.04), cabinetH - 0.12, depth / 2 + 0.01]}
        >
          <boxGeometry args={[0.018, 0.12, 0.018]} />
          <meshStandardMaterial {...handleMat} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Base cabinet */}
      <mesh castShadow receiveShadow position={[0, cabinetH / 2, 0]} material={cabMat}>
        <boxGeometry args={[length, cabinetH, depth]} />
      </mesh>
      {/* Cabinet fronts (slab / shaker / drawers) */}
      {Array.from({ length: cabs }, (_, i) => {
        const x = -length / 2 + cabGap + cabW / 2 + i * (cabW + cabGap)
        return renderFront(x, i)
      })}
      {/* Sink cutout geometry (shared by the countertop frame + the basin). */}
      {(() => {
        // Computed up here so the countertop can be built as a frame around the
        // opening when a sink is present.
        const ow = 0.54 // cutout width
        const od = 0.4 // cutout depth
        const sx = Math.min(
          Math.max(length * 0.25, -length / 2 + ow / 2 + 0.05),
          length / 2 - ow / 2 - 0.05,
        )
        const topY = cabinetH + topThickness / 2
        const topMat = (
          <meshStandardMaterial color={worktopColor} roughness={0.22} metalness={0.15} />
        )
        const topMesh = (key: string, x: number, z: number, w: number, d: number) => (
          <mesh key={key} castShadow receiveShadow position={[x, topY, z]}>
            <boxGeometry args={[w, topThickness, d]} />
            {topMat}
          </mesh>
        )

        // Worktop: a single slab, or a frame around the sink cutout.
        const leftW = sx - ow / 2 + length / 2
        const rightW = length / 2 - (sx + ow / 2)
        const railD = (depth - od) / 2
        const worktop = !hasSink ? (
          <mesh castShadow receiveShadow position={[0, topY, 0]}>
            <boxGeometry args={[length, topThickness, depth]} />
            {topMat}
          </mesh>
        ) : (
          <group>
            {leftW > 0.002 && topMesh('l', -length / 2 + leftW / 2, 0, leftW, depth)}
            {rightW > 0.002 && topMesh('r', length / 2 - rightW / 2, 0, rightW, depth)}
            {topMesh('b', sx, -depth / 2 + railD / 2, ow, railD)}
            {topMesh('f', sx, depth / 2 - railD / 2, ow, railD)}
          </group>
        )

        // Open-topped stainless basin recessed into the cutout. The rim sits
        // just below the worktop surface and the bowl outer walls are inset
        // from the cutout edges, so no face is coplanar with the worktop (the
        // old basin was a solid box whose top face sat exactly on the worktop
        // surface → z-fighting + it read as a grey block, not a sink).
        const steel = { color: '#b7bdc2', roughness: 0.25, metalness: 0.8 } as const
        const bw = 0.52
        const bd = 0.38
        const wallT = 0.02
        const rimY = totalH - 0.008
        const floorY = cabinetH + 0.02 // bowl floor just above the cabinet top
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
            {worktop}
            {/* Tiled backsplash up the wall behind the run (countertop → uppers). */}
            <mesh receiveShadow position={[0, totalH + 0.24, -depth / 2 + 0.012]}>
              <boxGeometry args={[length, 0.48, 0.015]} />
              <meshStandardMaterial color="#e4e7e3" roughness={0.3} metalness={0.05} />
            </mesh>
            {hasSink && (
              <group>
                {/* Bowl floor */}
                <mesh receiveShadow position={[sx, floorY, 0]}>
                  <boxGeometry args={[bw - wallT * 2, 0.016, bd - wallT * 2]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
                {/* Bowl walls */}
                {walls.map(([dx, dz, w, d], k) => (
                  <mesh key={k} receiveShadow position={[sx + dx, wallCY, dz]}>
                    <boxGeometry args={[w, wallH, d]} />
                    <meshStandardMaterial {...steel} />
                  </mesh>
                ))}
                {/* Faucet base + riser + curved spout */}
                <mesh castShadow position={[sx, totalH + 0.02, -0.15]}>
                  <cylinderGeometry args={[0.03, 0.035, 0.04, 12]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
                <mesh castShadow position={[sx, totalH + 0.15, -0.15]}>
                  <cylinderGeometry args={[0.014, 0.014, 0.26, 10]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
                <mesh
                  castShadow
                  position={[sx, totalH + 0.27, -0.08]}
                  rotation={[Math.PI / 2.2, 0, 0]}
                >
                  <cylinderGeometry args={[0.013, 0.013, 0.18, 10]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
              </group>
            )}
          </group>
        )
      })()}
    </group>
  )
}
