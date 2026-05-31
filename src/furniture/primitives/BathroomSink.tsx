import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readStr } from './shared'

/** Bathroom basin with a chrome mixer tap. `style` picks the support: a
 *  classic 'pedestal', a 'vanity' counter cabinet (with doors), or a
 *  'wall-hung' basin on a bottle trap. Faces +Z. */
export function BathroomSink({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1')
  const style = readStr(props, 'style', 'pedestal')
  const cabinetColor = readStr(props, 'cabinetColor', '#8a6b48')
  const cabinetFinish = readStr(props, 'cabinetFinish', 'wood')

  const porcelain = { color, roughness: 0.16, metalness: 0.02 }
  const chrome = { color: '#cdd2d6', roughness: 0.2, metalness: 0.85 }
  const basinY = 0.82

  const tap = (
    <>
      <mesh castShadow position={[0, basinY + 0.13, -0.16]}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 10]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[0, basinY + 0.21, -0.12]} rotation={[0.7, 0, 0]}>
        <cylinderGeometry args={[0.013, 0.013, 0.12, 10]} />
        <meshStandardMaterial {...chrome} />
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
              <meshStandardMaterial {...chrome} />
            </mesh>
          </group>
        ))}
        {/* Counter top with a moulded basin */}
        <mesh castShadow receiveShadow position={[0, cabH + 0.02, 0]}>
          <boxGeometry args={[cw + 0.04, 0.04, cd + 0.04]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        <mesh position={[0, cabH + 0.05, 0.02]}>
          <cylinderGeometry args={[0.17, 0.12, 0.08, 24]} />
          <meshStandardMaterial color="#e2e2de" roughness={0.2} />
        </mesh>
        {tap}
      </group>
    )
  }

  if (style === 'wall-hung') {
    return (
      <group>
        {/* Basin bowl floating at counter height */}
        <mesh castShadow receiveShadow position={[0, basinY, 0]}>
          <cylinderGeometry args={[0.24, 0.18, 0.16, 28]} />
          <meshStandardMaterial {...porcelain} />
        </mesh>
        <mesh position={[0, basinY + 0.04, 0]}>
          <cylinderGeometry args={[0.2, 0.13, 0.1, 28]} />
          <meshStandardMaterial color="#e2e2de" roughness={0.2} />
        </mesh>
        {/* Chrome bottle trap below */}
        <mesh castShadow position={[0, basinY - 0.16, -0.04]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 12]} />
          <meshStandardMaterial {...chrome} />
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
        <cylinderGeometry args={[0.22, 0.16, 0.16, 24]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      <mesh position={[0, basinY + 0.04, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.1, 24]} />
        <meshStandardMaterial color="#e2e2de" roughness={0.2} />
      </mesh>
      {tap}
    </group>
  )
}
