import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Counter-height bar stool. Styles: 'splayed' (round seat on four splayed
 *  legs + footrest ring), 'pedestal' (central column on a weighted disc base,
 *  gas-lift look), and 'backed' (splayed legs + a low curved backrest).
 *  Faces +Z. */
export function BarStool({ props }: { props: ParamProps }) {
  const seatColor = readStr(props, 'seatColor', '#7a5c3c')
  const legColor = readStr(props, 'legColor', '#3a3d42')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'splayed')
  const detail = useDetail()
  const seatH = 0.66
  const r = 0.18

  const seatMat = getSurfaceMaterial(finish, seatColor, 0.5, sheen)
  const metal = { color: legColor, roughness: 0.4, metalness: 0.6 }

  const splayedLegs = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const tx = Math.sin(a) * (r - 0.03)
    const tz = Math.cos(a) * (r - 0.03)
    const bx = Math.sin(a) * (r + 0.06)
    const bz = Math.cos(a) * (r + 0.06)
    const mx = (tx + bx) / 2
    const mz = (tz + bz) / 2
    const lean = Math.atan2(Math.hypot(bx - tx, bz - tz), seatH)
    return (
      <mesh
        key={i}
        castShadow
        position={[mx, seatH / 2, mz]}
        rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
      >
        <cylinderGeometry args={[0.014, 0.014, seatH, 8]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    )
  })

  return (
    <group>
      {/* Seat */}
      <mesh castShadow position={[0, seatH, 0]} material={seatMat}>
        <cylinderGeometry args={[r, r, 0.05, seg(24, detail)]} />
      </mesh>

      {style === 'pedestal' ? (
        <>
          {/* Central column */}
          <mesh castShadow position={[0, seatH / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.035, seatH, seg(16, detail)]} />
            <meshStandardMaterial {...metal} />
          </mesh>
          {/* Weighted disc base */}
          <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
            <cylinderGeometry args={[r + 0.02, r + 0.04, 0.03, seg(28, detail)]} />
            <meshStandardMaterial {...metal} />
          </mesh>
          {/* Footrest ring on the column */}
          <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.1, 0.012, 8, seg(24, detail)]} />
            <meshStandardMaterial {...metal} />
          </mesh>
        </>
      ) : (
        <>
          {splayedLegs}
          {/* Footrest ring */}
          <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r + 0.02, 0.012, 8, seg(24, detail)]} />
            <meshStandardMaterial {...metal} />
          </mesh>
        </>
      )}

      {/* Low curved backrest */}
      {style === 'backed' && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * (r - 0.03), seatH + 0.16, -r + 0.03]}>
              <cylinderGeometry args={[0.01, 0.01, 0.32, 8]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          ))}
          <mesh castShadow position={[0, seatH + 0.3, -r + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r - 0.03, 0.012, 8, seg(16, detail), Math.PI]} />
            <meshStandardMaterial {...metal} />
          </mesh>
        </>
      )}
    </group>
  )
}
