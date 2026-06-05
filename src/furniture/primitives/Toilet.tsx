import type { ParamProps } from '../types'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** WC. `style: 'close-coupled'` is a two-piece pedestal bowl + cistern;
 *  'wall-hung' floats the bowl off an in-wall cistern panel with a flush
 *  plate. Faces +Z (cistern/panel at −Z, against the wall). */
export function Toilet({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1')
  const detail = useDetail()
  const style = readStr(props, 'style', 'close-coupled')
  const porcelain = { color, roughness: 0.18, metalness: 0.02 }

  if (style === 'wall-hung') {
    const bowlY = 0.42 // floating bowl height (rim ~0.43m)
    return (
      <group>
        {/* In-wall cistern panel against the back wall */}
        <mesh castShadow receiveShadow position={[0, 0.55, -0.24]}>
          <boxGeometry args={[0.5, 1.1, 0.14]} />
          <meshStandardMaterial color="#eef0f1" roughness={0.4} metalness={0.02} />
        </mesh>
        {/* Dual flush plate */}
        <mesh position={[0, 0.95, -0.165]}>
          <boxGeometry args={[0.18, 0.13, 0.01]} />
          <meshStandardMaterial color="#d6d9dc" roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Floating bowl */}
        <mesh castShadow position={[0, bowlY, 0.04]}>
          <cylinderGeometry args={[0.2, 0.14, 0.16, seg(24, detail)]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        {/* Seat ring + raised lid */}
        <mesh castShadow position={[0, bowlY + 0.09, 0.04]}>
          <torusGeometry args={[0.16, 0.032, seg(10, detail), seg(24, detail)]} />
          <meshStandardMaterial color="#ffffff" roughness={0.25} />
        </mesh>
        <mesh position={[0, bowlY + 0.12, -0.12]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.34, 0.02, 0.18]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0.04]}>
        <cylinderGeometry args={[0.13, 0.17, 0.36, seg(18, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Bowl */}
      <mesh castShadow position={[0, 0.38, 0.06]}>
        <cylinderGeometry args={[0.2, 0.16, 0.14, seg(20, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Seat ring */}
      <mesh castShadow position={[0, 0.45, 0.06]}>
        <torusGeometry args={[0.16, 0.035, seg(10, detail), seg(22, detail)]} />
        <meshStandardMaterial color="#ffffff" roughness={0.25} />
      </mesh>
      {/* Lid back */}
      <mesh position={[0, 0.47, -0.14]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.34, 0.02, 0.18]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Cistern */}
      <mesh castShadow position={[0, 0.55, -0.22]}>
        <boxGeometry args={[0.38, 0.4, 0.16]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Flush button */}
      <mesh position={[0, 0.76, -0.22]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#c0c4c8" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  )
}
