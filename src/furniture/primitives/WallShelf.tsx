import type { ReactNode } from 'react'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/** Wall shelf — wall-mounted, sits flat against the wall behind it (group
 *  offset to the mount height) and extends forward in +Z. Styles:
 *  'bracket' (a plank on two visible L-brackets), 'floating' (a thick solid
 *  slab, no visible brackets / hidden cleat), 'ledge' (a picture ledge with a
 *  raised front lip rail to stop leaning frames sliding off), 'corner' (an
 *  L-plan board hugging two walls of a room corner), and 'twotier' (two
 *  stacked planks joined by short end panels). Pair with tabletop decor. */
export function WallShelf({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8)
  const depth = readNum(props, 'depth', 0.22)
  const centerY = readNum(props, 'mountHeight', 1.4)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'bracket')

  const plankT = 0.035
  const wood = getSurfaceMaterial(finish, color, 1.2, sheen)
  const bx = width / 2 - 0.08
  const bracketColor = '#2b2b2b'

  const plank = (y: number, t = plankT) => (
    <BeveledBox
      castShadow
      receiveShadow
      position={[0, y, depth / 2]}
      material={wood}
      args={[width, t, depth]}
    />
  )

  let body: ReactNode
  if (style === 'floating') {
    // Thick solid slab — no visible brackets (hidden cleat), reads as a chunky
    // floating shelf. A single connected member.
    body = plank(0, 0.055)
  } else if (style === 'ledge') {
    // Picture ledge: a shallow plank with a raised front lip rail so leaning
    // frames don't slide off. Lip overlaps the plank's top front edge.
    const lipH = 0.03
    const lipT = 0.014
    body = (
      <>
        {plank(0)}
        <BeveledBox
          castShadow
          position={[0, plankT / 2 + lipH / 2, depth - lipT / 2]}
          material={wood}
          args={[width, lipH, lipT]}
        />
      </>
    )
  } else if (style === 'corner') {
    // L-plan corner shelf hugging two walls of a room corner: a long back arm
    // spanning the width along the back wall + a short side arm running forward
    // along the left wall. The arms overlap at the corner block (one member).
    const armD = Math.max(0.16, depth * 0.82)
    const sideLen = Math.min(width * 0.7, 0.6)
    body = (
      <>
        {/* Back arm along the back wall */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, 0, armD / 2]}
          material={wood}
          args={[width, plankT, armD]}
        />
        {/* Side arm running forward along the left wall */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[-width / 2 + armD / 2, 0, sideLen / 2]}
          material={wood}
          args={[armD, plankT, sideLen]}
        />
      </>
    )
  } else if (style === 'twotier') {
    // Two stacked planks joined by short end panels.
    body = (
      <>
        {plank(0.16)}
        {plank(-0.16)}
        {[-bx, bx].map((x, i) => (
          <BeveledBox
            key={i}
            castShadow
            position={[x, 0, depth * 0.55]}
            material={wood}
            args={[0.025, 0.32, depth * 0.85]}
          />
        ))}
      </>
    )
  } else {
    // 'bracket' (default): a single plank on two visible L-brackets.
    body = (
      <>
        {plank(0)}
        {[-bx, bx].map((x, i) => (
          <group key={i}>
            <mesh castShadow position={[x, -0.06, 0.012]}>
              <boxGeometry args={[0.02, 0.1, 0.02]} />
              <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
            </mesh>
            <mesh castShadow position={[x, -plankT / 2 - 0.01, depth * 0.35]}>
              <boxGeometry args={[0.02, 0.02, depth * 0.6]} />
              <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
            </mesh>
          </group>
        ))}
      </>
    )
  }

  return <group position={[0, centerY, 0]}>{body}</group>
}
