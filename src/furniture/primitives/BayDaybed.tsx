import { RoundedBox } from '@react-three/drei'
import { getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/** Bay-window daybed / window bench — a freestanding sit-and-recline bench sized
 *  to sit under a window (condo/HDB bay). A boxed wooden storage base with two
 *  front drawers carries a plump full-length seat cushion; cylindrical bolsters
 *  cap each short end and a row of square back cushions leans along the long
 *  (wall) edge. Faces +Z (a seated person looks into the room; the back cushions
 *  are on the −Z / window side). Real metres, footprint-centred, floor-anchored.
 *  NOT window-bound — it is ordinary furniture placed near a window. */
export function BayDaybed({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.7)
  const depth = 0.6
  const color = readStr(props, 'color', '#9aa7ad')
  const material = readStr(props, 'material', 'fabric')
  const pattern = readStr(props, 'pattern', 'plain')
  const bolsterColor = readStr(props, 'bolsterColor', '#c2a98a')
  const baseColor = readStr(props, 'baseColor', '#7a6647')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)

  const baseH = 0.38 // seat-deck top
  const cushionH = 0.09
  const seatTop = baseH + cushionH // ~0.47
  const faceZ = depth / 2
  const wood = getSurfaceMaterial(finish, baseColor, 1.4, sheen)
  const mat = getUpholsteryMaterial(material, color, sheen, pattern)
  const bolsterMat = getUpholsteryMaterial(material, bolsterColor, sheen, pattern)
  const metal = { color: '#8a8d92', roughness: 0.35, metalness: 0.7 }

  const innerW = width - 0.04
  const bolsterR = 0.09

  return (
    <group>
      {/* Boxed wooden storage base */}
      <BeveledBox
        args={[width, baseH, depth]}
        castShadow
        receiveShadow
        position={[0, baseH / 2, 0]}
        material={wood}
      />

      {/* Two proud drawer fronts on the long front face + bar pulls */}
      {[-1, 1].map((s) => {
        const dw = (width - 0.09) / 2
        const cx = s * (dw / 2 + 0.02)
        const dy = baseH / 2
        return (
          <group key={s}>
            <BeveledBox
              args={[dw, baseH - 0.09, 0.02]}
              castShadow
              position={[cx, dy, faceZ + 0.006]}
              material={wood}
            />
            <mesh castShadow position={[cx, dy, faceZ + 0.03]}>
              <boxGeometry args={[dw * 0.32, 0.02, 0.02]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          </group>
        )
      })}

      {/* Full-length seat cushion — overlaps the base deck */}
      <RoundedBox
        args={[innerW, cushionH, depth - 0.03]}
        radius={0.035}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, baseH + cushionH / 2 - 0.006, 0.01]}
        material={mat}
      />

      {/* Back cushions leaning along the long (window/wall) edge */}
      {(() => {
        const n = Math.max(2, Math.round(width / 0.62))
        const gap = 0.03
        const cw = (innerW - gap * (n - 1)) / n
        return Array.from({ length: n }, (_, i) => {
          const x = -innerW / 2 + cw / 2 + i * (cw + gap)
          return (
            <RoundedBox
              key={i}
              args={[cw, 0.34, 0.13]}
              radius={0.05}
              smoothness={3}
              castShadow
              position={[x, seatTop + 0.15, -depth / 2 + 0.14]}
              rotation={[0.14, 0, 0]}
              material={mat}
            />
          )
        })
      })()}

      {/* Cylindrical bolsters capping each short end, resting on the seat */}
      {[-1, 1].map((s) => (
        <mesh
          key={`bol${s}`}
          castShadow
          position={[s * (width / 2 - bolsterR - 0.01), seatTop + bolsterR - 0.02, 0.02]}
          rotation={[Math.PI / 2, 0, 0]}
          material={bolsterMat}
        >
          <cylinderGeometry args={[bolsterR, bolsterR, depth - 0.1, 20]} />
        </mesh>
      ))}
    </group>
  )
}
