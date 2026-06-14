import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'
import { buildVanity, VANITY_TABLE_H, type VanityLayoutKind } from './vanityLayout'

/**
 * Dressing table / vanity — a configurable base (`layout`: open legs /
 * single drawer pedestal / double-pedestal kneehole; pure maths in
 * `vanityLayout.ts`) under a tabletop, with an optional standing mirror
 * (round / rectangular / none) above. `lights` rings a rectangular mirror
 * with Hollywood bulb dots, which also emit real light at night via
 * `lightEmitters.ts`. Faces +Z; floor-anchored, centred. Real-world metres.
 */
export function Vanity({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const detail = useDetail()
  const depth = readNum(props, 'depth', 0.42)
  const color = readStr(props, 'color', '#e7ddca')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0.1)
  const layout = readStr(props, 'layout', 'legs') as VanityLayoutKind
  const mirror = readStr(props, 'mirror', 'round')
  const lights = readStr(props, 'lights', 'no') === 'yes'

  const tableH = VANITY_TABLE_H
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const glass = { color: '#d6e0e6', roughness: 0.06, metalness: 0.9 } as const
  const bulb = {
    color: '#fff4d8',
    emissive: '#fff0cc',
    // Hollywood bulbs glow hot (HDR >1) when switched on so they bloom + read
    // self-lit (PHOTO-EMISSIVE); dim but visible when off.
    emissiveIntensity: lights ? 1.6 : 0.5,
    roughness: 0.4,
  } as const

  const base = buildVanity(width, depth, layout)
  const mY = tableH + 0.45
  const mR = 0.28
  const mW = Math.min(width * 0.6, 0.78)
  const mH = 0.6

  return (
    <group>
      {/* Base: tabletop + supports (legs/pedestals) + aprons, from vanityLayout */}
      {[base.top, ...base.supports, ...base.aprons].map((p) => (
        <mesh key={p.key} castShadow receiveShadow position={[p.x, p.y, p.z]} material={wood}>
          <boxGeometry args={[p.w, p.h, p.d]} />
        </mesh>
      ))}
      {/* Drawer fronts + a knob each */}
      {base.drawerFronts.map((p) => (
        <group key={p.key}>
          <mesh castShadow position={[p.x, p.y, p.z]} material={wood}>
            <boxGeometry args={[p.w, p.h, p.d]} />
          </mesh>
          <mesh position={[p.x, p.y, p.z + p.d / 2 + 0.01]}>
            <sphereGeometry args={[0.014, 10, 8]} />
            <meshStandardMaterial color="#b08d57" roughness={0.4} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Standing mirror */}
      {mirror === 'round' ? (
        <group position={[0, mY, -depth / 2 + 0.04]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]} material={wood}>
            <cylinderGeometry args={[mR, mR, 0.04, seg(32, detail)]} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <circleGeometry args={[mR - 0.03, seg(32, detail)]} />
            <meshStandardMaterial {...glass} />
          </mesh>
          {/* support post — bridges the table top up to the mirror centre */}
          <mesh position={[0, -(mY - tableH) / 2, 0]} material={wood}>
            <boxGeometry args={[0.03, mY - tableH, 0.03]} />
          </mesh>
        </group>
      ) : mirror === 'rect' ? (
        // Frame rests directly on the tabletop (no floating gap).
        <group position={[0, tableH + mH / 2, -depth / 2 + 0.05]}>
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
      ) : null}
    </group>
  )
}
