import { hexToRgb } from '../../materials/procedural/noise'
import type { ParamProps } from '../types'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Potted foliage plant: pot + soil + foliage. The `type` enum picks the
 *  silhouette — a clustered bush, upright snake plant, arching palm, or a
 *  tall fiddle-leaf fig — `potShape` picks the planter (tapered / cylinder /
 *  square box), and `size` scales the whole plant. */
export function PottedPlant({ props }: { props: ParamProps }) {
  const sizeKey = readStr(props, 'size', 'medium')
  const type = readStr(props, 'type', 'bush')
  const potShape = readStr(props, 'potShape', 'tapered')
  const potColor = readStr(props, 'potColor', '#b9743f')
  const leafColor = readStr(props, 'leafColor', '#3f6b3a')
  const stand = readStr(props, 'stand', 'none')
  const standColor = readStr(props, 'standColor', '#7a5230')

  const scale = sizeKey === 'small' ? 0.7 : sizeKey === 'large' ? 1.35 : 1

  const detail = useDetail()
  const potH = 0.32
  const potRTop = 0.2
  const potRBot = potShape === 'tapered' ? 0.14 : 0.2
  const potSeg = seg(24, detail)

  // Raised mid-century plant stand: 3 splayed wooden legs carry a ring that
  // cradles the pot. The pot (and everything above it) is lifted so its lower
  // body seats INSIDE the ring; the legs run from the floor up to the ring, so
  // the whole piece is one grounded assembly. Sized to the (scaled) pot so a
  // larger plant gets a proportionally larger cradle.
  const raised = stand === 'raised'
  const standH = 0.5
  // Pot rests with its lower body inside the ring; ring at standH, pot lifted so
  // its base sits ~4 cm below the ring top (an overlap the ring cradles).
  const lift = raised ? standH - 0.05 : 0
  const cradleR = potRBot * scale + 0.01 // ring hugs the pot base
  const legSeg = seg(8, detail)
  const plantStand = raised ? (
    <group>
      {/* Ring that cradles the pot */}
      <mesh castShadow position={[0, standH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cradleR, 0.014, seg(10, detail), seg(24, detail)]} />
        <meshStandardMaterial color={standColor} roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Three splayed legs: floor → ring */}
      {Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6
        // Modest splay so the foot circle stays within the honest footprint
        // (even at the large size): dia ≤ ~0.56 m.
        const footR = cradleR + 0.06
        const topR = cradleR - 0.005
        // A leg leaning outward from the ring rim to a wider foot circle.
        const lean = Math.atan2(footR - topR, standH)
        const legLen = Math.hypot(standH, footR - topR)
        const mx = (Math.cos(a) * (footR + topR)) / 2
        const mz = (Math.sin(a) * (footR + topR)) / 2
        return (
          <mesh
            key={i}
            castShadow
            position={[mx, standH / 2, mz]}
            rotation={[Math.sin(a) * lean, 0, -Math.cos(a) * lean]}
          >
            <cylinderGeometry args={[0.011, 0.014, legLen, legSeg]} />
            <meshStandardMaterial color={standColor} roughness={0.6} metalness={0.15} />
          </mesh>
        )
      })}
    </group>
  ) : null

  // Shade a hex by a factor for canopy depth variation.
  const [lr, lg, lb] = hexToRgb(leafColor)
  const tint = (f: number) =>
    `rgb(${Math.round(Math.min(255, lr * f))},${Math.round(Math.min(255, lg * f))},${Math.round(Math.min(255, lb * f))})`

  // Fuller canopy: more blobs, varied size/shade. f<1 = shadowed interior.
  const blobs: { p: [number, number, number]; r: number; f: number }[] = [
    { p: [0, potH + 0.34, 0], r: 0.27, f: 1.0 },
    { p: [0.18, potH + 0.22, 0.06], r: 0.21, f: 0.82 },
    { p: [-0.17, potH + 0.24, -0.07], r: 0.2, f: 0.86 },
    { p: [0.03, potH + 0.54, -0.05], r: 0.19, f: 1.12 },
    { p: [-0.06, potH + 0.18, 0.18], r: 0.17, f: 0.78 },
    { p: [0.14, potH + 0.42, -0.14], r: 0.18, f: 1.05 },
    { p: [-0.16, potH + 0.44, 0.1], r: 0.17, f: 0.95 },
    { p: [0.1, potH + 0.3, 0.17], r: 0.16, f: 0.9 },
    { p: [-0.02, potH + 0.66, 0.04], r: 0.14, f: 1.18 },
  ]

  // A few leaf fronds poking out of the canopy.
  const fronds: { p: [number, number, number]; rot: [number, number, number] }[] = [
    { p: [0.05, potH + 0.7, 0.0], rot: [0.2, 0, 0.2] },
    { p: [-0.1, potH + 0.6, 0.08], rot: [0.3, 1, -0.3] },
    { p: [0.12, potH + 0.58, -0.06], rot: [-0.2, -0.8, 0.4] },
  ]

  return (
    <group>
      {plantStand}
      <group position={[0, lift, 0]} scale={scale}>
        {/* Pot, rim + soil — square box planter or a round (tapered/cylinder) pot */}
        {potShape === 'square' ? (
          <>
            <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
              <boxGeometry args={[potRTop * 2, potH, potRTop * 2]} />
              <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
            </mesh>
            <mesh castShadow position={[0, potH, 0]}>
              <boxGeometry args={[potRTop * 2 + 0.02, 0.04, potRTop * 2 + 0.02]} />
              <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
            </mesh>
            <mesh position={[0, potH - 0.02, 0]}>
              <boxGeometry args={[potRTop * 2 - 0.04, 0.03, potRTop * 2 - 0.04]} />
              <meshStandardMaterial color="#3a2a1c" roughness={1} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
              <cylinderGeometry args={[potRTop, potRBot, potH, potSeg]} />
              <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
            </mesh>
            <mesh castShadow position={[0, potH, 0]}>
              <cylinderGeometry args={[potRTop + 0.012, potRTop, 0.04, potSeg]} />
              <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
            </mesh>
            <mesh position={[0, potH - 0.02, 0]}>
              <cylinderGeometry args={[potRTop - 0.02, potRTop - 0.02, 0.03, potSeg]} />
              <meshStandardMaterial color="#3a2a1c" roughness={1} />
            </mesh>
          </>
        )}
        {type === 'bush' && (
          <>
            {/* Stem */}
            <mesh castShadow position={[0, potH + 0.14, 0]}>
              <cylinderGeometry args={[0.025, 0.03, 0.3, 8]} />
              <meshStandardMaterial color="#5a4324" roughness={0.9} />
            </mesh>
            {/* Canopy */}
            {blobs.map((b, i) => (
              <mesh key={i} castShadow position={b.p}>
                <icosahedronGeometry args={[b.r, 1]} />
                <meshStandardMaterial
                  color={tint(b.f)}
                  roughness={0.85}
                  metalness={0}
                  flatShading
                />
              </mesh>
            ))}
            {/* Fronds */}
            {fronds.map((f, i) => (
              <mesh key={`f${i}`} castShadow position={f.p} rotation={f.rot}>
                <coneGeometry args={[0.05, 0.34, 5]} />
                <meshStandardMaterial
                  color={tint(1.1)}
                  roughness={0.85}
                  metalness={0}
                  flatShading
                />
              </mesh>
            ))}
          </>
        )}
        {type === 'snake' && (
          <>
            {/* Upright sword-like leaves fanning out of the pot. */}
            {Array.from({ length: 9 }, (_, i) => {
              const a = (i / 9) * Math.PI * 2
              const ring = 0.06 + (i % 3) * 0.03
              const h = 0.7 + ((i * 37) % 5) * 0.09
              const lean = 0.12 + (i % 4) * 0.04
              return (
                <mesh
                  key={i}
                  castShadow
                  position={[Math.sin(a) * ring, potH + h / 2, Math.cos(a) * ring]}
                  rotation={[Math.cos(a) * lean, a, -Math.sin(a) * lean]}
                >
                  <boxGeometry args={[0.07, h, 0.012]} />
                  <meshStandardMaterial
                    color={tint(0.85 + (i % 3) * 0.12)}
                    roughness={0.7}
                    metalness={0}
                    flatShading
                  />
                </mesh>
              )
            })}
          </>
        )}
        {type === 'palm' && (
          <>
            {/* Slim trunk + arching fronds at the crown. */}
            <mesh castShadow position={[0, potH + 0.35, 0]}>
              <cylinderGeometry args={[0.022, 0.032, 0.7, 8]} />
              <meshStandardMaterial color="#6a5230" roughness={0.9} />
            </mesh>
            {Array.from({ length: 7 }, (_, i) => {
              const a = (i / 7) * Math.PI * 2
              const arch = 0.5 + (i % 3) * 0.06
              return (
                <mesh
                  key={i}
                  castShadow
                  position={[Math.sin(a) * 0.16, potH + 0.72, Math.cos(a) * 0.16]}
                  rotation={[Math.cos(a) * 0.9, a, -Math.sin(a) * 0.9]}
                >
                  <coneGeometry args={[0.06, arch, 4]} />
                  <meshStandardMaterial
                    color={tint(0.9 + (i % 3) * 0.1)}
                    roughness={0.8}
                    metalness={0}
                    flatShading
                  />
                </mesh>
              )
            })}
          </>
        )}
        {type === 'fiddle' && (
          <>
            {/* Slim woody trunk */}
            <mesh castShadow position={[0, potH + 0.42, 0]}>
              <cylinderGeometry args={[0.024, 0.034, 0.85, 8]} />
              <meshStandardMaterial color="#6a5230" roughness={0.9} />
            </mesh>
            {/* Large broad oval leaves up the trunk, alternating sides */}
            {Array.from({ length: 7 }, (_, i) => {
              const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.6
              const h = potH + 0.55 + i * 0.12
              const out = 0.16 + (i % 2) * 0.05
              const tilt = 0.5 + (i % 3) * 0.12
              return (
                <mesh
                  key={i}
                  castShadow
                  position={[Math.sin(a) * out, h, Math.cos(a) * out]}
                  rotation={[Math.cos(a) * tilt, a, -Math.sin(a) * tilt]}
                  scale={[0.16, 0.015, 0.24]}
                >
                  <icosahedronGeometry args={[1, 2]} />
                  <meshStandardMaterial
                    color={tint(0.85 + (i % 3) * 0.12)}
                    roughness={0.55}
                    metalness={0}
                  />
                </mesh>
              )
            })}
          </>
        )}
      </group>
    </group>
  )
}
