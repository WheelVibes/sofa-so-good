import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  type Mesh,
  type MeshStandardMaterial,
  ShapeUtils,
  Vector2,
} from 'three'
import { useFeature } from '../features/useFeature'
import { traceBuildingOutline, type WallSeg } from '../floorplan/footprint'
import { levelAsPlan, type PlanLevel, visibleLevels } from '../floorplan/levels'
import { planWallThickness, type WallBox, wallBoxes } from '../floorplan/planGeometry'
import { resolvePlanRoomCeiling, resolvePlanRoomFloor } from '../floorplan/roomFinishes'
import { isSlopedWall, slopedWallHeights, slopedWallTriangles } from '../floorplan/slopedWall'
import {
  DEFAULT_PLAN_WALL_COLOR,
  type FloorPlan,
  type PlanRoom,
  type PlanVec2,
  type PlanWall,
  planBounds,
  wallLength,
} from '../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../floorplan/wallArc'
import { BeveledBox } from '../furniture/primitives/BeveledBox'
import { GLASS_SKYCATCH_COLOR, glassSkyCatchIntensity } from '../materials/materialRealism'
import type { MaterialId } from '../materials/types'
import { getFixtureGlow } from '../scene/lighting/fixtureGlow'
import { useStore } from '../state/store'
import { PlanRoomCeiling } from './floor/PlanRoomCeiling'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { PlanDoorLeaf } from './PlanDoorLeaf'
import {
  cameraFacingNormal,
  orientOutward,
  pointInRooms,
  type RoomRect,
  wallRevealFactor,
} from './walls/wallRevealMath'

// Window glass day/night tint — clear cool pane by day, dark reflective at night
// (matches the fixed apartment's Window.tsx so custom + default plans look alike).
const GLASS_DAY = new Color('#bcd4e6')
const GLASS_NIGHT = new Color('#20272f')

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
/** Camera-facing reveal factor (1 = opaque, ~0 = faded) for a wall/opening box.
 *  Per-wall and shape-independent: a wall fades when the camera sits on its
 *  OUTWARD side (between the camera and the rooms). "Outward" is found by probing
 *  which side of the box is a room (`isInterior`), so it's correct on
 *  non-rectangular plans (L/U/notched) where the bounding-box centre is an
 *  unreliable reference; it falls back to "away from the plan centre" only when
 *  the probe is ambiguous. `angle` is the box's Y-rotation; the box's broad faces
 *  (the wall surfaces) have the XZ normal (cos a, −sin a). */
function revealFactor(
  camera: { position: { x: number; z: number } },
  px: number,
  pz: number,
  angle: number,
  isInterior: (x: number, z: number) => boolean,
  probe: number,
  cx: number,
  cz: number,
  interior: boolean,
): number {
  const candNx = Math.cos(angle)
  const candNz = -Math.sin(angle)
  let nx = candNx
  let nz = candNz
  if (interior) {
    // Interior partition (rooms on both sides): fade when the camera faces it.
    const f = cameraFacingNormal(px, pz, candNx, candNz, camera.position.x, camera.position.z)
    nx = f.nx
    nz = f.nz
  } else {
    const out = orientOutward(px, pz, candNx, candNz, isInterior, probe)
    if (out) {
      nx = out.nx
      nz = out.nz
    } else if (nx * (px - cx) + nz * (pz - cz) < 0) {
      nx = -nx
      nz = -nz
    }
  }
  return wallRevealFactor(camera.position.x, camera.position.z, px, pz, nx, nz, cx, cz)
}

/** Interior room rectangles (+ L-extensions) for a level, for the point-in-room
 *  outward probe. Polygon rooms fall back to their origin/width/depth bounds. */
function levelRoomRects(rooms: readonly PlanRoom[]): RoomRect[] {
  return rooms.map((r) => ({
    x: r.origin[0],
    z: r.origin[1],
    w: r.width,
    d: r.depth,
    ext: r.extension
      ? {
          x: r.origin[0] + r.extension.offset[0],
          z: r.origin[1] + r.extension.offset[1],
          w: r.extension.width,
          d: r.extension.depth,
        }
      : undefined,
  }))
}

/** Target opacity (1 = solid, →0.15/0 = faded) for a wall box given the current
 *  reveal mode + scope — shared by the wall body and its skirting so they fade
 *  together. Returns 1 when the wall doesn't participate / mode is opaque. */
