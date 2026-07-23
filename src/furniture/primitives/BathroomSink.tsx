import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Bathroom basin with a chrome mixer tap. `style` picks the support: a
 *  classic 'pedestal', a 'vanity' counter cabinet (with doors), or a
 *  'wall-hung' basin on a bottle trap. Faces +Z. */
export function BathroomSink({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1')
  const detail = useDetail()
  const style = readStr(props, 'style', 'pedestal')
  const cabinetColor = readStr(props, 'cabinetColor', '#8a6b48')
  const cabinetFinish = readStr(props, 'cabinetFinish', 'wood')

  const porcelain = { color, roughness: 0.16, metalness: 0.02 }
  // Tap + trap route through the shared brushed-metal material (satin so the
  // small fitting reads as light steel, not a black mirror of the dark floor).
  const chromeMat = metalLeg('#d2d6da', 'satin')
  const pullProps = { color: '#cdd2d6', roughness: 0.2, metalness: 0.85 }
  const basinY = 0.82

  // Mixer: a vertical body rising from the deck (base bottom ≈0.78, so it sits ON
  // the counter/basin rim for every style) + an arched spout over the bowl.
  const tap = (
    <>
      <mesh castShadow position={[0, basinY + 0.06, -0.15]} material={chromeMat}>
        <cylinderGeometry args={[0.016, 0.018, 0.2, 12]} />
      </mesh>
      <mesh
        castShadow
        position={[0, basinY + 0.17, -0.08]}
        rotation={[0.7, 0, 0]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.013, 0.013, 0.17, 12]} />
      </mesh>
    </>
  )

  if (style === 'vanity') {
    const cw = 0.6
    const cd = 0.46
    const cabH = basinY - 0.04
    const cabMat = getSurfaceMaterial(cabinetFinish, cabinetColor, 1.2, 0)
    return (
      <group>
        {/* Cabinet carcass */}
        <mesh castShadow receiveShadow position={[0, cabH / 2, 0]} material={cabMat}>
          <boxGeometry args={[cw, cabH, cd]} />
        </mesh>
        {/* Two doors with bar pulls */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh castShadow position={[s * cw * 0.24, cabH / 2, cd / 2 + 0.004]} material={cabMat}>
              <boxGeometry args={[cw * 0.46, cabH - 0.06, 0.02]} />
            </mesh>
            <mesh position={[s * 0.03, cabH / 2, cd / 2 + 0.02]}>
              <boxGeometry args={[0.014, (cabH - 0.06) * 0.5, 0.018]} />
              <meshStandardMaterial {...pullProps} />
            </mesh>
          </group>
        ))}
        {/* Counter top with a moulded basin */}
        <mesh castShadow receiveShadow position={[0, cabH + 0.02, 0]}>
          <boxGeometry args={[cw + 0.04, 0.04, cd + 0.04]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        <mesh position={[0, cabH + 0.05, 0.02]}>
          <cylinderGeometry args={[0.17, 0.12, 0.08, seg(24, detail)]} />
          <meshStandardMaterial color="#e2e2de" roughness={0.2} />
        </mesh>
        {tap}
      </group>
    )
  }

  if (style === 'wall-hung') {
    // Boxy rectangular basin (~0.58×0.44, per the reference wall-hung basin —
    // a straight-edged ceramic box, not a rounded bowl) with a sunken deck
    // recess and the shared chrome tap mixer on top. A slim white ceramic
    // pedestal/bottle-trap shroud runs floor→basin-underside (the reference's
    // concealed trap column), keeping the assembly floor-connected even
    // though the def itself renders at mount height (FLOOR_EXEMPT).
    const basinW = 0.58
    const basinD = 0.44
    const basinH = 0.14
    const shroudH = basinY - basinH / 2
    return (
      <group>
        {/* Rectangular ceramic basin box */}
        <mesh castShadow receiveShadow position={[0, basinY, 0]}>
          <boxGeometry args={[basinW, basinH, basinD]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        {/* Sunken bowl recess in the deck — top set 4 mm below the basin's own
            rim face (the aircon proud/inset pattern) so the two same-normal
            faces don't share an exact plane and z-fight. */}
        <mesh position={[0, basinY + basinH / 2 - 0.019, 0]}>
          <boxGeometry args={[basinW - 0.09, 0.03, basinD - 0.12]} />
          <meshStandardMaterial color="#e2e2de" roughness={0.2} />
        </mesh>
        {/* Slim white pedestal/bottle-trap shroud, floor-anchored to the
            basin's underside */}
        <mesh castShadow receiveShadow position={[0, shroudH / 2, -0.06]}>
          <boxGeometry args={[0.11, shroudH, 0.11]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        {tap}
      </group>
    )
  }

  // Pedestal (default)
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, basinY / 2, -0.02]}>
        <cylinderGeometry args={[0.09, 0.13, basinY, 16]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      <mesh castShadow position={[0, basinY, 0]}>
        <cylinderGeometry args={[0.22, 0.16, 0.16, seg(24, detail)]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      <mesh position={[0, basinY + 0.04, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.1, seg(24, detail)]} />
        <meshStandardMaterial color="#e2e2de" roughness={0.2} />
      </mesh>
      {tap}
    </group>
  )
}
