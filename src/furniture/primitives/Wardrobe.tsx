import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

interface WardrobeProps {
  props: ParamProps
}

/**
 * Wardrobe primitive: tall cabinet body + N inset door panels along the
 * front face. Doors are decorative (no animation) — the spec leaves
 * cabinet doors out of the door system, which only covers room doors.
 */
export function Wardrobe({ props }: WardrobeProps) {
  const width = readNum(props, 'width', 1.5)
  const doorCount = Math.max(2, Math.min(4, Math.round(readNum(props, 'doorCount', 3))))
  const color = readStr(props, 'color', '#caa478')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const doorStyle = readStr(props, 'doorStyle', 'hinged')

  const depth = 0.6
  const height = 2.1
  const doorInset = 0.02
  const doorGap = 0.01
  const doorPanelH = height - 0.1
  const doorPanelW = (width - doorGap * (doorCount + 1) - 0.02) / doorCount

  const wood = getSurfaceMaterial(finish, color, 2, sheen)
  const frameMetal = { color: '#b8bcc0', roughness: 0.35, metalness: 0.75 } as const
  const open = doorStyle === 'open'

  // Open wardrobe: an exposed carcass (no doors) with a hanging rail + a few
  // garments on one side and stacked shelves on the other — useful for
  // visualising storage in an interior-design layout.
  const interior = (() => {
    if (!open) return null
    const t = 0.02
    const innerW = width - t * 2
    const railY = height - 0.32
    const clothesColors = ['#6b4f6b', '#3b5a7d', '#9c5a3c', '#3f6b3a', '#7d3b3b', '#4a4f56']
    return (
      <group>
        {/* Carcass: back + two sides + top + bottom + a central divider */}
        <mesh receiveShadow position={[0, height / 2, -depth / 2 + t / 2]} material={wood}>
          <boxGeometry args={[width, height, t]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            castShadow
            position={[s * (width / 2 - t / 2), height / 2, 0]}
            material={wood}
          >
            <boxGeometry args={[t, height, depth]} />
          </mesh>
        ))}
        {[t / 2, height - t / 2].map((y, i) => (
          <mesh key={i} castShadow receiveShadow position={[0, y, 0]} material={wood}>
            <boxGeometry args={[width, t, depth]} />
          </mesh>
        ))}
        <mesh castShadow position={[0, height / 2, 0]} material={wood}>
          <boxGeometry args={[t, height, depth]} />
        </mesh>
        {/* Left bay: hanging rail + garments */}
        <mesh position={[-innerW / 4, railY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, innerW / 2 - 0.06, 10]} />
          <meshStandardMaterial color="#9aa0a6" roughness={0.3} metalness={0.7} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const x = -innerW / 2 + 0.1 + i * ((innerW / 2 - 0.16) / 5)
          const h = 0.7 + (i % 3) * 0.08
          return (
            <mesh key={i} castShadow position={[x, railY - h / 2, 0]}>
              <boxGeometry args={[0.05, h, depth * 0.5]} />
              <meshStandardMaterial
                color={clothesColors[i % clothesColors.length]}
                roughness={0.85}
                metalness={0}
              />
            </mesh>
          )
        })}
        {/* Right bay: three shelves with a couple of folded stacks */}
        {[0.45, 0.95, 1.45].map((y, i) => (
          <mesh key={i} castShadow receiveShadow position={[innerW / 4, y, 0]} material={wood}>
            <boxGeometry args={[innerW / 2 - 0.04, t, depth - 0.04]} />
          </mesh>
        ))}
        {[0.45, 0.95].map((y, i) => (
          <mesh key={`f${i}`} castShadow position={[innerW / 4, y + 0.1, 0]}>
            <boxGeometry args={[innerW / 2 - 0.14, 0.16, depth - 0.12]} />
            <meshStandardMaterial color={i ? '#cdc4b4' : '#b7c0c8'} roughness={0.8} metalness={0} />
          </mesh>
        ))}
      </group>
    )
  })()

  // Sliding-door wardrobe (the HDB norm): two/three large aluminium-framed
  // laminate panels that overlap slightly on a track, with edge pulls — no
  // protruding knobs. Panels sit at two slightly different depths so they read
  // as bypassing on separate tracks.
  const sliding = doorStyle === 'sliding'
  const slidePanels = (() => {
    if (!sliding) return null
    const n = Math.max(2, Math.min(3, doorCount >= 3 ? 3 : 2))
    const overlap = 0.04
    const panelW = (width + overlap * (n - 1)) / n
    const panelH = height - 0.06
    return Array.from({ length: n }, (_, i) => {
      const x = -width / 2 + panelW / 2 + i * (panelW - overlap)
      const z = depth / 2 - (i % 2) * 0.03 // alternate track depth
      return (
        <group key={i}>
          {/* Aluminium frame */}
          <mesh castShadow position={[x, height / 2, z]}>
            <boxGeometry args={[panelW, panelH, 0.03]} />
            <meshStandardMaterial {...frameMetal} />
          </mesh>
          {/* Laminate insert */}
          <mesh castShadow position={[x, height / 2, z + 0.016]} material={wood}>
            <boxGeometry args={[panelW - 0.05, panelH - 0.05, 0.01]} />
          </mesh>
          {/* Recessed edge pull (vertical channel on the leading edge) */}
          <mesh position={[x + panelW / 2 - 0.03, height / 2, z + 0.02]}>
            <boxGeometry args={[0.015, panelH - 0.2, 0.01]} />
            <meshStandardMaterial color="#5a5e63" roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      )
    })
  })()

  const doors =
    sliding || open
      ? null
      : Array.from({ length: doorCount }, (_, i) => {
          const x = -width / 2 + doorGap + doorPanelW / 2 + i * (doorPanelW + doorGap)
          // Handle on the inner edge of each door (toward the centre gap).
          const handleSide = i < doorCount / 2 ? 1 : -1
          const handleX = x + handleSide * (doorPanelW / 2 - 0.05)
          return (
            <group key={i}>
              <mesh castShadow position={[x, height / 2, depth / 2 - doorInset]} material={wood}>
                <boxGeometry args={[doorPanelW, doorPanelH, 0.015]} />
              </mesh>
              <mesh castShadow position={[handleX, height / 2, depth / 2 + 0.012]}>
                <boxGeometry args={[0.02, 0.22, 0.02]} />
                <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
              </mesh>
            </group>
          )
        })

  return (
    <group>
      {/* Solid body for closed wardrobes; the open style draws its own carcass */}
      {!open && (
        <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={wood}>
          <boxGeometry args={[width, height, depth]} />
        </mesh>
      )}
      {doors}
      {slidePanels}
      {interior}
    </group>
  )
}
