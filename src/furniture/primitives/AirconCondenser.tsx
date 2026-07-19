import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** Outdoor split-system CONDENSER (compressor) — the unit that sits on the HDB
 *  AC ledge / service yard and drives the indoor FCUs (BSJ-2). A floor-standing
 *  slatted box on short feet, facing +Z: a fan-grille circle + horizontal
 *  louvre slats on the front, a side heat-exchanger hint. Real metres, grounded
 *  (feet reach the floor), footprint-centred. */
export function AirconCondenser({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const depth = readNum(props, 'depth', 0.35)
  const height = readNum(props, 'height', 0.66)
  const color = readStr(props, 'color', '#dcdcd6')

  const footH = 0.05
  const bodyH = Math.max(0.2, height - footH)
  const bodyCY = footH + bodyH / 2
  const footInset = 0.06
  const footX = width / 2 - footInset
  const footZ = depth / 2 - footInset
  const fanR = Math.min(bodyH, width) * 0.36
  const fanCY = footH + bodyH * 0.52

  // Horizontal louvre slats across the lower front face.
  const slatCount = 5
  const slatGap = 0.028
  const slatBandTop = footH + bodyH * 0.34
  const slatBandBot = footH + 0.06
  const slatStep = (slatBandTop - slatBandBot) / (slatCount - 1)

  return (
    <group>
      {/* Feet (grounded) */}
      {[
        [footX, footZ],
        [-footX, footZ],
        [footX, -footZ],
        [-footX, -footZ],
      ].map(([fx, fz], i) => (
        <mesh key={`foot-${i}`} position={[fx, footH / 2, fz]} castShadow>
          <boxGeometry args={[0.05, footH, 0.05]} />
          <meshStandardMaterial color="#3f3f3f" roughness={0.8} />
        </mesh>
      ))}

      {/* Main enamel body */}
      <mesh castShadow receiveShadow position={[0, bodyCY, 0]}>
        <boxGeometry args={[width, bodyH, depth]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.15} />
      </mesh>

      {/* Fan-grille recess + spider on the front face */}
      <mesh position={[0, fanCY, depth / 2 + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[fanR, fanR, 0.02, 24]} />
        <meshStandardMaterial color="#c8c8c2" roughness={0.7} />
      </mesh>
      <mesh position={[0, fanCY, depth / 2 + 0.012]}>
        <torusGeometry args={[fanR * 0.82, 0.012, 8, 24]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.6} />
      </mesh>
      <mesh position={[0, fanCY, depth / 2 + 0.01]}>
        <sphereGeometry args={[fanR * 0.14, 12, 8]} />
        <meshStandardMaterial color="#39393b" roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Lower louvre slats (front) */}
      {Array.from({ length: slatCount }, (_, i) => (
        <mesh key={`slat-${i}`} position={[0, slatBandBot + i * slatStep, depth / 2 + 0.002]}>
          <boxGeometry args={[width * 0.62, slatGap, 0.012]} />
          <meshStandardMaterial color="#8f8f88" roughness={0.75} />
        </mesh>
      ))}

      {/* Side heat-exchanger hint (grille lines on the +X face) */}
      <mesh position={[width / 2 + 0.003, bodyCY, 0]}>
        <boxGeometry args={[0.01, bodyH * 0.8, depth * 0.82]} />
        <meshStandardMaterial color="#b7b7b1" roughness={0.85} />
      </mesh>
    </group>
  )
}
