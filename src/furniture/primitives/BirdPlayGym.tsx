import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Bird play gym (parametric) — a small tabletop stand: a moulded tray base, two
 * uprights carrying a top cross-perch, a diagonal ladder between the base and the
 * perch, and a couple of hanging rings. Small footprint (≈0.4×0.3), waist-high.
 * Wood dowels + a metal frame. Floor-anchored, footprint-centred, faces +Z. Real
 * metres; every member connects (uprights reach tray→perch, ladder tied to both).
 */
export function BirdPlayGym({ props }: { props: ParamProps }) {
  const woodColor = readStr(props, 'color', '#b98f5e')
  const frameColor = readStr(props, 'frameColor', '#3a3d42')
  const detail = useDetail()
  const r = seg(8, detail)

  const w = 0.42
  const d = 0.28
  const trayH = 0.03
  const gymH = 0.4
  const perchY = trayH + gymH
  const wood = getSurfaceMaterial('wood', woodColor, 1)
  const frame = metalLeg(frameColor, 'satin')
  const perchHalf = w * 0.42

  // Ladder rungs climbing from tray to perch on the −Z side.
  const rungs = 5

  return (
    <group>
      {/* Tray base. */}
      <mesh
        castShadow
        receiveShadow
        position={[0, trayH / 2, 0]}
        material={getSurfaceMaterial('painted', '#2b2d31', 1)}
      >
        <boxGeometry args={[w, trayH, d]} />
      </mesh>
      {/* Two uprights. */}
      {[-perchHalf, perchHalf].map((x, i) => (
        <mesh key={`up${i}`} castShadow position={[x, trayH + gymH / 2, 0]} material={frame}>
          <cylinderGeometry args={[0.01, 0.01, gymH, r]} />
        </mesh>
      ))}
      {/* Top cross-perch (wood dowel). */}
      <mesh castShadow position={[0, perchY, 0]} rotation={[0, 0, Math.PI / 2]} material={wood}>
        <cylinderGeometry args={[0.011, 0.011, w * 0.94, r]} />
      </mesh>
      {/* Diagonal ladder side-rails + rungs on the front-ish side. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`rail${s}`}
          castShadow
          position={[s * 0.06, trayH + gymH / 2, d * 0.28]}
          rotation={[Math.atan2(d * 0.2, gymH), 0, 0]}
          material={wood}
        >
          <cylinderGeometry args={[0.006, 0.006, Math.hypot(gymH, d * 0.2), 6]} />
        </mesh>
      ))}
      {Array.from({ length: rungs }).map((_, i) => {
        const f = (i + 0.5) / rungs
        const y = trayH + gymH * f
        const z = d * 0.28 + (0.5 - f) * d * 0.2
        return (
          <mesh
            key={`rung${i}`}
            castShadow
            position={[0, y, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={wood}
          >
            <cylinderGeometry args={[0.005, 0.005, 0.12, 5]} />
          </mesh>
        )
      })}
      {/* Two hanging rings under the perch. */}
      {[-0.12, 0.13].map((x, i) => (
        <mesh
          key={`ring${i}`}
          castShadow
          position={[x, perchY - 0.07, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={frame}
        >
          <torusGeometry args={[0.045, 0.004, 5, r * 2]} />
        </mesh>
      ))}
    </group>
  )
}
