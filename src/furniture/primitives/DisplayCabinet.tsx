import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

interface DisplayCabinetProps {
  props: ParamProps
}

/**
 * Glazed display cabinet / vitrine. A slim glass-fronted carcass with wood
 * frame posts, a solid back, glass sides + door, and interior glass shelves.
 * Faces +Z. Real metres, footprint-centred.
 *
 * `style`:
 *  - 'full-glass' (default) — full-height glazing, 4 glass shelves, thin frame.
 *  - 'half'       — glazed upper vitrine over a solid 2-door base cabinet.
 *  - 'wall'       — a compact variant rendered lifted to `mountHeight` (like the
 *    fireplace wall style: the def stays FLOOR-anchored for collision, since a
 *    single static `mounted` flag can't serve the tall floor styles AND a wall
 *    box — see the def note; harness FLOOR_EXEMPT for `display-cabinet::wall`).
 *
 * `lit`: 'yes' adds a warm emissive top-glow strip (an emissive mesh, NOT a
 * registered light emitter — keeps fixture-glow/bloom constants untouched).
 */
export function DisplayCabinet({ props }: DisplayCabinetProps) {
  const width = readNum(props, 'width', 1.0)
  const style = readStr(props, 'style', 'full-glass')
  const lit = readStr(props, 'lit', 'no') === 'yes'
  const frameColor = readStr(props, 'frameColor', '#5a4632')
  const finish = readStr(props, 'finish', 'wood')

  const w = width
  const d = 0.4
  const isWall = style === 'wall'
  const isHalf = style === 'half'
  const h = isWall ? 0.9 : 1.8
  // Wall variant renders lifted so its underside sits at the mount height
  // (bottom of a wall cabinet ≈ 1.1 m). Floor styles sit on the floor.
  const liftY = isWall ? 1.1 : 0

  const postT = 0.03
  const panelT = 0.02
  const glassT = 0.01
  const wood = getSurfaceMaterial(finish, frameColor, 1, 0.1)
  // Base cabinet splits the 'half' style: solid below, glazed above.
  const splitY = isHalf ? 0.82 : panelT

  const glassPane = (
    key: string,
    pos: [number, number, number],
    args: [number, number, number],
  ) => (
    <mesh key={key} position={pos}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color="#cfe0e6"
        roughness={0.06}
        metalness={0}
        transparent
        opacity={0.28}
      />
    </mesh>
  )

  // Glass shelf span: embed a touch into the posts/back so it reads attached.
  const shelfW = w - postT * 1.5
  const shelfD = d - postT - panelT + 0.01
  const shelfZ = (panelT - postT) / 2
  const vitrineBottom = splitY
  const vitrineTop = h - panelT
  const shelfCount = isWall ? 2 : isHalf ? 3 : 4
  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    const y = vitrineBottom + ((vitrineTop - vitrineBottom) * (i + 1)) / (shelfCount + 1)
    return glassPane(`shelf${i}`, [0, y, shelfZ], [shelfW, glassT, shelfD])
  })

  return (
    <group position={[0, liftY, 0]}>
      {/* Four wood corner posts (full height, reach the floor for floor styles) */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <BeveledBox
            key={`post${sx}${sz}`}
            material={wood}
            castShadow
            receiveShadow
            position={[sx * (w / 2 - postT / 2), h / 2, sz * (d / 2 - postT / 2)]}
            args={[postT, h, postT]}
            bevel={0.004}
          />
        )),
      )}
      {/* Top panel */}
      <BeveledBox
        material={wood}
        castShadow
        position={[0, h - panelT / 2, 0]}
        args={[w, panelT, d]}
        bevel={0.006}
      />
      {/* Bottom panel (reaches the floor for floor styles) */}
      <BeveledBox
        material={wood}
        castShadow
        receiveShadow
        position={[0, panelT / 2, 0]}
        args={[w, panelT, d]}
        bevel={0.006}
      />
      {/* Solid back panel */}
      <BeveledBox
        material={wood}
        castShadow
        position={[0, h / 2, -d / 2 + panelT / 2]}
        args={[w - postT, h - panelT, panelT]}
        bevel={0.004}
      />

      {/* Glazed vitrine section: glass sides + front door */}
      {glassPane(
        'sideL',
        [-w / 2 + postT + glassT / 2, (vitrineBottom + vitrineTop) / 2, 0],
        [glassT, vitrineTop - vitrineBottom, d - postT],
      )}
      {glassPane(
        'sideR',
        [w / 2 - postT - glassT / 2, (vitrineBottom + vitrineTop) / 2, 0],
        [glassT, vitrineTop - vitrineBottom, d - postT],
      )}
      {/* Glass door — recessed 4 mm behind the cabinet front plane so its front
          face doesn't sit coplanar with the flush counter/top panels (the 'half'
          style's counter front is at d/2) → no glass-vs-wood z-fight. */}
      {glassPane(
        'door',
        [0, (vitrineBottom + vitrineTop) / 2, d / 2 - glassT / 2 - 0.004],
        [w - postT * 2, vitrineTop - vitrineBottom, glassT],
      )}
      {/* Vertical door pull */}
      <mesh castShadow position={[w / 2 - postT - 0.05, (vitrineBottom + vitrineTop) / 2, d / 2]}>
        <boxGeometry args={[0.018, 0.24, 0.024]} />
        <MetalMaterial color="#8a8d92" roughness={0.35} metalness={0.7} />
      </mesh>
      {shelves}

      {/* Solid base cabinet (half style): counter + two doors + handles */}
      {isHalf && (
        <>
          {/* Counter panel dividing base from vitrine */}
          <BeveledBox
            material={wood}
            castShadow
            position={[0, splitY, 0]}
            args={[w, panelT, d]}
            bevel={0.006}
          />
          {/* Two solid door fronts, proud of the carcass */}
          {[-1, 1].map((s) => (
            <group key={`bd${s}`}>
              <BeveledBox
                material={wood}
                castShadow
                position={[s * (w / 4), splitY / 2 + panelT / 2, d / 2 - 0.006]}
                args={[w / 2 - 0.02, splitY - panelT * 2, 0.018]}
                bevel={0.004}
              />
              <mesh
                castShadow
                position={[s * (w / 4) - s * (w / 4 - 0.04), splitY / 2, d / 2 + 0.02]}
              >
                <boxGeometry args={[0.018, 0.12, 0.022]} />
                <MetalMaterial color="#8a8d92" roughness={0.35} metalness={0.7} />
              </mesh>
            </group>
          ))}
          {/* Solid base side panels */}
          {[-1, 1].map((s) => (
            <BeveledBox
              key={`bs${s}`}
              material={wood}
              castShadow
              position={[s * (w / 2 - postT / 2), splitY / 2 + panelT / 2, 0]}
              args={[postT, splitY - panelT, d - postT]}
              bevel={0.004}
            />
          ))}
        </>
      )}

      {/* Warm interior top-glow strip (emissive mesh only) */}
      {lit && (
        <mesh position={[0, vitrineTop - 0.02, shelfZ]}>
          <boxGeometry args={[w - postT * 2, 0.012, d - postT - 0.04]} />
          <meshStandardMaterial
            color="#5a4a34"
            emissive="#ffcf8f"
            emissiveIntensity={1.4}
            roughness={0.6}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}
