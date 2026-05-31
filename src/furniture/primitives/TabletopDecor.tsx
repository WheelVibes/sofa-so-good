import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** A small styling vignette for surfaces (coffee tables, consoles, shelves):
 *  a stacked pair of books, a short vase with a sprig, and a tray. Sits at
 *  `surfaceHeight`. */
export function TabletopDecor({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const bookColor = readStr(props, 'bookColor', '#8a5a3c')
  const vaseColor = readStr(props, 'vaseColor', '#cfd3d6')

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Tray */}
      <mesh receiveShadow position={[0, 0.006, 0]}>
        <boxGeometry args={[0.34, 0.012, 0.22]} />
        <meshStandardMaterial color="#5a4a38" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Stacked books */}
      <mesh castShadow position={[-0.08, 0.04, 0.02]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.18, 0.04, 0.13]} />
        <meshStandardMaterial color={bookColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[-0.07, 0.075, -0.01]} rotation={[0, -0.1, 0]}>
        <boxGeometry args={[0.16, 0.03, 0.12]} />
        <meshStandardMaterial color="#3b5a6b" roughness={0.8} />
      </mesh>
      {/* Vase */}
      <mesh castShadow position={[0.1, 0.07, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.13, 14]} />
        <meshStandardMaterial color={vaseColor} roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Sprig */}
      <mesh castShadow position={[0.1, 0.17, 0]}>
        <icosahedronGeometry args={[0.05, 1]} />
        <meshStandardMaterial color="#4f6b43" roughness={0.85} flatShading />
      </mesh>
    </group>
  )
}