function planWallRevealTarget(
  camera: { position: { x: number; z: number } },
  cameraMode: string,
  box: WallBox,
  isExterior: boolean,
  isInterior: (x: number, z: number) => boolean,
  cx: number,
  cz: number,
): number {
  const st = useStore.getState()
  const revealEnabled = st.qualityOverrides.wallReveal ?? true
  const revealMode = st.wallRevealMode ?? 'translucent'
  const revealScope = st.wallRevealScope ?? 'exterior'
  const participates = isExterior || revealScope === 'all'
  if (!(participates && cameraMode === 'orbit' && revealEnabled && revealMode !== 'opaque'))
    return 1
  const probe = box.thickness / 2 + 0.3
  const f = revealFactor(camera, box.cx, box.cz, box.angle, isInterior, probe, cx, cz, !isExterior)
  return revealMode === 'auto-hide' ? f : Math.max(0.15, f)
}

function FadeWall({
  box,
  cx,
  cz,
  color,
  isExterior,
  isInterior,
}: {
  box: WallBox
  cx: number
  cz: number
  color: string
  /** True for external/perimeter walls; interior partitions only fade in the
   *  'all' reveal scope. */
  isExterior: boolean
  /** Point-in-room test used to orient each wall's outward normal. */
  isInterior: (x: number, z: number) => boolean
}) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    const target = planWallRevealTarget(camera, cameraMode, box, isExterior, isInterior, cx, cz)
    mat.opacity += (target - mat.opacity) * 0.18
    const next = mat.opacity < 0.98
    // Toggling `transparent` at runtime needs a recompile for the blend to
    // engage (see WallSegment); flip needsUpdate only on the transition.
    if (next !== mat.transparent) mat.needsUpdate = true
    mat.transparent = next
    mat.depthWrite = mat.opacity > 0.6
    // frameloop="demand": keep rendering until the fade settles (else it freezes
    // mid-fade when the camera stops).
    if (Math.abs(mat.opacity - target) > 0.005) invalidate()
  })
  return (
    <mesh
      ref={ref}
      position={[box.cx, box.cy, box.cz]}
      rotation={[0, box.angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[box.thickness, box.height, box.length]} />
      <meshStandardMaterial color={color} roughness={0.9} transparent opacity={1} />
    </mesh>
  )
}

/** Fade a wall-trim mesh (skirting / crown) in lockstep with its host wall box,
 *  so the wall reveals floor-to-ceiling as ONE piece (and fully hides in auto-hide
 *  mode) instead of leaving an opaque trim band. Shares `planWallRevealTarget`
 *  with `FadeWall`. */
function useTrimFade(
  ref: React.RefObject<Mesh | null>,
  box: WallBox,
  isExterior: boolean,
  isInterior: (x: number, z: number) => boolean,
  cx: number,
  cz: number,
) {
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    if (!mat) return
    const target = planWallRevealTarget(camera, cameraMode, box, isExterior, isInterior, cx, cz)
    mat.opacity += (target - mat.opacity) * 0.18
    const next = mat.opacity < 0.98
    if (next !== mat.transparent) mat.needsUpdate = true
    mat.transparent = next
    mat.depthWrite = mat.opacity > 0.6
    mesh.visible = mat.opacity > 0.02
    if (Math.abs(mat.opacity - target) > 0.005) invalidate()
  })
}

/** A skirting strip that fades/hides with its host wall (floor trim). */
function FadeSkirting({
  box,
  height,
  color,
  isExterior,
  isInterior,
  cx,
  cz,
}: {
  box: WallBox
  height: number
  color: string
  isExterior: boolean
  isInterior: (x: number, z: number) => boolean
  cx: number
  cz: number
}) {
  const ref = useRef<Mesh>(null)
  useTrimFade(ref, box, isExterior, isInterior, cx, cz)
  return (
    <BeveledBox
      ref={ref}
      position={[box.cx, height / 2, box.cz]}
      rotation={[0, box.angle, 0]}
      receiveShadow
      args={[box.thickness + 0.024, height, box.length]}
    >
      <meshStandardMaterial color={color} roughness={0.7} transparent opacity={1} />
    </BeveledBox>
  )
}

/** Crown molding at the wall–ceiling junction that fades/hides with its host wall
 *  (ceiling trim) — so a faded wall reveals floor-to-ceiling with no opaque band
 *  left at the top. */
