import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/** Slim entryway shoe cabinet — a near-universal fixture by the front door
 *  of a Singapore HDB flat. Shallow body with tilt-open flip fronts and slim
 *  recessed handle reveals, on a low plinth. Faces +Z. */
export function ShoeCabinet({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const depth = readNum(props, 'depth', 0.32)
  const tiers = Math.max(2, Math.round(readNum(props, 'tiers', 3)))
  const bodyColor = readStr(props, 'color', '#9a8a72')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'closed')
  const open = style === 'open'

  const plinthH = 0.06
  const bodyH = 0.94
  const topThk = 0.025
  const wood = getSurfaceMaterial(finish, bodyColor, 1.4, sheen)

  const gap = 0.015
  const frontsH = bodyH - topThk
  const fh = (frontsH - gap * (tiers + 1)) / tiers

  return (
    <group>
      {/* Carcass — solid for closed; an open rack shows a recessed back */}
      {open ? (
        <>
          {/* Back panel + two sides + bottom, leaving the front open */}
          <mesh
            receiveShadow
            position={[0, plinthH + bodyH / 2, -depth / 2 + 0.012]}
            material={wood}
          >
            <boxGeometry args={[width, bodyH, 0.024]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              castShadow
              position={[s * (width / 2 - 0.012), plinthH + bodyH / 2, 0]}
              material={wood}
            >
              <boxGeometry args={[0.024, bodyH, depth]} />
            </mesh>
          ))}
          {/* Angled shoe shelves (tilt back so shoes are visible) */}
          {Array.from({ length: tiers }, (_, i) => {
            const y = plinthH + gap + fh / 2 + i * (fh + gap)
            return (
              <mesh
                key={i}
                castShadow
                receiveShadow
                position={[0, y, 0]}
                rotation={[-0.22, 0, 0]}
                material={wood}
              >
                <boxGeometry args={[width - 0.05, 0.018, depth - 0.04]} />
              </mesh>
            )
          })}
        </>
      ) : (
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, plinthH + bodyH / 2, 0]}
          material={wood}
          args={[width, bodyH, depth]}
        />
      )}
      {/* Top surface lip (slightly proud, for keys / a tray) */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, plinthH + bodyH + topThk / 2, 0]}
        material={wood}
        args={[width + 0.02, topThk, depth + 0.02]}
      />
      {/* Flip fronts (closed style only) with a slim shadow-gap handle reveal */}
      {!open &&
        Array.from({ length: tiers }, (_, i) => {
          const y = plinthH + gap + fh / 2 + i * (fh + gap)
          return (
            <group key={i}>
              <BeveledBox
                castShadow
                position={[0, y, depth / 2 + 0.004]}
                material={wood}
                args={[width - 0.03, fh - 0.006, 0.02]}
              />
              {/* recessed finger pull at the top of each front */}
              <mesh position={[0, y + fh / 2 - 0.018, depth / 2 + 0.006]}>
                <boxGeometry args={[width * 0.5, 0.012, 0.012]} />
                <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.4} />
              </mesh>
            </group>
          )
        })}
      {/* Recessed plinth */}
      <mesh castShadow position={[0, plinthH / 2, -0.01]}>
        <boxGeometry args={[width - 0.04, plinthH, depth - 0.04]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  )
}
