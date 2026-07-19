import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Bidet spray / hand-held health faucet (BSJ-6) — near-universal beside an SG
 * WC. A wall plate feeds a flexible hose that loops down to a trigger spray gun
 * cradled in a wall holster. Wall-mounted (mounted def; offset to `mountHeight`),
 * faces +Z, real metres. The parts connect: plate → holster bracket → spray gun,
 * and the hose hangs from the plate's outlet.
 */
export function BidetSpray({ props }: { props: ParamProps }) {
  const centerY = readNum(props, 'mountHeight', 0.75)
  const bodyColor = readStr(props, 'color', '#d7dade')

  const metal = metalLeg('#cfd2d6', 'stainless')
  const gunMat = getSurfaceMaterial('gloss', bodyColor, 1)
  const hoseMat = metalLeg('#9aa0a6', 'satin')

  const plateProj = 0.02

  return (
    <group position={[0, centerY, 0]}>
      {/* Wall plate + angle-valve outlet */}
      <mesh castShadow position={[0, 0, plateProj / 2]} material={metal}>
        <boxGeometry args={[0.07, 0.11, plateProj]} />
      </mesh>
      <mesh
        castShadow
        position={[0, -0.045, plateProj + 0.02]}
        rotation={[Math.PI / 2, 0, 0]}
        material={metal}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.05, 12]} />
      </mesh>

      {/* Holster bracket (holds the spray gun), offset to the right of the plate */}
      <mesh castShadow position={[0.085, 0.02, plateProj + 0.01]} material={metal}>
        <boxGeometry args={[0.03, 0.05, 0.03]} />
      </mesh>

      {/* Flexible hose: a quarter-torus loop drooping from the outlet toward the gun */}
      <mesh
        position={[0.03, -0.09, plateProj + 0.03]}
        rotation={[0, 0, Math.PI * 0.15]}
        material={hoseMat}
      >
        <torusGeometry args={[0.06, 0.007, 8, 20, Math.PI * 1.1]} />
      </mesh>

      {/* Spray gun cradled in the holster: handle (angled) + trigger head */}
      <group position={[0.085, 0.06, plateProj + 0.03]} rotation={[0, 0, -0.25]}>
        <mesh castShadow position={[0, 0, 0]} material={gunMat}>
          <cylinderGeometry args={[0.014, 0.016, 0.13, 12]} />
        </mesh>
        {/* Trigger head + nozzle at the top */}
        <mesh castShadow position={[0, 0.08, 0.012]} material={metal}>
          <cylinderGeometry args={[0.02, 0.018, 0.03, 12]} />
        </mesh>
        <mesh castShadow position={[0.02, 0.005, 0]} material={gunMat}>
          <boxGeometry args={[0.02, 0.03, 0.012]} />
        </mesh>
      </group>
    </group>
  )
}
