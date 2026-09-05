import { CatmullRomCurve3, Vector3 } from 'three'
import { useFeature } from '../../features/useFeature'
import { getSurfaceMaterial, getTiledSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { metalLeg, readNum, readStr } from './shared'

/** Worktop height (cabinet + top) — the mixer's deck plane. Kept next to the
 *  tap geometry so every part below reads as an absolute height, like the rest
 *  of this primitive. */
const DECK_Y = 0.9
/** Deck z of the tap: on the worktop rail BEHIND the bowl cutout (the rail
 *  spans z [-0.30, -0.20]), which is where a real deck-mounted mixer lands. */
const TAP_Z = -0.25
/** Top of the Ø26 mm riser (0.19 m above the deck). */
const RISER_TOP = DECK_Y + 0.19

/**
 * KITCHEN-DETAIL — swan-neck spout path, in the tap's own frame (x = 0 at the
 * riser axis). It STARTS INSIDE the riser (y 1.06 < the 1.09 riser top) so the
 * two are structurally one body, rises to ~0.30 m above the deck, reaches
 * ~0.20 m forward over the bowl centre, and finishes in a short vertical drop
 * that the aerator ring caps.
 */
const SPOUT_CURVE = new CatmullRomCurve3([
  new Vector3(0, DECK_Y + 0.16, TAP_Z),
  new Vector3(0, DECK_Y + 0.25, TAP_Z),
  new Vector3(0, DECK_Y + 0.3, TAP_Z + 0.05),
  new Vector3(0, DECK_Y + 0.3, TAP_Z + 0.16),
  new Vector3(0, DECK_Y + 0.26, TAP_Z + 0.2),
  new Vector3(0, DECK_Y + 0.22, TAP_Z + 0.2),
])
/** End of the spout drop — where the aerator ring sits. */
const SPOUT_END = SPOUT_CURVE.points[SPOUT_CURVE.points.length - 1]

/**
 * Single-lever deck-mounted kitchen mixer (KITCHEN-DETAIL): escutcheon, riser,
 * swan-neck spout, aerator ring and a side lever — 6 meshes over ONE shared
 * cached chrome material. Drawn in the counter's frame at this counter's own
 * deck/bowl heights, offset to the sink's x by the caller's group. Replaces the
 * three stacked cylinders (a bent rod) that stood in for a tap before v0.33.
 *
 * Deliberately NOT the standalone `MixerTap` primitive (`primitives/MixerTap.tsx`,
 * the selectable `mixer-tap` fitting): that one is floor-anchored at y=0 with its
 * own height/finish params so a user can drop it anywhere, and its silhouette is
 * the pre-v0.33 riser+elbow+arm. This is the counter's built-in tap, pinned to
 * `DECK_Y`/the bowl centre and gated on `kitchenDetail`.
 */
function SinkMixer() {
  const chrome = metalLeg('#dfe3e7', 'stainless')
  return (
    <group>
      {/* Ø50 x 8 mm escutcheon on the worktop */}
      <mesh castShadow position={[0, DECK_Y + 0.004, TAP_Z]} material={chrome}>
        <cylinderGeometry args={[0.025, 0.025, 0.008, 20]} />
      </mesh>
      {/* Ø26 mm riser, up from inside the escutcheon */}
      <mesh castShadow position={[0, (DECK_Y + 0.004 + RISER_TOP) / 2, TAP_Z]} material={chrome}>
        <cylinderGeometry args={[0.013, 0.013, RISER_TOP - DECK_Y - 0.004, 16]} />
      </mesh>
      {/* Ø20 mm swan-neck spout, starting inside the riser top */}
      <mesh castShadow material={chrome}>
        <tubeGeometry args={[SPOUT_CURVE, 32, 0.01, 12, false]} />
      </mesh>
      {/* Ø24 mm aerator ring capping the drop */}
      <mesh castShadow position={[0, SPOUT_END.y - 0.005, SPOUT_END.z]} material={chrome}>
        <cylinderGeometry args={[0.012, 0.012, 0.014, 16]} />
      </mesh>
      {/* Side lever: a Ø12 mm stem out of the riser + a 0.10 m paddle */}
      <mesh
        castShadow
        position={[0.02, RISER_TOP - 0.02, TAP_Z]}
        rotation={[0, 0, Math.PI / 2]}
        material={chrome}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.04, 12]} />
      </mesh>
      <mesh castShadow position={[0.085, RISER_TOP - 0.018, TAP_Z]} material={chrome}>
        <boxGeometry args={[0.1, 0.016, 0.022]} />
      </mesh>
    </group>
  )
}

