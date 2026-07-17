import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

interface TVConsoleProps {
  props: ParamProps
}

/**
 * TV console: a long low cabinet. `base` raises the body on a plinth, on
 * splayed mid-century legs, or sits it as a block (BESTÅ/HEMNES-style).
 * `front` shows two drawer faces (bar handles) or two doors (edge pulls).
 * Faces +Z.
 */
export function TVConsole({ props }: TVConsoleProps) {
  const width = readNum(props, 'width', 1.8)
  const color = readStr(props, 'color', '#3a2f24')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const base = readStr(props, 'base', 'block')
  const front = readStr(props, 'front', 'drawers')

  const depth = 0.4
  const bodyH = 0.42
  const legH = base === 'legs' ? 0.14 : base === 'plinth' ? 0.05 : 0
  const bodyY = legH // body bottom sits on the base
  const faceW = (width - 0.06) / 2
  // Fronts sit slightly PROUD of the body face (like the dresser/sideboard) so
  // the two bays + their reveal gap actually read — a face recessed *into* the
  // solid carcass is invisible (it just shows the body), leaving the handles
  // floating on a featureless slab.
  const faceZ = depth / 2 + 0.004

  const wood = getSurfaceMaterial(finish, color, 1.6, sheen)
  const metal = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 }

  return (
    <group>
      {/* Body */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, bodyY + bodyH / 2, 0]}
        material={wood}
        args={[width, bodyH, depth]}
      />

      {/* Base: plinth (recessed toe-kick), splayed legs, or nothing */}
      {base === 'plinth' && (
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, legH / 2, 0.02]}
          material={wood}
          args={[width - 0.08, legH, depth - 0.06]}
        />
      )}
      {base === 'legs' &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}.${sz}`}
              castShadow
              position={[sx * (width / 2 - 0.09), legH / 2, sz * (depth / 2 - 0.07)]}
              rotation={[sz * -0.14, 0, sx * 0.14]}
            >
              <cylinderGeometry args={[0.018, 0.012, legH, 10]} />
              <meshStandardMaterial color="#2c2118" roughness={0.45} metalness={0.2} />
            </mesh>
          )),
        )}

      {/* Fronts: two drawers (bar handles) or two doors (edge pulls). Each front
          is a proud panel inset from the bay edges so a shadow-gap reveal reads
          around it; drawers additionally split into two stacked faces. */}
      {[-1, 1].map((s) => {
        const cx = s * (faceW / 2 + 0.015)
        const faceCY = bodyY + bodyH / 2
        return (
          <group key={s}>
            {front === 'drawers' ? (
              // Two stacked drawer faces per bay with bar pulls.
              [0, 1].map((r) => {
                const dh = (bodyH - 0.05) / 2
                const dy = bodyY + 0.02 + dh / 2 + r * (dh + 0.01)
                return (
                  <group key={r}>
                    <BeveledBox
                      castShadow
                      position={[cx, dy, faceZ]}
                      material={wood}
                      args={[faceW - 0.012, dh, 0.016]}
                    />
                    <mesh castShadow position={[cx, dy, faceZ + 0.016]}>
                      <boxGeometry args={[faceW * 0.42, 0.016, 0.018]} />
                      <meshStandardMaterial {...metal} />
                    </mesh>
                  </group>
                )
              })
            ) : (
              // A single door front per bay with a vertical bar pull near the gap.
              <group>
                <BeveledBox
                  castShadow
                  position={[cx, faceCY, faceZ]}
                  material={wood}
                  args={[faceW - 0.012, bodyH - 0.05, 0.016]}
                />
                <mesh castShadow position={[s * 0.03, faceCY, faceZ + 0.016]}>
                  <boxGeometry args={[0.018, (bodyH - 0.05) * 0.5, 0.018]} />
                  <meshStandardMaterial {...metal} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}