function FadeCrown({
  box,
  ceilingHeight,
  isExterior,
  isInterior,
  cx,
  cz,
}: {
  box: WallBox
  ceilingHeight: number
  isExterior: boolean
  isInterior: (x: number, z: number) => boolean
  cx: number
  cz: number
}) {
  const ref = useRef<Mesh>(null)
  useTrimFade(ref, box, isExterior, isInterior, cx, cz)
  return (
    <BeveledBox
      ref={ref}
      position={[box.cx, ceilingHeight - 0.035, box.cz]}
      rotation={[0, box.angle, 0]}
      args={[box.thickness + 0.024, 0.07, box.length]}
    >
      <meshStandardMaterial
        color="#eeece6"
        roughness={0.55}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        transparent
        opacity={1}
      />
    </BeveledBox>
  )
}

/**
 * Lightweight 3D shell for a user-authored floor plan: a grounding slab,
 * neutral per-room floors, and extruded walls with door/window openings (plus
 * glass panes in windows). Used in place of the curated <Apartment/> when a
 * non-default plan is active, so custom apartments are furnishable in 3D.
 * Multi-storey plans (F13) render one `PlanLevelShell` per visible level,
 * each offset by its elevation; the View menu's level control filters via
 * `visibleLevels` (storeys unmount when hidden, so picking can't hit them).
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const wallColor = plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR
  const [ew, ed] = planBounds(plan)
  const levels = visibleLevels(plan, viewLevelId)

  return (
    <group>
      {/* No grounding slab: each room draws its own floor (PlanRoomFloor), so a
          slab would only add a bare grey pad protruding past the walls. The
          curated flat (Apartment.tsx) likewise has none — kept consistent. */}
      {levels.map((level) => (
        <group key={level.id} position={[0, level.elevation, 0]}>
          {level.elevation > 0 ? <LevelSlab level={level} /> : null}
          <PlanLevelShell plan={plan} level={level} wallColor={wallColor} cx={ew / 2} cz={ed / 2} />
        </group>
      ))}
    </group>
  )
}

/** Floor slab under an upper storey (bbox of its rooms; top at local y=0). */
function LevelSlab({ level }: { level: PlanLevel }) {
  const rects = level.rooms.map((r) => [r.origin[0], r.origin[1], r.width, r.depth] as const)
  if (rects.length === 0) return null
  const x0 = Math.min(...rects.map((r) => r[0])) - 0.15
  const z0 = Math.min(...rects.map((r) => r[1])) - 0.15
  const x1 = Math.max(...rects.map((r) => r[0] + r[2])) + 0.15
  const z1 = Math.max(...rects.map((r) => r[1] + r[3])) + 0.15
  return (
    <mesh position={[(x0 + x1) / 2, -0.125, (z0 + z1) / 2]} castShadow receiveShadow>
      <boxGeometry args={[x1 - x0, 0.25, z1 - z0]} />
      <meshStandardMaterial color="#b9b4ab" roughness={0.9} />
    </mesh>
  )
}

/** One storey's floors / ceilings / walls / openings, in level-local space
 *  (the parent group applies the elevation offset). All geometry helpers run
 *  on the `levelAsPlan` pseudo-plan, so ground + upper levels share one path. */
