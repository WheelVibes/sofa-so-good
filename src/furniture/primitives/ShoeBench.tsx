import { RoundedBox } from '@react-three/drei'
import { getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/** Entryway shoe bench — a padded seat over two rows of open shoe cubbies, the
 *  near-universal "sit to put your shoes on" piece by an HDB front door. A low
 *  wooden carcass (sides + back + a mid shelf → two cubby rows, split into
 *  columns by dividers) carries a plump upholstered seat cushion on top. Faces
 *  +Z. `style`: 'cubbies' (open front, shoes on display) or 'flip' (tilt-open
 *  flip fronts covering each row, seated height). Real metres, floor-anchored. */
export function ShoeBench({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const depth = readNum(props, 'depth', 0.35)
  const bodyColor = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const cushionColor = readStr(props, 'cushion', '#4f5a63')
  const cushionKind = readStr(props, 'cushionMaterial', 'fabric')
  const style = readStr(props, 'style', 'cubbies')
  const flip = style === 'flip'

  const carcassH = 0.42 // seat deck top
  const cushionH = 0.07
  const panelT = 0.02
  const wood = getSurfaceMaterial(finish, bodyColor, 1.3, sheen)
  const seatMat = getUpholsteryMaterial(cushionKind, cushionColor, sheen)

  // Two rows of cubbies split by dividers into columns (≈0.33 m each).
  const cols = Math.max(2, Math.round(width / 0.34))
  const innerW = width - panelT * 2
  const midY = carcassH * 0.48

  return (
    <group>
      {/* Side panels — reach the floor (grounded) up to the seat deck */}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={s}
          castShadow
          receiveShadow
          position={[s * (width / 2 - panelT / 2), carcassH / 2, 0]}
          material={wood}
          args={[panelT, carcassH, depth]}
        />
      ))}
      {/* Back panel */}
      <BeveledBox
        receiveShadow
        position={[0, carcassH / 2, -depth / 2 + panelT / 2]}
        material={wood}
        args={[innerW, carcassH, panelT]}
      />
      {/* Bottom shelf (on the floor) */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, panelT / 2, 0]}
        material={wood}
        args={[width, panelT, depth]}
      />
      {/* Mid shelf → two rows */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, midY, 0]}
        material={wood}
        args={[innerW, panelT, depth - panelT]}
      />
      {/* Seat deck (top of the carcass) */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, carcassH - panelT / 2, 0]}
        material={wood}
        args={[width, panelT, depth]}
      />
      {/* Vertical cubby dividers */}
      {Array.from({ length: cols - 1 }, (_, i) => {
        const x = -innerW / 2 + (innerW / cols) * (i + 1)
        return (
          <BeveledBox
            key={i}
            castShadow
            receiveShadow
            position={[x, carcassH / 2, 0]}
            material={wood}
            args={[panelT * 0.7, carcassH - panelT, depth - panelT]}
          />
        )
      })}
      {/* Flip fronts (one tilt-open front per row) with a finger-pull reveal */}
      {flip &&
        [panelT + (midY - panelT) / 2, midY + (carcassH - panelT - midY) / 2].map((y, i) => {
          const rowH = i === 0 ? midY - panelT * 1.5 : carcassH - panelT * 1.5 - midY
          return (
            <group key={i}>
              <BeveledBox
                castShadow
                position={[0, y, depth / 2 + 0.005]}
                material={wood}
                args={[innerW - 0.01, rowH, 0.018]}
              />
              <mesh position={[0, y + rowH / 2 - 0.02, depth / 2 + 0.016]}>
                <boxGeometry args={[width * 0.4, 0.012, 0.012]} />
                <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.4} />
              </mesh>
            </group>
          )
        })}
      {/* Plump upholstered seat cushion — overlaps the seat deck */}
      <RoundedBox
        castShadow
        receiveShadow
        radius={0.02}
        smoothness={3}
        position={[0, carcassH + cushionH / 2 - 0.008, 0.004]}
        args={[width - 0.01, cushionH, depth - 0.01]}
        material={seatMat}
      />
    </group>
  )
}
