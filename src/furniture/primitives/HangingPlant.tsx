import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Ceiling-hung trailing plant — a pot on three cords with cascading foliage.
 * Mounted: the group offsets up to `mountHeight` (the pot hangs below). Adds
 * vertical greenery (biophilic). Faces down; symmetric.
 */
export function HangingPlant({ props }: { props: ParamProps }) {
  const mountH = readNum(props, 'mountHeight', 2.45)
  const drop = readNum(props, 'drop', 0.4)
  const potColor = readStr(props, 'potColor', '#cdbb9a')
  const leafColor = readStr(props, 'leafColor', '#4a7a44')
  const size = readStr(props, 'size', 'medium')

  const potR = size === 'large' ? 0.16 : 0.12
  const potH = potR * 1.1
  const potY = mountH - drop
  const trail = size === 'large' ? 0.7 : 0.5
  const leafMat = { color: leafColor, roughness: 0.85, metalness: 0 } as const

  return (
    <group>
      {/* Three hanging cords to the pot rim */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * potR * 0.8, potY + drop / 2, Math.sin(a) * potR * 0.8]}
            rotation={[0, 0, Math.cos(a) * 0.18]}
          >
            <cylinderGeometry args={[0.004, 0.004, drop, 5]} />
            <meshStandardMaterial color="#8a7f6a" roughness={0.9} />
          </mesh>
        )
      })}
      {/* Pot */}
      <mesh castShadow position={[0, potY, 0]}>
        <cylinderGeometry args={[potR, potR * 0.8, potH, 16]} />
        <meshStandardMaterial color={potColor} roughness={0.8} />
      </mesh>
      {/* Mounded foliage on top */}
      <mesh castShadow position={[0, potY + potH / 2 + 0.05, 0]}>
        <sphereGeometry args={[potR * 1.3, 14, 10]} />
        <meshStandardMaterial {...leafMat} />
      </mesh>
      {/* Trailing vines (cascading cones of foliage) */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3
        const len = trail * (0.7 + (i % 3) * 0.18)
        return (
          <mesh
            key={`v${i}`}
            castShadow
            position={[Math.cos(a) * potR * 0.7, potY - len / 2, Math.sin(a) * potR * 0.7]}
            rotation={[Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]}
          >
            <coneGeometry args={[0.04, len, 6]} />
            <meshStandardMaterial {...leafMat} />
          </mesh>
        )
      })}
    </group>
  )
}
