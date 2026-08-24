import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { metalLeg, readNum, readStr } from './shared'

interface DeskProps {
  props: ParamProps
}

/**
 * Desk primitive. `legStyle` chooses the support: 'panel' (a side leg-plate
 * + a pedestal drawer block, the existing office desk), 'legs' (four square
 * wooden legs, a clean writing desk), or 'hairpin' (slim splayed metal
 * hairpin legs, mid-century). Faces +Z (a person seated looks toward -Z).
 */
export function Desk({ props }: DeskProps) {
  const width = readNum(props, 'width', 1.4)
  const depth = readNum(props, 'depth', 0.6)
  const color = readStr(props, 'color', '#d5c2a3')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const legStyle = readStr(props, 'legStyle', 'panel')
  const style = readStr(props, 'style', 'standard')
  const gaming = style === 'gaming'

  const height = 0.74
  const topThickness = 0.04
  const legThickness = 0.04
  const drawerW = 0.34
  const drawerH = 0.36
  const legY = height - topThickness

  const wood = getSurfaceMaterial(finish, color, 1.5, sheen)
  // Mid-century hairpin legs route through the shared brushed-metal material
  // (matte black-steel grain).
  const metal = metalLeg('#2c2e30', 'black-steel')
  const inset = 0.07
  const corners: [number, number][] = [
    [-width / 2 + inset, -depth / 2 + inset],
    [width / 2 - inset, -depth / 2 + inset],
    [-width / 2 + inset, depth / 2 - inset],
    [width / 2 - inset, depth / 2 - inset],
  ]

  return (
    <group>
      {/* Top */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, height - topThickness / 2, 0]}
        material={wood}
        args={[width, topThickness, depth]}
      />

      {gaming && (
        <>
          {/* Two black-steel side frames: front + back post joined by a foot
              rail, reaching the floor and meeting the desktop underside. */}
          {[-1, 1].map((sx) => {
            const x = sx * (width / 2 - 0.035)
            const posts = [depth / 2 - 0.05, -depth / 2 + 0.05]
            return (
              <group key={`frame${sx}`}>
                {posts.map((z, i) => (
                  <mesh key={i} castShadow position={[x, legY / 2, z]} material={metal}>
                    <boxGeometry args={[0.04, legY, 0.05]} />
                  </mesh>
                ))}
                {/* Foot rail (front↔back) */}
                <mesh castShadow position={[x, 0.025, 0]} material={metal}>
                  <boxGeometry args={[0.05, 0.05, depth - 0.06]} />
                </mesh>
                {/* Top rail under the desktop tying the posts */}
                <mesh castShadow position={[x, legY - 0.03, 0]} material={metal}>
                  <boxGeometry args={[0.045, 0.05, depth - 0.06]} />
                </mesh>
              </group>
            )
          })}
          {/* Rear cross stretcher tying the two side frames together */}
          <mesh castShadow position={[0, 0.16, -depth / 2 + 0.06]} material={metal}>
            <boxGeometry args={[width - 0.1, 0.04, 0.04]} />
          </mesh>
          {/* Cable-management tray slung under the rear edge, between the side
              frames (its ends meet the back posts). Open-topped channel. */}
          <group>
            <mesh castShadow position={[0, legY - 0.11, -depth / 2 + 0.07]} material={metal}>
              <boxGeometry args={[width - 0.08, 0.015, 0.09]} />
            </mesh>
            <mesh castShadow position={[0, legY - 0.08, -depth / 2 + 0.115]} material={metal}>
              <boxGeometry args={[width - 0.08, 0.06, 0.012]} />
            </mesh>
          </group>
          {/* Monitor riser shelf: a plank on two end blocks resting on the desk
              top, set toward the back. */}
          {(() => {
            const riserW = Math.min(width * 0.55, 0.8)
            const riserD = 0.24
            const riserZ = -depth / 2 + riserD / 2 + 0.04
            const blockH = 0.09
            const shelfY = height + blockH
            return (
              <group>
                {[-1, 1].map((sx) => (
                  <BeveledBox
                    key={sx}
                    castShadow
                    position={[sx * (riserW / 2 - 0.05), height + blockH / 2, riserZ]}
                    material={wood}
                    args={[0.05, blockH, riserD]}
                  />
                ))}
                <BeveledBox
                  castShadow
                  receiveShadow
                  position={[0, shelfY + 0.01, riserZ]}
                  material={wood}
                  args={[riserW, 0.02, riserD]}
                />
              </group>
            )
          })()}
        </>
      )}

      {!gaming && legStyle === 'panel' && (
        <>
          {/* Left leg plate */}
          <BeveledBox
            castShadow
            position={[-width / 2 + legThickness / 2, (height - topThickness) / 2, 0]}
            material={wood}
            args={[legThickness, height - topThickness, depth - 0.04]}
          />
          {/* Right drawer block */}
          <BeveledBox
            castShadow
            position={[width / 2 - drawerW / 2, height - topThickness - drawerH / 2, 0]}
            material={wood}
            args={[drawerW, drawerH, depth - 0.06]}
          />
          {/* Drawer knob */}
          <mesh
            castShadow
            position={[
              width / 2 - drawerW / 2,
              height - topThickness - drawerH * 0.32,
              depth / 2 - 0.02,
            ]}
          >
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <MetalMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
          </mesh>
        </>
      )}

      {!gaming &&
        legStyle === 'legs' &&
        corners.map(([x, z], i) => (
          <BeveledBox
            key={i}
            castShadow
            position={[x, legY / 2, z]}
            material={wood}
            args={[legThickness, legY, legThickness]}
          />
        ))}

      {!gaming &&
        legStyle === 'hairpin' &&
        corners.map(([x, z], i) => {
          // Two slim rods splaying apart toward the floor — a hairpin leg.
          const splay = 0.09
          return [-1, 1].map((s) => {
            const dz = s * splay * Math.sign(z || 1)
            const legH = Math.hypot(legY, splay)
            const lean = Math.atan2(splay, legY)
            return (
              <mesh
                key={`${i}.${s}`}
                castShadow
                position={[x, legY / 2, z - dz / 2]}
                rotation={[s * lean * Math.sign(z || 1), 0, 0]}
                material={metal}
              >
                <cylinderGeometry args={[0.008, 0.008, legH, 8]} />
              </mesh>
            )
          })
        })}
    </group>
  )
}
