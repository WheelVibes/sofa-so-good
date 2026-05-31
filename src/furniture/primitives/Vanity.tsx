import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Dressing table / vanity — a slim table with a drawer or two and a standing
 * mirror (round or rectangular) above. `lights` adds Hollywood bulb dots around
 * a rectangular mirror. Faces +Z; floor-anchored, centred. Real-world metres.
 */
export function Vanity({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const depth = readNum(props, 'depth', 0.42)
  const color = readStr(props, 'color', '#e7ddca')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0.1)
  const mirror = readStr(props, 'mirror', 'round')
  const lights = readStr(props, 'lights', 'no') === 'yes'

  const tableH = 0.75
  const topT = 0.03
  const legT = 0.04
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const glass = { color: '#d6e0e6', roughness: 0.06, metalness: 0.9 } as const
  const bulb = {
    color: '#fff4d8',
    emissive: '#fff0cc',
    emissiveIntensity: 0.5,
    roughness: 0.4,
  } as const

  const xs = [-width / 2 + legT, width / 2 - legT]
  const zs = [-depth / 2 + legT, depth / 2 - legT]
  const mY = tableH + 0.45
  const mR = 0.28
  const mW = width * 0.6
  const mH = 0.6

  return (
    <group>
      {/* Top */}
      <mesh castShadow receiveShadow position={[0, tableH - topT / 2, 0]} material={wood}>
        <boxGeometry args={[width, topT, depth]} />
      </mesh>
      {/* Drawer band under the top */}
      <mesh castShadow position={[0, tableH - 0.12, 0]} material={wood}>
        <boxGeometry args={[width - 0.1, 0.14, depth - 0.04]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * width * 0.22, tableH - 0.12, depth / 2 + 0.012]}>
          <sphereGeometry args={[0.015, 10, 8]} />
          <meshStandardMaterial color="#b08d57" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}
      {/* Legs */}
      {xs.map((x) =>
        zs.map((z) => (
          <mesh key={`${x}.${z}`} castShadow position={[x, (tableH - topT) / 2, z]} material={wood}>
            <boxGeometry args={[legT, tableH - topT, legT]} />
          </mesh>
        )),
      )}

      {/* Standing mirror */}
      {mirror === 'round' ? (
        <group position={[0, mY, -depth / 2 + 0.04]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]} material={wood}>
            <cylinderGeometry args={[mR, mR, 0.04, 32]} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <circleGeometry args={[mR - 0.03, 32]} />
            <meshStandardMaterial {...glass} />
          </mesh>
          {/* support post — bridges the table top up to the mirror centre */}
          <mesh position={[0, -(mY - tableH) / 2, 0]} material={wood}>
            <boxGeometry args={[0.03, mY - tableH, 0.03]} />
          </mesh>
        </group>
      ) : (
        <group position={[0, tableH + mH / 2 + 0.04, -depth / 2 + 0.05]}>
          <mesh castShadow material={wood}>
            <boxGeometry args={[mW, mH, 0.04]} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[mW - 0.06, mH - 0.06]} />
            <meshStandardMaterial {...glass} />
          </mesh>
          {lights &&
            Array.from({ length: 10 }, (_, i) => {
              const per = 4
              let x = 0
              let y = 0
              if (i < per) {
                x = -mW / 2 + (mW * i) / (per - 1)
                y = mH / 2 - 0.03
              } else if (i < per * 2) {
                x = -mW / 2 + (mW * (i - per)) / (per - 1)
                y = -mH / 2 + 0.03
              } else {
                x = (i % 2 ? 1 : -1) * (mW / 2 - 0.03)
                y = 0
              }
              return (
                <mesh key={i} position={[x, y, 0.03]}>
                  <sphereGeometry args={[0.018, 10, 8]} />
                  <meshStandardMaterial {...bulb} />
                </mesh>
              )
            })}
        </group>
      )}
    </group>
  )
}
