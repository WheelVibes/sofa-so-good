import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Cat window perch (`windowBound`) — a plush sill-level lounging shelf that
 * snaps to a window and sits AT the sill (it never covers the glass). Placement
 * supplies `width` (fit to the opening) and `sillY` (the sill height) via
 * `windowSnap.ts:windowFixtureProps`, so like the mesh screen the primitive is
 * built in the wall plane: X across the opening at the sill, projecting forward
 * into the room (+Z) by `depth`, with two support brackets angling from the
 * front underside back down onto the wall below the sill (structural read).
 * Real metres; internal-mounted.
 */
export function CatWindowPerch({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7)
  const sillY = readNum(props, 'sillY', 0.9)
  const depth = readNum(props, 'depth', 0.32)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const plush = readStr(props, 'plushColor', '#c8bda8')

  const wood = getSurfaceMaterial(finish, color, 1.2)
  const pad = getFabricMaterial(plush, 0.95)
  const bracketMat = metalLeg('#3a3d42', 'black-steel')

  const plankT = 0.028
  const padT = 0.02
  const zInset = 0.03 // small stand-off from the glass, projecting into the room
  const halfW = width / 2

  // Bracket geometry: a diagonal strut from the front-underside of the perch
  // down to the wall a little below the sill. Length + tilt from the run/rise.
  const run = depth * 0.7
  const rise = 0.26
  const strutLen = Math.hypot(run, rise)
  const tilt = Math.atan2(rise, run) // angle of the strut from horizontal
  const bx = halfW - 0.08

  return (
    <group>
      {/* Perch plank at sill height, projecting into the room. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, sillY + plankT / 2, zInset + depth / 2]}
        material={wood}
        args={[width, plankT, depth]}
      />
      {/* Plush cushion on top. */}
      <BeveledBox
        receiveShadow
        position={[0, sillY + plankT + padT / 2, zInset + depth / 2]}
        material={pad}
        args={[width - 0.03, padT, depth - 0.03]}
      />
      {/* Two brackets angling from the front underside back to the wall. */}
      {[-bx, bx].map((x, i) => (
        <mesh
          key={i}
          castShadow
          position={[x, sillY - rise / 2, zInset + run / 2]}
          rotation={[-tilt, 0, 0]}
          material={bracketMat}
        >
          <boxGeometry args={[0.022, strutLen, 0.02]} />
        </mesh>
      ))}
    </group>
  )
}
