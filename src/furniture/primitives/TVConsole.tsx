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
  const faceInset = 0.015

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

      {/* Fronts: two drawers (bar handles) or two doors (edge pulls) */}
      {[-1, 1].map((s) => {
        const cx = s * (faceW / 2 + 0.015)
        const faceY = bodyY + bodyH / 2
        return (
          <group key={s}>
            <BeveledBox
              castShadow
              position={[cx, faceY, depth / 2 - faceInset]}
              material={wood}
              args={[faceW, bodyH - 0.04, 0.012]}
            />
            {front === 'drawers' ? (
              <mesh castShadow position={[cx, faceY, depth / 2 + 0.01]}>
                <boxGeometry args={[faceW * 0.45, 0.018, 0.018]} />
                <meshStandardMaterial {...metal} />
              </mesh>
            ) : (
              // Door: vertical bar pull near the centre gap.
              <mesh castShadow position={[s * 0.03, faceY, depth / 2 + 0.01]}>
                <boxGeometry args={[0.018, (bodyH - 0.04) * 0.5, 0.018]} />
                <meshStandardMaterial {...metal} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
