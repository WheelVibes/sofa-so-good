import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Cat wall furniture — mounted shelves, steps and a bridge for a wall climbing
 * run (mounted + mountHeight, like the decor wall-shelf). Each is built around a
 * `<group position={[0, mountHeight, 0]}>` sitting flat on the wall and
 * extending forward in +Z. A plush grip pad tops each ledge so a cat reads it as
 * a landing. Real metres; brackets reach back to the wall (structural read).
 */

const PLANK_T = 0.03
const PAD_T = 0.012

/** A single wall ledge: plank + plush grip pad + two under-brackets. */
function ledge(
  wood: ReturnType<typeof getSurfaceMaterial>,
  pad: ReturnType<typeof getFabricMaterial>,
  bracket: ReturnType<typeof metalLeg>,
  width: number,
  depth: number,
  showBrackets = true,
) {
  const bx = width / 2 - 0.07
  return (
    <>
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, 0, depth / 2]}
        material={wood}
        args={[width, PLANK_T, depth]}
      />
      {/* Plush grip pad on top. */}
      <BeveledBox
        receiveShadow
        position={[0, PLANK_T / 2 + PAD_T / 2, depth / 2]}
        material={pad}
        args={[width - 0.03, PAD_T, depth - 0.03]}
      />
      {showBrackets &&
        [-bx, bx].map((x, i) => (
          <mesh
            key={i}
            castShadow
            position={[x, -PLANK_T / 2 - 0.05, depth * 0.35]}
            material={bracket}
          >
            <boxGeometry args={[0.02, 0.1, depth * 0.7]} />
          </mesh>
        ))}
    </>
  )
}

/** Single cat wall shelf. */
export function CatWallShelf({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.5)
  const depth = readNum(props, 'depth', 0.28)
  const centerY = readNum(props, 'mountHeight', 1.3)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const plush = readStr(props, 'plushColor', '#c8bda8')
  const wood = getSurfaceMaterial(finish, color, 1.2)
  const pad = getFabricMaterial(plush, 0.95)
  const bracket = metalLeg('#2b2b2b', 'black-steel')
  return <group position={[0, centerY, 0]}>{ledge(wood, pad, bracket, width, depth)}</group>
}

/** A run of 3–5 small steps rising diagonally across the wall. `mountHeight` is
 *  the lowest step; each subsequent step is `rise` higher and `run` further
 *  along the wall (+X), so a cat can climb corner-to-corner. */
export function CatWallSteps({ props }: { props: ParamProps }) {
  const count = Math.max(3, Math.min(5, Math.round(readNum(props, 'count', 4))))
  const rise = readNum(props, 'rise', 0.28)
  const run = readNum(props, 'run', 0.4)
  const depth = readNum(props, 'depth', 0.26)
  const stepW = readNum(props, 'stepWidth', 0.34)
  const centerY = readNum(props, 'mountHeight', 0.9)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const plush = readStr(props, 'plushColor', '#c8bda8')
  const wood = getSurfaceMaterial(finish, color, 1.2)
  const pad = getFabricMaterial(plush, 0.95)
  const bracket = metalLeg('#2b2b2b', 'black-steel')
  const totalRun = run * (count - 1)
  return (
    <group position={[0, centerY, 0]}>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[-totalRun / 2 + i * run, i * rise, 0]}>
          {ledge(wood, pad, bracket, stepW, depth)}
        </group>
      ))}
    </group>
  )
}

/** Two anchor shelves joined by a slatted bridge span (a cat catwalk). */
export function CatWallBridge({ props }: { props: ParamProps }) {
  const span = readNum(props, 'span', 1.2)
  const depth = readNum(props, 'depth', 0.26)
  const centerY = readNum(props, 'mountHeight', 1.6)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const plush = readStr(props, 'plushColor', '#c8bda8')
  const wood = getSurfaceMaterial(finish, color, 1.2)
  const pad = getFabricMaterial(plush, 0.95)
  const bracket = metalLeg('#2b2b2b', 'black-steel')
  const anchorW = 0.3
  // Bridge runs between the inner edges of the two anchor shelves.
  const innerL = -span / 2 + anchorW / 2
  const innerR = span / 2 - anchorW / 2
  const bridgeLen = Math.max(0.1, innerR - innerL)
  const slatGap = 0.06
  const slatT = 0.022
  const slatN = Math.max(3, Math.round(bridgeLen / slatGap))
  const railY = 0.0
  return (
    <group position={[0, centerY, 0]}>
      {/* Anchor shelves at each end. */}
      <group position={[-span / 2, 0, 0]}>{ledge(wood, pad, bracket, anchorW, depth)}</group>
      <group position={[span / 2, 0, 0]}>{ledge(wood, pad, bracket, anchorW, depth)}</group>
      {/* Two side rails carrying the slats (thin timber rails). */}
      {[-1, 1].map((s) => (
        <BeveledBox
          key={s}
          castShadow
          position={[(innerL + innerR) / 2, railY, depth / 2 + s * (depth / 2 - 0.02)]}
          material={wood}
          args={[bridgeLen, slatT, 0.02]}
        />
      ))}
      {/* Slat treads spanning the two rails. */}
      {Array.from({ length: slatN }).map((_, i) => {
        const x = innerL + (bridgeLen * (i + 0.5)) / slatN
        return (
          <BeveledBox
            key={i}
            castShadow
            receiveShadow
            position={[x, railY + slatT / 2, depth / 2]}
            material={pad}
            args={[slatGap * 0.7, slatT, depth - 0.03]}
          />
        )
      })}
    </group>
  )
}
