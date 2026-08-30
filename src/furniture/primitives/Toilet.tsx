import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** WC. `style: 'close-coupled'` is a two-piece pedestal bowl + cistern;
 *  'wall-hung' floats the bowl off an in-wall cistern panel with a flush
 *  plate. Faces +Z (cistern/panel at −Z, against the wall). The seat ring +
 *  lid lie FLAT on the bowl rim (horizontal torus).
 *
 *  Projection: both styles span the def's full 0.66 m footprint depth — a real
 *  close-coupled WC projects 0.65–0.70 m from the wall and a wall-hung pan
 *  0.49–0.55 m past its panel. The pan used to stop at 0.545 m overall (≈0.12 m
 *  short), so the fitting read undersized against a to-scale bath. */
/** Z-stretch that turns the pan's circular section into a realistic oval (the
 *  wall-hung style, where the cistern adds no depth of its own). */
const PAN_OVAL = 1.2

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
        <BeveledBox args={[0.5, 1.1, 0.18]} castShadow receiveShadow position={[0, 0.55, -0.24]}>
          <meshStandardMaterial color="#eef0f1" roughness={0.4} metalness={0.02} />
        </BeveledBox>
        {/* Dual flush plate */}
        <BeveledBox args={[0.18, 0.13, 0.01]} bevel={0.002} position={[0, 0.95, -0.145]}>
          <MetalMaterial color="#d6d9dc" roughness={0.3} metalness={0.5} />
        </BeveledBox>
        {/* Pan: OVAL, not round — a real wall-hung pan is ~0.36 W x 0.50 D and
            projects ~0.48 m past the cistern panel, so a circular bowl at the
            0.40 m footprint width would be a fifth too shallow. One Z-scaled
            group stretches the bowl + seat + lid together (local Z positions are
            pre-divided by the scale), and the pan's back abuts the panel face at
            z = −0.15 with no floating gap. */}
        <group scale={[1, 1, PAN_OVAL]} position={[0, 0, 0]}>
          {/* Floating bowl */}
          <mesh castShadow position={[0, bowlY, 0.09 / PAN_OVAL]}>
            <cylinderGeometry args={[0.2, 0.14, 0.16, seg(24, detail)]} />
            <meshStandardMaterial {...porcelain} />
          </mesh>
          {/* Seat ring lying flat on the rim */}
          <mesh
            castShadow
            position={[0, bowlY + 0.085, 0.09 / PAN_OVAL]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.155, 0.028, seg(10, detail), seg(24, detail)]} />
            <meshStandardMaterial {...seatMat} />
          </mesh>
          {/* Closed lid resting on the seat */}
          <mesh castShadow position={[0, bowlY + 0.105, 0.09 / PAN_OVAL]}>
            <cylinderGeometry args={[0.185, 0.185, 0.02, seg(28, detail)]} />
            <meshStandardMaterial {...seatMat} />
          </mesh>
        </group>
      </group>
    )
  }

  return (
    <group>
      {/* Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0.07]}>
        <cylinderGeometry args={[0.13, 0.17, 0.36, seg(18, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Cistern — rests on the bowl's back shelf (overlaps the bowl in Z) */}
      <BeveledBox args={[0.38, 0.42, 0.26]} bevel={0.016} castShadow position={[0, 0.52, -0.2]}>
        <meshStandardMaterial {...porcelain} />
      </BeveledBox>
      {/* Bowl */}
      <mesh castShadow position={[0, 0.38, 0.13]}>
        <cylinderGeometry args={[0.2, 0.16, 0.14, seg(20, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Seat ring lying flat on the rim */}
      <mesh castShadow position={[0, 0.455, 0.145]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.155, 0.03, seg(10, detail), seg(22, detail)]} />
        <meshStandardMaterial {...seatMat} />
      </mesh>
      {/* Closed lid resting on the seat */}
      <mesh castShadow position={[0, 0.475, 0.145]}>
        <cylinderGeometry args={[0.185, 0.185, 0.02, seg(26, detail)]} />
        <meshStandardMaterial {...seatMat} />
      </mesh>
      {/* Flush button */}
      <mesh position={[0, 0.735, -0.2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <MetalMaterial color="#c0c4c8" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  )
}