interface KitchenCounterProps {
  props: ParamProps
}

/** KITCHEN-DETAIL — metres of real wall covered by ONE texture period of the
 *  backsplash tile. The `subway` painter lays 4 x 8 tiles per period, so 0.6 m
 *  gives ~150 x 75 mm running-bond metro tile; the square `tile` painter lays
 *  2 x 2, giving ~300 x 300 mm.
 *
 *  A PHYSICAL period, not a panel-relative one: tile is a product with a fixed
 *  size, so `getTiledSurfaceMaterial` (repeat = 1/period over the metre UVs
 *  `furnitureBoxUv` gives every parametric part) is right here where
 *  `getSurfaceMaterialForBox`'s grain-scale sizing — which shrinks the tile as
 *  the run gets longer — is not. Measured on the 2.6 m default run: 151.5 x
 *  75.8 mm tiles with a ~3 mm joint, i.e. ~17.2 tiles along the run (the end
 *  tiles are cut, as they are in a real installation). */
const BACKSPLASH_TILE_METRES = 0.6
/** Warm off-white glazed ceramic — the default HDB kitchen backsplash. */
const BACKSPLASH_TILE_COLOR = '#e9e6df'

/**
 * Kitchen counter primitive: base cabinet + countertop. When `hasSink`
 * is on, a recessed basin and a single-lever mixer tap are drawn. The counter
 * extends along +X (`length`) and has a fixed depth of 0.6 m.
 */
