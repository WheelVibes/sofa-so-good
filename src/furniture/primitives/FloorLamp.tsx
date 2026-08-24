import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { fixtureEmissiveIntensity } from '../../scene/lighting/fixtureGlow'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Floor lamp: a disc base + slim pole, a splayed tripod, or an arched 'arc'
 *  (Arco-style) pole that reaches the shade out over a sofa. Topped with an
 *  emissive shade (empire / drum / cone) whose glow tracks scene darkness
 *  (bright at night, off in day). The arc reaches toward +X (local). */
export function FloorLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f3e6c8')
  const poleColor = readStr(props, 'poleColor', '#2b2b2b')
  const shade = readStr(props, 'shade', 'empire')
  const base = readStr(props, 'base', 'disc')
  const detail = useDetail()

  const poleH = 1.5
  const shadeH = 0.28
  // Shade profile: [topRadius, bottomRadius]
  const profile: [number, number] =
    shade === 'drum' ? [0.2, 0.2] : shade === 'cone' ? [0.07, 0.26] : [0.16, 0.21]
  const tripod = base === 'tripod'
  const arc = base === 'arc'
  const shadeRef = useRef<MeshStandardMaterial>(null)
  const bulbRef = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = fixtureEmissiveIntensity('shade')
    if (bulbRef.current) bulbRef.current.emissiveIntensity = fixtureEmissiveIntensity('bulb')
  })

  // Arc geometry: a riser then a quarter-circle that carries the shade out to
  // a horizontal `reach`, the shade hanging down at the end of the arch.
  const reach = 1.35
  const riserTop = 1.0
  const archTopY = riserTop + reach
  const metal = { color: poleColor, roughness: 0.35, metalness: 0.7 } as const
  const arcSegs: { pos: [number, number, number]; len: number; rot: number }[] = []
  if (arc) {
    const N = 12
    let prev: [number, number] = [0, riserTop]
    for (let i = 1; i <= N; i++) {
      const th = Math.PI - (Math.PI / 2) * (i / N)
      const p: [number, number] = [reach + reach * Math.cos(th), riserTop + reach * Math.sin(th)]
      const dx = p[0] - prev[0]
      const dy = p[1] - prev[1]
      const len = Math.hypot(dx, dy)
      arcSegs.push({
        pos: [(p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, 0],
        len: len + 0.01,
        rot: Math.atan2(-dx, dy),
      })
      prev = p
    }
  }
  const shadePos: [number, number, number] = arc
    ? [reach, archTopY - shadeH / 2 - 0.04, 0]
    : [0, poleH + shadeH / 2 - 0.02, 0]
  const bulbPos: [number, number, number] = arc
    ? // Tuck the glow disc up into the mouth of the shade (as in the non-arc
      // case) rather than hanging it a couple of cm below the shade.
      [reach, archTopY - shadeH + 0.02, 0]
    : [0, poleH + 0.02, 0]

  return (
    <group>
      {arc ? (
        <>
          {/* Heavy round base (marble-look), offset under the riser */}
          <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 0.1, seg(28, detail)]} />
            <meshStandardMaterial color="#e9e6df" roughness={0.5} metalness={0.05} />
          </mesh>
          {/* Riser */}
          <mesh castShadow position={[0, (riserTop + 0.1) / 2, 0]}>
            <cylinderGeometry args={[0.02, 0.022, riserTop - 0.1, 12]} />
            <MetalMaterial {...metal} />
          </mesh>
          {/* Arched segments */}
          {arcSegs.map((s, i) => (
            <mesh key={i} castShadow position={s.pos} rotation={[0, 0, s.rot]}>
              <cylinderGeometry args={[0.02, 0.02, s.len, 10]} />
              <MetalMaterial {...metal} />
            </mesh>
          ))}
          {/* Short drop stem into the shade */}
          <mesh castShadow position={[reach, archTopY - 0.05, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.12, 10]} />
            <MetalMaterial {...metal} />
          </mesh>
        </>
      ) : tripod ? (
        <>
          {/* Three splayed legs meeting just below the shade */}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            const spread = 0.34
            const fx = Math.sin(a) * spread
            const fz = Math.cos(a) * spread
            const legH = Math.hypot(poleH - 0.1, spread)
            const lean = Math.atan2(spread, poleH - 0.1)
            return (
              <mesh
                key={i}
                castShadow
                position={[fx / 2, (poleH - 0.1) / 2, fz / 2]}
                rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
              >
                <cylinderGeometry args={[0.016, 0.012, legH, 10]} />
                <meshStandardMaterial color={poleColor} roughness={0.45} metalness={0.4} />
              </mesh>
            )
          })}
          {/* Short upper stem to the shade */}
          <mesh castShadow position={[0, poleH - 0.05, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.3, 10]} />
            <meshStandardMaterial color={poleColor} roughness={0.45} metalness={0.4} />
          </mesh>
        </>
      ) : (
        <>
          {/* Disc base */}
          <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.16, 0.18, 0.04, seg(24, detail)]} />
            <MetalMaterial color={poleColor} roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Pole */}
          <mesh castShadow position={[0, poleH / 2, 0]}>
            <cylinderGeometry args={[0.018, 0.018, poleH, 12]} />
            <MetalMaterial color={poleColor} roughness={0.4} metalness={0.6} />
          </mesh>
        </>
      )}
      {/* Shade */}
      <mesh castShadow position={shadePos}>
        <cylinderGeometry args={[profile[0], profile[1], shadeH, seg(28, detail), 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.7}
          side={2}
        />
      </mesh>
      {/* Bulb glow disc at the bottom of the shade (faces down) */}
      <mesh position={bulbPos} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 20]} />
        <meshStandardMaterial
          ref={bulbRef}
          color="#fff6e0"
          emissive="#fff0d0"
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  )
}
