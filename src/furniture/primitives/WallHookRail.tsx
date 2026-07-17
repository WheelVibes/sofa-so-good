import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/** Wall-mounted coat/hook rail — an HDB entry + service-yard staple. A slim
 *  wooden mounting board carrying a row of hooks. Its group is offset to the
 *  mount height (floor-anchored origin); the board sits flat against the wall
 *  and the hooks project into the room (+Z). `style`: 'rail' (metal J-hooks on
 *  a board) or 'pegs' (a row of turned Shaker wooden pegs). The hooks/pegs
 *  socket into the board front so the whole rail is one connected assembly.
 *  `hooks` = number of hooks (3–8). Real metres. */
export function WallHookRail({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8)
  const mountH = readNum(props, 'mountHeight', 1.6)
  const count = Math.max(3, Math.min(8, Math.round(readNum(props, 'hooks', 5))))
  const boardColor = readStr(props, 'color', '#6f553f')
  const finish = readStr(props, 'finish', 'wood')
  const hookColor = readStr(props, 'hookColor', '#2b2d31')
  const style = readStr(props, 'style', 'rail')

  const boardH = 0.11
  const boardT = 0.02
  const boardFront = boardT // board spans z 0 → boardT (against the wall, into room)
  const wood = getSurfaceMaterial(finish, boardColor, 1.2)
  const metal = metalLeg(hookColor, 'satin')
  const pegMat = getSurfaceMaterial('wood', boardColor, 1.0)

  // Even hook spacing, inset from the board ends.
  const usable = width - 0.12
  const hookXs = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -usable / 2 + (usable / (count - 1)) * i,
  )

  return (
    <group position={[0, mountH, 0]}>
      {/* Mounting board — flat against the wall, spanning the width */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, 0, boardFront / 2]}
        material={wood}
        args={[width, boardH, boardT]}
      />
      {hookXs.map((x, i) =>
        style === 'pegs' ? (
          // Turned Shaker peg: a tapered dowel projecting forward + a ball tip.
          <group key={i} position={[x, -0.005, boardFront]}>
            <mesh
              castShadow
              position={[0, 0.006, 0.03]}
              rotation={[Math.PI / 2, 0, 0]}
              material={pegMat}
            >
              <cylinderGeometry args={[0.011, 0.014, 0.075, 12]} />
            </mesh>
            <mesh castShadow position={[0, 0.012, 0.07]} material={pegMat}>
              <sphereGeometry args={[0.016, 12, 10]} />
            </mesh>
          </group>
        ) : (
          // Metal J-hook: a forward stem off the board + a rising/descending tip.
          <group key={i} position={[x, 0.01, boardFront]}>
            {/* Back plate socketing into the board */}
            <mesh castShadow position={[0, 0, -0.004]} material={metal}>
              <boxGeometry args={[0.02, 0.05, 0.012]} />
            </mesh>
            {/* Forward stem */}
            <mesh castShadow position={[0, -0.012, 0.03]} material={metal}>
              <boxGeometry args={[0.012, 0.012, 0.062]} />
            </mesh>
            {/* Descending hook tip */}
            <mesh castShadow position={[0, -0.032, 0.055]} material={metal}>
              <boxGeometry args={[0.012, 0.05, 0.012]} />
            </mesh>
            {/* Up-turned catch at the tip */}
            <mesh castShadow position={[0, -0.05, 0.066]} material={metal}>
              <boxGeometry args={[0.012, 0.012, 0.024]} />
            </mesh>
          </group>
        ),
      )}
    </group>
  )
}