function PlanLevelShell({
  plan,
  level,
  wallColor,
  cx,
  cz,
}: {
  plan: FloorPlan
  level: PlanLevel
  wallColor: string
  cx: number
  cz: number
}) {
  const finishes = useStore((s) => s.finishes)
  const crownMolding = useFeature('crownMolding')
  const lp = useMemo(() => levelAsPlan(plan, level), [plan, level])

  // Point-in-room test for this storey, used to orient each wall's "outward"
  // normal so the reveal fade works on non-rectangular / notched custom plans
  // (where a single bounding-box centre mis-judges off-centre walls).
  const isInterior = useMemo(() => {
    const rects = levelRoomRects(lp.rooms)
    return (x: number, z: number) => pointInRooms(x, z, rects, 0.05)
  }, [lp])

  // Pair each render box with whether its source wall is an external/perimeter
  // wall: only those fade for the camera reveal (internal partitions stay solid
  // so the room layout reads clearly), matching the default flat's WallSegment.
  const boxes = useMemo(
    () =>
      lp.walls.flatMap((w) =>
        wallBoxes(lp, w).map((box) => ({
          box,
          isExterior: w.thickness === 'external',
          // Per-wall paint colour override (elementColors), else the plan default.
          color: w.color ?? wallColor,
        })),
      ),
    [lp, wallColor],
  )

  // Skirting strips along floor-reaching wall spans, carrying each wall's
  // optional per-wall baseboard override (PARITY-BASEBOARD): height + colour, or
  // hidden. Built per wall (not from the flattened `boxes`) so the override is
  // in scope; defaults match the shell skirting (0.09 m, off-white).
  const skirtings = useMemo(() => {
    const out: { box: WallBox; height: number; color: string; isExterior: boolean }[] = []
    for (const w of lp.walls) {
      const bb = w.baseboard
      if (bb?.hidden) continue
      const height = bb?.height && bb.height > 0 ? bb.height : 0.09
      const color = bb?.color ?? '#eceae4'
      const isExterior = w.thickness === 'external'
      for (const box of wallBoxes(lp, w)) {
        if (box.cy - box.height / 2 < 0.01) out.push({ box, height, color, isExterior })
      }
    }
    return out
  }, [lp])

  // Window glass panes (between sill and head, in the wall gap).
  const windows = useMemo(() => {
    return lp.openings
      .filter((o) => o.kind === 'window')
      .map((o) => {
        const wall = lp.walls.find((w) => w.id === o.wallId)
        // Curved + sloped walls host openings too — the glass sits at the
        // opening's mid-arc point (curved) or wall midpoint (straight/sloped).
        if (!wall) return null
        const s = o.offset + o.width / 2
        let cx: number
        let cz: number
        let angle: number
        if (isCurvedWall(wall)) {
          const p = pointAtArcLength(wall, s)
          cx = p.x
          cz = p.z
          angle = p.angle
        } else {
          const len = wallLength(wall)
          if (len === 0) return null
          const dx = (wall.end[0] - wall.start[0]) / len
          const dz = (wall.end[1] - wall.start[1]) / len
          angle = Math.atan2(dx, dz)
          cx = wall.start[0] + dx * s
          cz = wall.start[1] + dz * s
        }
        return {
          id: o.id,
          cx,
          cz,
          cy: (o.sill + o.head) / 2,
          width: o.width,
          height: o.head - o.sill,
          angle,
          revealable: wall.thickness === 'external',
          // Optional per-window glass tint (elementColors); absent = cool default.
          glassTint: o.color,
          // Optional window style (openingStyles): plain / grille / louvre.
          style: o.style,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [lp])

  return (
    <group>
      {/* Neutral fallback ground over walled-in floor with no room — fills the
          void left by the removed grounding slab (the red un-roomed flag is in
          the 2D editor, not here). */}
      <UnroomedFloor walls={lp.walls} />

      {/* Per-room floors (catalog finish, defaulting to oak); click-to-enter
          works on every storey (the room editor is level-aware, ML5). */}
      {lp.rooms.map((r) => {
        const mat = resolvePlanRoomFloor(finishes, r) as MaterialId
        const roomId = r.id
        // Per-room floor-texture transform (SweetHome3DJS scale/angle parity).
        const texTransform =
          r.floorTexScale || r.floorTexAngle
            ? { scale: r.floorTexScale, angle: r.floorTexAngle }
            : undefined
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomFloor
              key={r.id}
              roomId={roomId}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              polygon={r.polygon}
              materialId={mat}
              texTransform={texTransform}
            />
          )
        }
        return (
          <group key={r.id}>
            <PlanRoomFloor
              roomId={roomId}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              materialId={mat}
              texTransform={texTransform}
            />
            {r.extension && (
              <PlanRoomFloor
                roomId={roomId}
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                materialId={mat}
                texTransform={texTransform}
              />
            )}
          </group>
        )
      })}

      {/* Per-room ceilings (downward-facing — seen in walk, culled in orbit).
          Honour a per-room override, falling back to the level/plan height. */}
      {lp.rooms.map((r) => {
        const h = r.ceilingHeight ?? lp.ceilingHeight
        const ceilMat = resolvePlanRoomCeiling(finishes, r)
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomCeiling
              key={r.id}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              height={h}
              polygon={r.polygon}
              ceiling={r.ceiling}
              materialId={ceilMat}
            />
          )
        }
        return (
          <group key={r.id}>
            <PlanRoomCeiling
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              height={h}
              ceiling={r.ceiling}
              materialId={ceilMat}
            />
            {/* An L-extension keeps a plain flat ceiling — the treatment applies
                to the main rectangle only. The finish covers it too. */}
            {r.extension && (
              <PlanRoomCeiling
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                height={h}
                materialId={ceilMat}
              />
            )}
          </group>
        )
      })}

      {/* Walls — external walls fade when between the orbit camera and the plan
          centre; internal partitions stay solid. */}
      {boxes.map(({ box, isExterior, color }, i) => (
        <FadeWall
          key={i}
          box={box}
          cx={cx}
          cz={cz}
          color={color}
          isExterior={isExterior}
          isInterior={isInterior}
        />
      ))}

      {/* Sloping-top walls: the rectangular lower band [0, minTop] is drawn as
          boxes above (so it cuts openings like a flat wall); this prism is the
          upper wedge [minTop, slopedTop]. */}
      {lp.walls.filter(isSlopedWall).map((w) => (
        <SlopedWallMesh
          key={w.id}
          wall={w}
          ceiling={lp.ceilingHeight}
          thickness={planWallThickness(w, lp)}
          color={w.color ?? wallColor}
          baseY={Math.min(...slopedWallHeights(w, lp.ceilingHeight))}
        />
      ))}

      {/* Skirting along floor-reaching wall spans (per-wall baseboard override:
          height/colour, or hidden — PARITY-BASEBOARD). */}
      {skirtings.map(({ box: b, height, color, isExterior }, i) => (
        <FadeSkirting
          key={`sk${i}`}
          box={b}
          height={height}
          color={color}
          isExterior={isExterior}
          isInterior={isInterior}
          cx={cx}
          cz={cz}
        />
      ))}

      {/* Crown molding at the wall–ceiling junction (full-height spans only),
          fading/hiding with its wall so the reveal is floor-to-ceiling. */}
      {crownMolding &&
        boxes
          .filter(({ box: b }) => b.cy + b.height / 2 >= lp.ceilingHeight - 0.01)
          .map(({ box: b, isExterior }, i) => (
            <FadeCrown
              key={`cm${i}`}
              box={b}
              ceilingHeight={lp.ceilingHeight}
              isExterior={isExterior}
              isInterior={isInterior}
              cx={cx}
              cz={cz}
            />
          ))}

      {/* Door leaves — swinging, clickable; closed by default (matches collision). */}
      {lp.openings
        .filter((o) => o.kind === 'door')
        .map((o) => {
          const wall = lp.walls.find((w) => w.id === o.wallId)
          // Curved + sloped walls host doors too (the leaf sits in the wall's
          // lower band; curved walls use arc-aware geometry in PlanDoorLeaf).
          return wall ? (
            <PlanDoorLeaf
              key={o.id}
              wall={wall}
              opening={o}
              cx={cx}
              cz={cz}
              isInterior={isInterior}
            />
          ) : null
        })}

      {/* Window glass — fades with its wall during the orbit reveal (FadeWindow). */}
      {windows.map((w) => (
        <FadeWindow key={w.id} win={w} cx={cx} cz={cz} isInterior={isInterior} />
      ))}
    </group>
  )
}

