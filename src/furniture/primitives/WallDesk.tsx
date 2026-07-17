import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Wall-mounted desk — a space-saving HDB study-corner worktop that hangs off the
 * wall. Faces +Z (a seated person looks toward −Z / the wall). `style`:
 *  - 'floating' — a thick worktop carried by two angled steel wall braces + a
 *    slim back cleat (no floor contact, cantilevered off the wall);
 *  - 'fold-down' — shown DEPLOYED: the worktop drops down on a piano-hinge batten
 *    along the wall (a chromed hinge rod) and is propped level by two drop legs
 *    reaching the floor at the front.
 * Mounted (attaches to the wall); built at the ~0.75 m worktop height. Real
 * metres, footprint-centred.
 */
export function WallDesk({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const depth = readNum(props, 'depth', 0.5)
  const color = readStr(props, 'color', '#c9b38f')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'floating')
  const foldDown = style === 'fold-down'

  const topH = 0.75
  const topThk = 0.05
  const topY = topH - topThk / 2
  const backZ = -depth / 2
  const frontZ = depth / 2

  const wood = getSurfaceMaterial(finish, color, 1.4, sheen)
  const steel = metalLeg('#8a8d92', 'satin')

  return (
    <group>
      {/* Thick worktop */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, topY, 0]}
        material={wood}
        args={[width, topThk, depth]}
      />

      {foldDown ? (
        <>
          {/* Piano-hinge batten on the wall (the top's back edge rests on it) */}
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, topY - 0.02, backZ + 0.03]}
            material={wood}
            args={[width, 0.08, 0.05]}
          />
          {/* Chromed piano-hinge rod along the batten / top back edge */}
          <mesh
            castShadow
            position={[0, topY - topThk / 2, backZ + 0.055]}
            rotation={[0, 0, Math.PI / 2]}
            material={steel}
          >
            <cylinderGeometry args={[0.012, 0.012, width - 0.04, 10]} />
          </mesh>
          {/* Two drop legs to the floor at the front corners (make it level) */}
          {[-1, 1].map((s) => (
            <BeveledBox
              key={`leg${s}`}
              castShadow
              position={[s * (width / 2 - 0.06), (topH - topThk) / 2, frontZ - 0.06]}
              material={wood}
              args={[0.05, topH - topThk, 0.05]}
            />
          ))}
          {/* Front foot rail tying the two drop legs */}
          <BeveledBox
            castShadow
            position={[0, 0.06, frontZ - 0.06]}
            material={wood}
            args={[width - 0.12, 0.05, 0.05]}
          />
        </>
      ) : (
        <>
          {/* Slim back cleat under the worktop back edge (the wall mount line) */}
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, topY - 0.05, backZ + 0.03]}
            material={wood}
            args={[width, 0.06, 0.05]}
          />
          {/* Two angled steel braces from the wall up to the worktop underside */}
          {[-1, 1].map((s) => {
            const lowZ = backZ + 0.02
            const highZ = frontZ - 0.08
            const lowY = topH - 0.34
            const highY = topY - topThk / 2
            const dz = highZ - lowZ
            const dy = highY - lowY
            const len = Math.hypot(dz, dy)
            const ang = Math.atan2(dz, dy)
            return (
              <mesh
                key={`brace${s}`}
                castShadow
                position={[s * (width / 2 - 0.1), (lowY + highY) / 2, (lowZ + highZ) / 2]}
                rotation={[ang, 0, 0]}
                material={steel}
              >
                <boxGeometry args={[0.04, len, 0.04]} />
              </mesh>
            )
          })}
        </>
      )}
    </group>
  )
}
