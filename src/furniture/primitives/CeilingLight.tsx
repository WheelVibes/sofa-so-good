import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { fixtureEmissiveIntensity } from '../../scene/lighting/fixtureGlow'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Staggered cluster layout: (x, z) offset from the canopy centre + a drop
 *  length in [0.4, 1.2] m. A cluster renders the first `count` of these. */
const CLUSTER_LAYOUT: { x: number; z: number; drop: number }[] = [
  { x: -0.16, z: -0.1, drop: 0.55 },
  { x: 0.15, z: 0.14, drop: 0.95 },
  { x: 0.18, z: -0.17, drop: 0.7 },
  { x: -0.13, z: 0.18, drop: 1.15 },
  { x: 0.02, z: -0.02, drop: 0.42 },
]

/** Ceiling-mounted fixture: a flush disc or a pendant dome hung from the
 *  ceiling. Floor-anchored group → body offset up in Y to the mount height.
 *  Emissive so it reads as lit. `arrangement: 'cluster'` hangs 3–5 pendants at
 *  staggered drops from one canopy (each cord physically bridges canopy→shade). */
export function CeilingLight({ props }: { props: ParamProps }) {
  const showFixtures = useStore((s) => s.showCeilingFixtures)
  const detail = useDetail()
  const style = readStr(props, 'style', 'pendant')
  const shade = readStr(props, 'shade', 'dome')
  const shadeColor = readStr(props, 'shadeColor', '#f2ead6')
  const arrangement = readStr(props, 'arrangement', 'single')
  const count = Math.max(3, Math.min(5, Math.round(readNum(props, 'count', 4))))
  const mountH = readNum(props, 'mountHeight', 2.55)
  const drop = style === 'pendant' || style === 'linear' ? readNum(props, 'drop', 0.45) : 0
  const fixtureY = mountH - drop
  const shadeRef = useRef<MeshStandardMaterial>(null)
  // Cluster shades share one emissive value; collect their materials to update.
  const clusterRefs = useRef<(MeshStandardMaterial | null)[]>([])
  useFrame(() => {
    const e = fixtureEmissiveIntensity('shade')
    if (shadeRef.current) shadeRef.current.emissiveIntensity = e
    for (const m of clusterRefs.current) if (m) m.emissiveIntensity = e
  })

  if (!showFixtures) return null

  // ── Pendant cluster ──────────────────────────────────────────────────────
  // 3–5 pendants at staggered drops from a single wide canopy. The group sits
  // at the ceiling (mountH); each pendant hangs DOWN (negative Y) so its cord
  // runs from the canopy underside to the shade top — one connected assembly.
  if (arrangement === 'cluster' && style !== 'flush') {
    const pendants = CLUSTER_LAYOUT.slice(0, count)
    clusterRefs.current = []
    return (
      <group position={[0, mountH, 0]}>
        {/* Wide ceiling canopy — every cord descends from it */}
        <mesh position={[0, -0.015, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.03, seg(28, detail)]} />
          <meshStandardMaterial color="#d8d4cc" roughness={0.6} />
        </mesh>
        {pendants.map((p, i) => {
          const shadeTopY = -p.drop
          return (
            <group key={i} position={[p.x, 0, p.z]}>
              {/* Cord: canopy underside (y=−0.03) down to the shade top */}
              <mesh position={[0, (-0.03 + shadeTopY) / 2, 0]}>
                <cylinderGeometry args={[0.005, 0.005, 0.03 - shadeTopY, 6]} />
                <meshStandardMaterial color="#2b2b2b" roughness={0.8} />
              </mesh>
              {/* Shade — hangs at the drop end */}
              <mesh castShadow position={[0, shadeTopY - (shade === 'globe' ? 0.14 : 0.09), 0]}>
                {shade === 'globe' ? (
                  <sphereGeometry args={[0.14, seg(24, detail), seg(16, detail)]} />
                ) : shade === 'cone' ? (
                  <cylinderGeometry args={[0.05, 0.18, 0.18, seg(26, detail), 1, true]} />
                ) : shade === 'drum' ? (
                  <cylinderGeometry args={[0.15, 0.15, 0.15, seg(30, detail), 1, true]} />
                ) : (
                  // dome (default)
                  <sphereGeometry
                    args={[0.15, seg(22, detail), seg(12, detail), 0, Math.PI * 2, 0, Math.PI / 2]}
                  />
                )}
                <meshStandardMaterial
                  ref={(m) => {
                    clusterRefs.current[i] = m
                  }}
                  color={shadeColor}
                  emissive={shadeColor}
                  emissiveIntensity={0.1}
                  roughness={0.6}
                  side={2}
                />
              </mesh>
            </group>
          )
        })}
      </group>
    )
  }

  return (
    <group position={[0, fixtureY, 0]}>
      {/* Ceiling mount: a wide canopy bar for the linear fixture (both cords
          descend from it) or a round rose for the flush/pendant styles. (A
          central round rose left the linear fixture's ±0.45 m cords —and thus
          the whole bar— hanging off nothing.) */}
      {style === 'linear' ? (
        <mesh position={[0, drop + 0.01, 0]}>
          <boxGeometry args={[1.0, 0.02, 0.09]} />
          <meshStandardMaterial color="#d8d4cc" roughness={0.6} />
        </mesh>
      ) : (
        <mesh position={[0, drop + 0.01, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
          <meshStandardMaterial color="#d8d4cc" roughness={0.6} />
        </mesh>
      )}
      {style === 'linear' ? (
        <>
          {/* Two drop cords */}
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, drop / 2, 0]}>
              <cylinderGeometry args={[0.005, 0.005, drop, 6]} />
              <meshStandardMaterial color="#2b2b2b" roughness={0.8} />
            </mesh>
          ))}
          {/* Linear bar housing */}
          <mesh castShadow position={[0, 0, 0]}>
            <boxGeometry args={[1.1, 0.06, 0.09]} />
            <meshStandardMaterial color="#2b2b2b" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Emissive underside (the light) */}
          <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.04, 0.07]} />
            <meshStandardMaterial
              ref={shadeRef}
              color={shadeColor}
              emissive={shadeColor}
              emissiveIntensity={0.1}
              side={2}
            />
          </mesh>
        </>
      ) : style === 'pendant' ? (
        <>
          {/* Cord */}
          <mesh position={[0, drop / 2, 0]}>
            <cylinderGeometry args={[0.005, 0.005, drop, 6]} />
            <meshStandardMaterial color="#2b2b2b" roughness={0.8} />
          </mesh>
          {/* Shade — shape selectable (dome / globe / cone / drum) */}
          <mesh castShadow position={[0, shade === 'globe' ? -0.04 : 0, 0]}>
            {shade === 'globe' ? (
              <sphereGeometry args={[0.16, seg(26, detail), seg(18, detail)]} />
            ) : shade === 'cone' ? (
              <cylinderGeometry args={[0.06, 0.22, 0.22, seg(28, detail), 1, true]} />
            ) : shade === 'drum' ? (
              <cylinderGeometry args={[0.2, 0.2, 0.18, seg(32, detail), 1, true]} />
            ) : (
              // dome (default)
              <sphereGeometry
                args={[0.18, seg(22, detail), seg(12, detail), 0, Math.PI * 2, 0, Math.PI / 2]}
              />
            )}
            <meshStandardMaterial
              ref={shadeRef}
              color={shadeColor}
              emissive={shadeColor}
              emissiveIntensity={0.1}
              roughness={0.6}
              side={2}
            />
          </mesh>
        </>
      ) : (
        // Flush ceiling disc
        <mesh castShadow position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.06, seg(28, detail)]} />
          <meshStandardMaterial
            ref={shadeRef}
            color={shadeColor}
            emissive={shadeColor}
            emissiveIntensity={0.1}
            roughness={0.5}
          />
        </mesh>
      )}
    </group>
  )
}
