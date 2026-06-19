import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import {
  ApplianceBodyMaterial,
  applianceBody,
  applianceBodyMeshProps,
  readNum,
  readStr,
} from './shared'

/**
 * Wine / beverage cooler: a slim under-counter (or freestanding) appliance with a
 * full tinted-glass door, horizontal wire shelves visible behind it, a vertical
 * bar handle, and a faint interior LED glow. Faces +Z. Width is adjustable for
 * slim (30 cm) to double (60 cm) units.
 */
export function WineCooler({ props }: { props: ParamProps }) {
  const w = readNum(props, 'width', 0.45)
  const color = readStr(props, 'color', '#2c2f33')
  const finish = readStr(props, 'finish', 'steel')
  const d = 0.58
  const h = 0.82
  const body = applianceBody(color, finish)
  const steel = { color: '#9a9ea3', roughness: 0.3, metalness: 0.75 } as const
  const shelves = Math.max(3, Math.round(h / 0.13))

  return (
    <group>
      {/* Carcass */}
      <BeveledBox
        {...applianceBodyMeshProps(body)}
        castShadow
        receiveShadow
        position={[0, h / 2, 0]}
        args={[w, h, d]}
        bevel={0.012}
      >
        <ApplianceBodyMaterial finish={body} />
      </BeveledBox>
      {/* Interior back panel with a faint cool LED glow */}
      <mesh position={[0, h / 2, -d / 2 + 0.03]}>
        <boxGeometry args={[w - 0.06, h - 0.1, 0.005]} />
        <meshStandardMaterial
          color="#22323d"
          emissive="#3f6f88"
          emissiveIntensity={1.1}
          roughness={0.6}
        />
      </mesh>
      {/* Wire shelves (bottles rest on these) */}
      {Array.from({ length: shelves }, (_, i) => {
        const y = 0.08 + ((h - 0.16) * (i + 1)) / (shelves + 1)
        return (
          <mesh key={i} position={[0, y, -0.02]}>
            <boxGeometry args={[w - 0.08, 0.01, d - 0.12]} />
            <meshStandardMaterial color="#3a3d42" roughness={0.5} metalness={0.4} />
          </mesh>
        )
      })}
      {/* Tinted glass door */}
      <mesh position={[0, h / 2, d / 2 + 0.006]}>
        <boxGeometry args={[w - 0.04, h - 0.06, 0.01]} />
        <meshStandardMaterial
          color="#1b2a33"
          roughness={0.08}
          metalness={0.2}
          transparent
          opacity={0.38}
        />
      </mesh>
      {/* Vertical bar handle on the right edge */}
      <mesh castShadow position={[w / 2 - 0.05, h / 2, d / 2 + 0.02]}>
        <boxGeometry args={[0.02, h * 0.5, 0.022]} />
        <meshStandardMaterial {...steel} />
      </mesh>
    </group>
  )
}
