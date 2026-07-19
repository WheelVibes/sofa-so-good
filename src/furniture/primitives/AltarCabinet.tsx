import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

interface AltarCabinetProps {
  props: ParamProps
}

/**
 * Altar / prayer cabinet (神台) — a common Singapore household fitting. A tall
 * two-tier piece: a lower storage cabinet on a recessed plinth carrying a raised
 * open display shelf (the deity/offering platform) with a back panel, sides,
 * canopy and a mid shelf. Faces +Z, built in real metres, footprint-centred.
 *
 * `style` (first structural enum) sets the lower section's front:
 *  - 'cabinet' (default) — two hinged door fronts + brass pulls;
 *  - 'drawers'           — two stacked drawer fronts + brass pulls.
 */
export function AltarCabinet({ props }: AltarCabinetProps) {
  const width = readNum(props, 'width', 0.9)
  const color = readStr(props, 'color', '#6e3b2e')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0.1)
  const style = readStr(props, 'style', 'cabinet')

  const w = width
  const d = 0.5
  const h = 1.5

  const wood = getSurfaceMaterial(finish, color, 1.2, sheen)
  const brass = getSurfaceMaterial('brass', '#b8923f')

  const plinthH = 0.09
  const counterY = 0.86 // top of the lower cabinet / underside of the display tier
  const carcassBottom = plinthH
  const carcassH = counterY - carcassBottom
  const panelT = 0.03
  const frontT = 0.02

  // Upper open display tier.
  const tierBottom = counterY + panelT
  const tierTop = h - 0.02
  const tierH = tierTop - tierBottom
  const sidePost = 0.035

  return (
    <group>
      {/* Recessed plinth / toe kick (reaches the floor). */}
      <BeveledBox
        material={wood}
        castShadow
        receiveShadow
        position={[0, plinthH / 2, 0]}
        args={[w - 0.06, plinthH, d - 0.06]}
      />
      {/* Lower cabinet carcass (overhangs the plinth for a shadow-gap toe kick). */}
      <BeveledBox
        material={wood}
        castShadow
        receiveShadow
        position={[0, carcassBottom + carcassH / 2, 0]}
        args={[w, carcassH, d]}
      />
      {/* Counter panel capping the lower cabinet. */}
      <BeveledBox
        material={wood}
        castShadow
        position={[0, counterY + panelT / 2, 0]}
        args={[w + 0.04, panelT, d + 0.03]}
      />

      {/* Lower-section fronts. */}
      {style === 'drawers' &&
        [0, 1].map((i) => {
          const drawerH = (carcassH - 0.06) / 2
          const y = carcassBottom + 0.03 + drawerH / 2 + i * (drawerH + 0.02)
          return (
            <group key={`dr${i}`}>
              <BeveledBox
                material={wood}
                castShadow
                position={[0, y, d / 2 - frontT / 2 + 0.006]}
                args={[w - 0.06, drawerH, frontT]}
              />
              <mesh castShadow position={[0, y, d / 2 + 0.02]} material={brass}>
                <cylinderGeometry args={[0.012, 0.012, 0.16, 12]} />
              </mesh>
            </group>
          )
        })}
      {style === 'cabinet' &&
        [-1, 1].map((s) => (
          <group key={`cd${s}`}>
            <BeveledBox
              material={wood}
              castShadow
              position={[s * (w / 4), carcassBottom + carcassH / 2, d / 2 - frontT / 2 + 0.006]}
              args={[w / 2 - 0.03, carcassH - 0.05, frontT]}
            />
            {/* Brass knob near the cabinet centre gap. */}
            <mesh
              castShadow
              position={[s * 0.05, carcassBottom + carcassH / 2, d / 2 + 0.02]}
              material={brass}
            >
              <cylinderGeometry args={[0.016, 0.016, 0.05, 14]} />
            </mesh>
          </group>
        ))}
      {/* Upper open display tier — back panel + two side posts + canopy + shelf. */}
      <BeveledBox
        material={wood}
        castShadow
        receiveShadow
        position={[0, tierBottom + tierH / 2, -d / 2 + panelT / 2]}
        args={[w, tierH, panelT]}
      />
      {[-1, 1].map((s) => (
        <BeveledBox
          key={`sp${s}`}
          material={wood}
          castShadow
          position={[s * (w / 2 - sidePost / 2), tierBottom + tierH / 2, 0]}
          args={[sidePost, tierH, d - 0.02]}
        />
      ))}
      {/* Canopy / cornice over the display tier. */}
      <BeveledBox
        material={wood}
        castShadow
        position={[0, tierTop - 0.03, 0]}
        args={[w + 0.05, 0.06, d + 0.02]}
      />
      {/* Display shelf mid-tier (statues / offerings rest here). */}
      <BeveledBox
        material={wood}
        castShadow
        receiveShadow
        position={[0, tierBottom + tierH * 0.42, 0.01]}
        args={[w - sidePost * 2, panelT, d - panelT]}
      />
    </group>
  )
}
