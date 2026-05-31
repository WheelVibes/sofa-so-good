import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** Pleated floor-length curtains on a rod. `style: 'drawn'` covers the
 *  window with evenly gathered pleats; 'open' ties the fabric back into two
 *  bunched panels at the ends, leaving the centre clear. Mounted against a
 *  wall (faces +Z). */
export function Curtain({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.8)
  const height = readNum(props, 'height', 2.3)
  const color = readStr(props, 'color', '#c4b9a6')
  const style = readStr(props, 'style', 'drawn')
  const pattern = readStr(props, 'pattern', 'plain')
  const fabricMat = getFabricMaterial(color, 0.95, pattern)

  const rod = (
    <>
      <mesh position={[0, height + 0.04, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, width + 0.2, 10]} />
        <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.1), height + 0.04, 0.02]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </>
  )

  if (style === 'open') {
    // Two gathered panels bunched at each end, with a fabric tieband.
    const panelW = width * 0.2
    const innerPleats = 5
    return (
      <group>
        {rod}
        {[-1, 1].map((s) => {
          const cx = s * (width / 2 - panelW / 2)
          return (
            <group key={s}>
              {Array.from({ length: innerPleats }, (_, i) => {
                const lx = cx - panelW / 2 + (panelW / innerPleats) * (i + 0.5)
                const z = 0.04 + Math.sin(i * 1.9) * 0.04 // deeper gather
                return (
                  <mesh key={i} castShadow position={[lx, height / 2, z]} material={fabricMat}>
                    <boxGeometry args={[(panelW / innerPleats) * 1.5, height, 0.07]} />
                  </mesh>
                )
              })}
              {/* Tieback band, cinched at ~⅔ height */}
              <mesh position={[cx, height * 0.42, 0.08]} material={fabricMat}>
                <boxGeometry args={[panelW * 0.9, 0.08, 0.12]} />
              </mesh>
            </group>
          )
        })}
      </group>
    )
  }

  const pleats = Math.max(6, Math.round(width / 0.14))
  const step = width / pleats
  return (
    <group>
      {rod}
      {Array.from({ length: pleats }, (_, i) => {
        const x = -width / 2 + step / 2 + i * step
        const z = Math.sin(i * 1.7) * 0.035
        return (
          <mesh key={i} castShadow position={[x, height / 2, z]} material={fabricMat}>
            <boxGeometry args={[step * 1.25, height, 0.04]} />
          </mesh>
        )
      })}
    </group>
  )
}
