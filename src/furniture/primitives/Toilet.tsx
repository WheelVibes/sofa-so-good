import type { ParamProps } from '../types'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** WC. `style: 'close-coupled'` is a two-piece pedestal bowl + cistern;
 *  'wall-hung' floats the bowl off an in-wall cistern panel with a flush
 *  plate. Faces +Z (cistern/panel at −Z, against the wall). The seat ring +
 *  lid lie FLAT on the bowl rim (horizontal torus). */
export function Toilet({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1')
  const detail = useDetail()
  const style = readStr(props, 'style', 'close-coupled')
  const porcelain = { color, roughness: 0.18, metalness: 0.02 }
  const seatMat = { color: '#ffffff', roughness: 0.25, metalness: 0.02 }

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
        {/* Seat ring lying flat on the rim */}
        <mesh castShadow position={[0, bowlY + 0.085, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.155, 0.028, seg(10, detail), seg(24, detail)]} />
          <meshStandardMaterial {...seatMat} />
        </mesh>
        {/* Closed lid resting on the seat */}
        <mesh castShadow position={[0, bowlY + 0.105, 0.05]}>
          <cylinderGeometry args={[0.185, 0.185, 0.02, seg(28, detail)]} />
          <meshStandardMaterial {...seatMat} />
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
      {/* Cistern — rests on the bowl's back shelf (overlaps the bowl in Z) */}
      <mesh castShadow position={[0, 0.52, -0.2]}>
        <boxGeometry args={[0.38, 0.42, 0.18]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Bowl */}
      <mesh castShadow position={[0, 0.38, 0.06]}>
        <cylinderGeometry args={[0.2, 0.16, 0.14, seg(20, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Seat ring lying flat on the rim */}
      <mesh castShadow position={[0, 0.455, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.155, 0.03, seg(10, detail), seg(22, detail)]} />
        <meshStandardMaterial {...seatMat} />
      </mesh>
      {/* Closed lid resting on the seat */}
      <mesh castShadow position={[0, 0.475, 0.07]}>
        <cylinderGeometry args={[0.185, 0.185, 0.02, seg(26, detail)]} />
        <meshStandardMaterial {...seatMat} />
      </mesh>
      {/* Flush button */}
      <mesh position={[0, 0.735, -0.2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#c0c4c8" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  )
}