export function KitchenCounter({ props }: KitchenCounterProps) {
  const length = readNum(props, 'length', 2.4)
  const hasSink = readStr(props, 'hasSink', 'no') === 'yes'
  const color = readStr(props, 'color', '#e3dfd6')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const frontStyle = readStr(props, 'frontStyle', 'slab')
  const worktopColor = readStr(props, 'worktopColor', '#34373d')
  const worktopFinish = readStr(props, 'worktopFinish', 'solid')
  // KITCHEN-DETAIL: real tiled backsplash + a single-lever mixer tap. Flag off
  // (or `backsplashFinish: 'solid'`) renders exactly the pre-v0.33 slab + rod.
  const detail = useFeature('kitchenDetail')
  const backsplashFinish = readStr(props, 'backsplashFinish', 'subway')
  const tiledBacksplash = detail && (backsplashFinish === 'subway' || backsplashFinish === 'tile')
  const backsplashDims: [number, number, number] = [length, 0.48, 0.015]
  const backsplashMat = tiledBacksplash
    ? getTiledSurfaceMaterial(backsplashFinish, BACKSPLASH_TILE_COLOR, BACKSPLASH_TILE_METRES)
    : null

  const depth = 0.6
  const cabinetH = 0.85
  const topThickness = 0.05
  const totalH = cabinetH + topThickness
  const cabMat = getSurfaceMaterial(finish, color, 1, sheen)
  const worktopMat =
    worktopFinish === 'solid' ? null : getSurfaceMaterial(worktopFinish, worktopColor, 2, 0.3)
  const handleMat = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const

  // Cabinet fronts along the base run.
  const cabs = Math.max(1, Math.round(length / 0.6))
  const cabGap = 0.012
  const cabW = (length - cabGap * (cabs + 1)) / cabs
  const frontH = cabinetH - 0.06

  const renderFront = (x: number, i: number) => {
    if (frontStyle === 'drawers') {
      // Three stacked drawer fronts with horizontal bar pulls.
      const rows = 3
      const dh = (frontH - 0.02 * (rows - 1)) / rows
      return (
        <group key={i}>
          {Array.from({ length: rows }, (_, r) => {
            const y = 0.03 + dh / 2 + r * (dh + 0.02)
            return (
              <group key={r}>
                <BeveledBox
                  position={[x, y, depth / 2 - 0.005]}
                  material={cabMat}
                  args={[cabW, dh, 0.016]}
                />
                <mesh position={[x, y, depth / 2 + 0.01]}>
                  <boxGeometry args={[cabW * 0.4, 0.016, 0.018]} />
                  <MetalMaterial {...handleMat} />
                </mesh>
              </group>
            )
          })}
        </group>
      )
    }
    return (
      <group key={i}>
        <BeveledBox
          position={[x, cabinetH / 2, depth / 2 - 0.005]}
          material={cabMat}
          args={[cabW, frontH, 0.016]}
        />
        {/* Shaker rails: a recessed panel framed by four thin proud borders */}
        {frontStyle === 'shaker' &&
          [
            [0, frontH / 2 - 0.05, cabW - 0.08, 0.05],
            [0, -frontH / 2 + 0.05, cabW - 0.08, 0.05],
            [-cabW / 2 + 0.04, 0, 0.05, frontH - 0.16],
            [cabW / 2 - 0.04, 0, 0.05, frontH - 0.16],
          ].map(([dx, dy, bw, bh], k) => (
            <mesh
              key={k}
              position={[x + dx, cabinetH / 2 + dy, depth / 2 + 0.004]}
              material={cabMat}
            >
              <boxGeometry args={[bw, bh, 0.01]} />
            </mesh>
          ))}
        <mesh
          position={[x + (i % 2 ? -1 : 1) * (cabW / 2 - 0.04), cabinetH - 0.12, depth / 2 + 0.01]}
        >
          <boxGeometry args={[0.018, 0.12, 0.018]} />
          <MetalMaterial {...handleMat} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Base cabinet */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, cabinetH / 2, 0]}
        material={cabMat}
        args={[length, cabinetH, depth]}
      />
      {/* Cabinet fronts (slab / shaker / drawers) */}
      {Array.from({ length: cabs }, (_, i) => {
        const x = -length / 2 + cabGap + cabW / 2 + i * (cabW + cabGap)
        return renderFront(x, i)
      })}
      {/* Sink cutout geometry (shared by the countertop frame + the basin). */}
      {(() => {
        // Computed up here so the countertop can be built as a frame around the
        // opening when a sink is present.
        const ow = 0.54 // cutout width
        const od = 0.4 // cutout depth
        const sx = Math.min(
          Math.max(length * 0.25, -length / 2 + ow / 2 + 0.05),
          length / 2 - ow / 2 - 0.05,
        )
        const topY = cabinetH + topThickness / 2
        const topMat = (
          <meshStandardMaterial color={worktopColor} roughness={0.22} metalness={0.15} />
        )
        const topMesh = (key: string, x: number, z: number, w: number, d: number) => (
          <BeveledBox
            key={key}
            castShadow
            receiveShadow
            position={[x, topY, z]}
            material={worktopMat ?? undefined}
            args={[w, topThickness, d]}
          >
            {worktopMat ? null : topMat}
          </BeveledBox>
        )

        // Worktop: a single slab, or a frame around the sink cutout.
        const leftW = sx - ow / 2 + length / 2
        const rightW = length / 2 - (sx + ow / 2)
        const railD = (depth - od) / 2
        const worktop = !hasSink ? (
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, topY, 0]}
            material={worktopMat ?? undefined}
            args={[length, topThickness, depth]}
          >
            {worktopMat ? null : topMat}
          </BeveledBox>
        ) : (
          <group>
            {leftW > 0.002 && topMesh('l', -length / 2 + leftW / 2, 0, leftW, depth)}
            {rightW > 0.002 && topMesh('r', length / 2 - rightW / 2, 0, rightW, depth)}
            {topMesh('b', sx, -depth / 2 + railD / 2, ow, railD)}
            {topMesh('f', sx, depth / 2 - railD / 2, ow, railD)}
          </group>
        )

        // Open-topped stainless basin recessed into the cutout. The rim sits
        // just below the worktop surface and the bowl outer walls are inset
        // from the cutout edges, so no face is coplanar with the worktop (the
        // old basin was a solid box whose top face sat exactly on the worktop
        // surface → z-fighting + it read as a grey block, not a sink).
        const steel = { color: '#b7bdc2', roughness: 0.25, metalness: 0.8 } as const
        const bw = 0.52
        const bd = 0.38
        const wallT = 0.02
        const rimY = totalH - 0.008
        const floorY = cabinetH + 0.02 // bowl floor just above the cabinet top
        const wallH = rimY - floorY
        const wallCY = floorY + wallH / 2
        const walls: [number, number, number, number][] = [
          [-bw / 2 + wallT / 2, 0, wallT, bd],
          [bw / 2 - wallT / 2, 0, wallT, bd],
          [0, -bd / 2 + wallT / 2, bw, wallT],
          [0, bd / 2 - wallT / 2, bw, wallT],
        ]
        return (
          <group>
            {worktop}
            {/* Tiled backsplash up the wall behind the run (countertop → uppers).
                KITCHEN-DETAIL: a real glazed-ceramic tile finish whose period is
                derived from the run's WORLD width, so the grout lines are the
                same size on a 1.2 m and a 4 m run. */}
            {backsplashMat ? (
              <mesh
                receiveShadow
                position={[0, totalH + 0.24, -depth / 2 + 0.012]}
                material={backsplashMat}
              >
                <boxGeometry args={backsplashDims} />
              </mesh>
            ) : (
              <mesh receiveShadow position={[0, totalH + 0.24, -depth / 2 + 0.012]}>
                <boxGeometry args={backsplashDims} />
                <meshStandardMaterial color="#e4e7e3" roughness={0.3} metalness={0.05} />
              </mesh>
            )}
            {hasSink && (
              <group>
                {/* Bowl floor */}
                <mesh receiveShadow position={[sx, floorY, 0]}>
                  <boxGeometry args={[bw - wallT * 2, 0.016, bd - wallT * 2]} />
                  <MetalMaterial {...steel} />
                </mesh>
                {/* Bowl walls */}
                {walls.map(([dx, dz, w, d], k) => (
                  <mesh key={k} receiveShadow position={[sx + dx, wallCY, dz]}>
                    <boxGeometry args={[w, wallH, d]} />
                    <MetalMaterial {...steel} />
                  </mesh>
                ))}
                {/* Ø90 mm basket strainer in the bowl floor (KITCHEN-DETAIL) */}
                {detail && (
                  <mesh
                    receiveShadow
                    position={[sx, floorY + 0.011, 0]}
                    material={metalLeg('#4b5157', 'black-steel')}
                  >
                    <cylinderGeometry args={[0.045, 0.045, 0.006, 24]} />
                  </mesh>
                )}
                {/* Tap. KITCHEN-DETAIL draws a real single-lever mixer; with the
                    flag off it stays the pre-v0.33 base + riser + bent rod. */}
                {detail ? (
                  <group position={[sx, 0, 0]}>
                    <SinkMixer />
                  </group>
                ) : (
                  <group>
                    <mesh castShadow position={[sx, totalH + 0.02, -0.15]}>
                      <cylinderGeometry args={[0.03, 0.035, 0.04, 12]} />
                      <MetalMaterial {...steel} />
                    </mesh>
                    <mesh castShadow position={[sx, totalH + 0.15, -0.15]}>
                      <cylinderGeometry args={[0.014, 0.014, 0.26, 10]} />
                      <MetalMaterial {...steel} />
                    </mesh>
                    <mesh
                      castShadow
                      position={[sx, totalH + 0.27, -0.08]}
                      rotation={[Math.PI / 2.2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.013, 0.013, 0.18, 10]} />
                      <MetalMaterial {...steel} />
                    </mesh>
                  </group>
                )}
              </group>
            )}
          </group>
        )
      })()}
    </group>
  )
}