/** Window glass pane that fades out (like FadeWall) when it sits between the
 *  orbit camera and the plan centre — so it doesn't stay opaque in a wall that's
 *  gone translucent. */
function FadeWindow({
  win,
  cx,
  cz,
  isInterior,
}: {
  win: {
    cx: number
    cz: number
    cy: number
    width: number
    height: number
    angle: number
    revealable: boolean
    glassTint?: string
    style?: string
  }
  cx: number
  cz: number
  /** Point-in-room test used to orient the host wall's outward normal. */
  isInterior: (x: number, z: number) => boolean
}) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  // A custom glass tint replaces the cool default for the daylight colour; the
  // night blend toward dark reflective glass is preserved either way.
  const dayColor = useMemo(
    () => (win.glassTint ? new Color(win.glassTint) : GLASS_DAY),
    [win.glassTint],
  )
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    // Daylight-driven glass look (parity with the fixed apartment's Window): a
    // clear sky-lit pane by day → dark reflective at night, via an emissive
    // sky-catch (cheap, all tiers) + a day/night colour + opacity blend.
    const d = getFixtureGlow() // 1 at night, 0 in daylight
    mat.color.lerpColors(dayColor, GLASS_NIGHT, d)
    mat.emissiveIntensity = glassSkyCatchIntensity(1 - d)
    const base = 0.28 + d * 0.45 // more opaque (less see-through) at night
    let factor = 1
    const st = useStore.getState()
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const revealMode = st.wallRevealMode ?? 'translucent'
    const revealScope = st.wallRevealScope ?? 'exterior'
    const participates = win.revealable || revealScope === 'all'
    if (participates && cameraMode === 'orbit' && revealEnabled && revealMode !== 'opaque') {
      // 0.3 m probe past the pane centre — the host wall's thickness isn't carried
      // on the window box, but a fixed reach clears the wall into the room.
      const f = revealFactor(
        camera,
        win.cx,
        win.cz,
        win.angle,
        isInterior,
        0.3,
        cx,
        cz,
        !win.revealable,
      )
      factor = revealMode === 'auto-hide' ? f : Math.max(0.15, f)
    }
    const target = base * factor
    mat.opacity += (target - mat.opacity) * 0.18
    if (Math.abs(mat.opacity - target) > 0.003) invalidate()
  })
  // Optional safety grille (vertical bars) or louvre (horizontal slats) over the
  // glass — pure thin geometry in the window plane (local Z = width, Y = height).
  const style = win.style ?? 'plain'
  const bars: { pos: [number, number, number]; size: [number, number, number] }[] = []
  if (style === 'grille') {
    const n = Math.max(2, Math.round(win.width / 0.16))
    for (let i = 1; i < n; i++) {
      const z = -win.width / 2 + (win.width * i) / n
      bars.push({ pos: [0, 0, z], size: [0.018, win.height * 0.98, 0.012] })
    }
  } else if (style === 'louvre') {
    const n = Math.max(3, Math.round(win.height / 0.14))
    for (let i = 0; i < n; i++) {
      const y = -win.height / 2 + (win.height * (i + 0.5)) / n
      bars.push({ pos: [0, y, 0], size: [0.05, 0.02, win.width * 0.98] })
    }
  }
  return (
    <group position={[win.cx, win.cy, win.cz]} rotation={[0, win.angle, 0]}>
      <mesh ref={ref}>
        <boxGeometry args={[0.03, win.height, win.width]} />
        <meshStandardMaterial
          color="#bcd4e6"
          emissive={GLASS_SKYCATCH_COLOR}
          emissiveIntensity={0.4}
          transparent
          opacity={0.32}
          roughness={0.1}
          metalness={0}
        />
      </mesh>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#cfd2d4" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/** A sloping-top wall rendered as a prism (PARITY-SLOPEWALL). The triangle soup
 *  is already in world coordinates, so the mesh sits at the origin; flat normals
 *  come from `computeVertexNormals` on the unshared verts. */
function SlopedWallMesh({
  wall,
  ceiling,
  thickness,
  color,
  baseY = 0,
}: {
  wall: PlanWall
  ceiling: number
  thickness: number
  color: string
  /** Prism base (m) — set to the wall's min top height when its lower band is
   *  drawn as boxes (so this is just the upper wedge above any openings). */
  baseY?: number
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute(
      'position',
      new BufferAttribute(slopedWallTriangles(wall, ceiling, thickness, baseY), 3),
    )
    g.computeVertexNormals()
    return g
  }, [wall, ceiling, thickness, baseY])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  )
}

