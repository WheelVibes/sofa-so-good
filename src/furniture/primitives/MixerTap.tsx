import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Kitchen / basin mixer tap (BSJ-6) — a standalone counter-mounted mixer, the
 * selectable fitting that was previously only baked into the kitchen-island
 * faucet. A round deck flange → straight riser → curved gooseneck spout, with a
 * single side lever. Reuses the same brushed-metal approach as `KitchenIsland`'s
 * faucet. Floor-anchored (deck flange at y=0 so it sits on a counter/basin when
 * placed), footprint-centred, faces +Z, real metres.
 */
export function MixerTap({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 0.3)
  const finish = readStr(props, 'finish', 'stainless') // 'stainless' | 'satin' | 'black-steel' | 'brushed-brass'
  const color = readStr(props, 'color', '#cfd2d6')

  const metal = metalLeg(
    color,
    finish === 'satin' || finish === 'black-steel' || finish === 'brushed-brass'
      ? finish
      : 'stainless',
  )

  const riserR = 0.014
  const spoutReach = Math.min(0.16, height * 0.55)
  const flangeTop = 0.016

  return (
    <group>
      {/* Deck flange */}
      <mesh castShadow position={[0, flangeTop / 2, 0]} material={metal}>
        <cylinderGeometry args={[0.028, 0.032, flangeTop, 16]} />
      </mesh>
      {/* Straight riser up to the spout height */}
      <mesh castShadow position={[0, (height + flangeTop) / 2, 0]} material={metal}>
        <cylinderGeometry args={[riserR, riserR, height - flangeTop, 16]} />
      </mesh>
      {/* Rounded elbow so the riser→spout join isn't a hard coplanar corner */}
      <mesh castShadow position={[0, height, 0]} material={metal}>
        <sphereGeometry args={[riserR, 12, 12]} />
      </mesh>
      {/* Horizontal spout arm reaching forward (+Z) */}
      <mesh
        castShadow
        position={[0, height, spoutReach / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={metal}
      >
        <cylinderGeometry args={[riserR, riserR, spoutReach, 16]} />
      </mesh>
      {/* Nozzle pointing down at the spout tip */}
      <mesh castShadow position={[0, height - 0.02, spoutReach]} material={metal}>
        <cylinderGeometry args={[0.012, 0.014, 0.04, 12]} />
      </mesh>
      {/* Side lever handle */}
      <mesh
        castShadow
        position={[riserR + 0.028, height * 0.55, 0]}
        rotation={[0, 0, 0.35]}
        material={metal}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.08, 10]} />
      </mesh>
    </group>
  )
}
