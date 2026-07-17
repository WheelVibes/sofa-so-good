import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { applianceBodyMaterial, readNum, readStr } from './shared'

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
  const body = applianceBodyMaterial(color, finish)
  const steel = { color: '#9a9ea3', roughness: 0.3, metalness: 0.75 } as const
  // Chrome wire shelves read through the glass; dark grey shelves vanished
  // against the dark interior, so the cooler looked like a plain black box.
  const wire = { color: '#c4c8cc', roughness: 0.3, metalness: 0.7 } as const
  const shelves = Math.max(3, Math.round(h / 0.13))
  // A couple of resting bottles per shelf (seeded by index, deterministic) —
  // the hero detail that reads the appliance as a wine cooler, not a cabinet.
  const bottleTints = ['#3a5a3a', '#5a2a2a', '#2f3f2f', '#4a2438']

  // Open-front shell (back + 4 sides, NO front panel) so the lit interior +
  // bottles are actually visible through the glass door. A solid carcass box
  // (the old build) occluded the whole interior behind its opaque front face,
  // so the cooler read as a plain black cabinet.
  const t = 0.02
  const shell: { pos: [number, number, number]; args: [number, number, number] }[] = [
    { pos: [0, h / 2, -d / 2 + t / 2], args: [w, h, t] }, // back
    { pos: [-w / 2 + t / 2, h / 2, 0], args: [t, h, d] }, // left
    { pos: [w / 2 - t / 2, h / 2, 0], args: [t, h, d] }, // right
    { pos: [0, h - t / 2, 0], args: [w, t, d] }, // top
    { pos: [0, t / 2, 0], args: [w, t, d] }, // bottom
  ]

  return (
    <group>
      {/* Carcass shell (open front) */}
      {shell.map((p, i) => (
        <BeveledBox
          key={i}
          material={body}
          castShadow
          receiveShadow
          position={p.pos}
          args={p.args}
          bevel={0.008}
        />
      ))}
      {/* Interior back panel with a cool LED glow — bright enough to read
          through the tinted glass at room + daylight range. */}
      <mesh position={[0, h / 2, -d / 2 + 0.03]}>
        <boxGeometry args={[w - 0.06, h - 0.1, 0.005]} />
        <meshStandardMaterial
          color="#33505f"
          emissive="#6fa6c2"
          emissiveIntensity={1.8}
          roughness={0.6}
          toneMapped={false}
        />
      </mesh>
      {/* Wire shelves + resting bottles */}
      {Array.from({ length: shelves }, (_, i) => {
        const y = 0.08 + ((h - 0.16) * (i + 1)) / (shelves + 1)
        return (
          <group key={i}>
            <mesh position={[0, y, -0.02]}>
              <boxGeometry args={[w - 0.08, 0.008, d - 0.12]} />
              <meshStandardMaterial {...wire} />
            </mesh>
            {/* Bottles lying on the shelf (long axis along X), a couple per row */}
            {Array.from({ length: 2 }, (_, b) => {
              const bx = (b === 0 ? -1 : 1) * (w * 0.16)
              return (
                <mesh
                  key={b}
                  position={[bx, y + 0.035, -0.02]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.033, 0.033, Math.min(w * 0.34, 0.28), 12]} />
                  <meshStandardMaterial
                    color={bottleTints[(i * 2 + b) % bottleTints.length]}
                    roughness={0.25}
                    metalness={0.1}
                  />
                </mesh>
              )
            })}
          </group>
        )
      })}
      {/* Tinted glass door — lighter tint + a touch more transparent so the lit
          interior + bottles read through it. */}
      <mesh position={[0, h / 2, d / 2 + 0.006]}>
        <boxGeometry args={[w - 0.04, h - 0.06, 0.01]} />
        <meshStandardMaterial
          color="#2a3f4a"
          roughness={0.06}
          metalness={0.2}
          transparent
          opacity={0.26}
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