/** Build a flat horizontal mesh from a traced outline polygon at height `y`
 *  (ear-clipped via three's ShapeUtils — handles concave/notched outlines). */
function outlineGeometry(outline: PlanVec2[], y: number): BufferGeometry | null {
  const contour = outline.map(([x, z]) => new Vector2(x, z))
  const tris = ShapeUtils.triangulateShape(contour, [])
  if (tris.length === 0) return null
  const pos = new Float32Array(tris.length * 9)
  let p = 0
  for (const tri of tris) {
    for (const idx of tri) {
      const v = contour[idx]
      pos[p++] = v.x
      pos[p++] = y
      pos[p++] = v.y
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Neutral fallback ground over the exact wall-enclosed footprint, sitting just
 *  below the room floors so it shows ONLY where no room covers it — filling the
 *  void left by removing the grounding slab (no hole). Orbit view only; the red
 *  un-roomed flag lives in the 2D plan editor. Custom plans only (PlanShell). */
function UnroomedFloor({ walls }: { walls: readonly PlanWall[] }) {
  const geometry = useMemo(() => {
    const ext: WallSeg[] = walls
      .filter((w) => w.thickness === 'external')
      .map((w) => ({ start: w.start, end: w.end }))
    const outline = traceBuildingOutline(ext)
    if (!outline) return null
    return outlineGeometry(outline, -0.01) // 1 cm below room floors → they cover it
  }, [walls])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#bdb6aa" roughness={0.95} metalness={0} side={DoubleSide} />
    </mesh>
  )
}
