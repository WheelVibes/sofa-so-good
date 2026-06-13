import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'
import { fixtureEmissiveIntensity } from '../../scene/lighting/fixtureGlow'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Ceiling-mounted fixture: a flush disc or a pendant dome hung from the
 *  ceiling. Floor-anchored group → body offset up in Y to the mount height.
 *  Emissive so it reads as lit. */
export function CeilingLight({ props }: { props: ParamProps }) {
  const showFixtures = useStore((s) => s.showCeilingFixtures)
  const detail = useDetail()
  const style = readStr(props, 'style', 'pendant')
  const shade = readStr(props, 'shade', 'dome')
  const shadeColor = readStr(props, 'shadeColor', '#f2ead6')
  const mountH = readNum(props, 'mountHeight', 2.55)
  const drop = style === 'pendant' || style === 'linear' ? readNum(props, 'drop', 0.45) : 0
  const fixtureY = mountH - drop
  const shadeRef = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = fixtureEmissiveIntensity('shade')
  })

  if (!showFixtures) return null
  return (
    <group position={[0, fixtureY, 0]}>
      {/* Ceiling rose */}
      <mesh position={[0, drop + 0.01, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
        <meshStandardMaterial color="#d8d4cc" roughness={0.6} />
      </mesh>
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
