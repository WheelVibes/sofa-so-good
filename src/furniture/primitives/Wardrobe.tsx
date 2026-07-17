import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { doorHingePivot, isCabinetOpen } from '../cabinetOpen'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { HingedDoor } from './openable'
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
  const interiorLayout = readStr(props, 'interior', 'mixed')

  const depth = 0.6
  const height = 2.1
  const doorInset = 0.02
  const doorGap = 0.01
  const doorPanelH = height - 0.1
  const doorPanelW = (width - doorGap * (doorCount + 1) - 0.02) / doorCount

  const wood = getSurfaceMaterial(finish, color, 2, sheen)
  const frameMetal = { color: '#b8bcc0', roughness: 0.35, metalness: 0.75 } as const
  const open = doorStyle === 'open'

  // Open wardrobe: an exposed carcass (no doors) with a configurable fit-out
  // (`interior`): hanging rails, shelf stacks and/or a drawer bank — for
  // visualising real storage in an interior-design layout.
  const interior = (() => {
    if (!open) return null
    const t = 0.02
    const innerW = width - t * 2
    const railY = height - 0.32
    const clothesColors = ['#6b4f6b', '#3b5a7d', '#9c5a3c', '#3f6b3a', '#7d3b3b', '#4a4f56']

    // A hanging bay: a rail centred on (cx) spanning bw, with garments below.
    const hangingBay = (cx: number, bw: number, key: string, lowRail = false) => {
      const ry = lowRail ? height / 2 + 0.45 : railY
      const n = Math.max(3, Math.round(bw / 0.14))
      return (
        <group key={key}>
          {/* Rail spans the full bay and sockets into the side wall + divider
              (it previously stopped ~3 cm short at each end, leaving the rail +
              its garments floating clear of the carcass). */}
          <mesh position={[cx, ry, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, bw + 0.02, 10]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.3} metalness={0.7} />
          </mesh>
          {Array.from({ length: n }, (_, i) => {
            const x = cx - bw / 2 + 0.08 + i * ((bw - 0.16) / (n - 1))
            const h = 0.62 + (i % 3) * 0.08
            return (
              <mesh key={i} castShadow position={[x, ry - h / 2, 0]}>
                <boxGeometry args={[0.05, h, depth * 0.5]} />
                <meshStandardMaterial
                  color={clothesColors[i % clothesColors.length]}
                  roughness={0.85}
                  metalness={0}
                />
              </mesh>
            )
          })}
        </group>
      )
    }

    // A shelf bay: evenly spaced shelves with a couple of folded stacks.
    const shelfBay = (cx: number, bw: number, key: string) => (
      <group key={key}>
        {[0.45, 0.83, 1.21, 1.59].map((y, i) => (
          <BeveledBox
            key={i}
            castShadow
            receiveShadow
            position={[cx, y, 0]}
            material={wood}
            args={[bw - 0.04, t, depth - 0.04]}
          />
        ))}
        {[0.45, 0.83].map((y, i) => (
          <mesh key={`f${i}`} castShadow position={[cx, y + 0.1, 0]}>
            <boxGeometry args={[bw - 0.14, 0.15, depth - 0.12]} />
            <meshStandardMaterial color={i ? '#cdc4b4' : '#b7c0c8'} roughness={0.8} metalness={0} />
          </mesh>
        ))}
      </group>
    )

    // A drawer bank (lower half): stacked drawer fronts with slim pulls.
    const drawerBay = (cx: number, bw: number, key: string) => (
      <group key={key}>
        {[0.18, 0.45, 0.72, 0.99].map((y, i) => (
          <group key={i}>
            <BeveledBox
              castShadow
              position={[cx, y, depth / 2 - 0.04]}
              material={wood}
              args={[bw - 0.05, 0.24, 0.02]}
            />
            <mesh position={[cx, y + 0.08, depth / 2 - 0.02]}>
              <boxGeometry args={[bw * 0.4, 0.015, 0.02]} />
              <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
    )

    const twoBays = interiorLayout === 'mixed' || interiorLayout === 'drawers'
    const bays: React.ReactNode[] = []
    if (interiorLayout === 'hanging') {
      bays.push(hangingBay(0, innerW, 'h-top'))
    } else if (interiorLayout === 'shelves') {
      bays.push(shelfBay(0, innerW, 's-full'))
    } else if (interiorLayout === 'drawers') {
      bays.push(drawerBay(-innerW / 4, innerW / 2, 'd-left'))
      bays.push(hangingBay(-innerW / 4, innerW / 2, 'h-left', true))
      bays.push(hangingBay(innerW / 4, innerW / 2, 'h-right'))
    } else {
      // mixed (default): hanging left, shelves right.
      bays.push(hangingBay(-innerW / 4, innerW / 2, 'h-left'))
      bays.push(shelfBay(innerW / 4, innerW / 2, 's-right'))
    }

    return (
      <group>
        {/* Carcass: back + two sides + top + bottom (+ a central divider for
            two-bay layouts). */}
        <mesh receiveShadow position={[0, height / 2, -depth / 2 + t / 2]} material={wood}>
          <boxGeometry args={[width, height, t]} />
        </mesh>
        {[-1, 1].map((s) => (
          <BeveledBox
            key={s}
            castShadow
            position={[s * (width / 2 - t / 2), height / 2, 0]}
            material={wood}
            args={[t, height, depth]}
          />
        ))}
        {[t / 2, height - t / 2].map((y, i) => (
          <BeveledBox
            key={i}
            castShadow
            receiveShadow
            position={[0, y, 0]}
            material={wood}
            args={[width, t, depth]}
          />
        ))}
        {twoBays ? (
          <BeveledBox
            castShadow
            position={[0, height / 2, 0]}
            material={wood}
            args={[t, height, depth]}
          />
        ) : null}
        {bays}
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
          <BeveledBox castShadow position={[x, height / 2, z]} args={[panelW, panelH, 0.03]}>
            <meshStandardMaterial {...frameMetal} />
          </BeveledBox>
          {/* Laminate insert */}
          <BeveledBox
            castShadow
            position={[x, height / 2, z + 0.016]}
            material={wood}
            args={[panelW - 0.05, panelH - 0.05, 0.01]}
          />
          {/* Recessed edge pull (vertical channel on the leading edge) */}
          <mesh position={[x + panelW / 2 - 0.03, height / 2, z + 0.02]}>
            <boxGeometry args={[0.015, panelH - 0.2, 0.01]} />
            <meshStandardMaterial color="#5a5e63" roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      )
    })
  })()

  // Hinged doors swing open (CABINET-OPEN) about their OUTER edge (handle toward
  // the centre gap), reading the persisted per-item open state.
  const isOpen = isCabinetOpen(props)
  const doors =
    sliding || open
      ? null
      : Array.from({ length: doorCount }, (_, i) => {
          const x = -width / 2 + doorGap + doorPanelW / 2 + i * (doorPanelW + doorGap)
          // Handle on the inner edge of each door (toward the centre gap); the
          // door therefore hinges on its outer edge.
          const handleSide = i < doorCount / 2 ? 1 : -1
          const handleX = x + handleSide * (doorPanelW / 2 - 0.05)
          const hinge = i < doorCount / 2 ? 'left' : 'right'
          const { pivotX, swingSign } = doorHingePivot(x, doorPanelW, hinge)
          return (
            <HingedDoor
              key={i}
              open={isOpen}
              pivotX={pivotX}
              pivotZ={depth / 2 - doorInset}
              swingSign={swingSign}
            >
              <BeveledBox
                castShadow
                position={[x, height / 2, depth / 2 - doorInset]}
                material={wood}
                args={[doorPanelW, doorPanelH, 0.015]}
              />
              <mesh castShadow position={[handleX, height / 2, depth / 2 + 0.012]}>
                <boxGeometry args={[0.02, 0.22, 0.02]} />
                <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
              </mesh>
            </HingedDoor>
          )
        })

  return (
    <group>
      {/* Solid body for closed wardrobes; the open style draws its own carcass */}
      {!open && (
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, height / 2, 0]}
          material={wood}
          args={[width, height, depth]}
        />
      )}
      {doors}
      {slidePanels}
      {interior}
    </group>
  )
}
