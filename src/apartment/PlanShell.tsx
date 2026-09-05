import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  type Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import { useFeature } from '../features/useFeature'
import { ceilingGapRects } from '../floorplan/ceilingGaps'
import {
  buildThresholdRisers,
  roomAndOffsetAtPoint,
  roomFloorOffsetM,
  type ThresholdRiserSpec,
  wallBaseExtensionM,
} from '../floorplan/floorLevels3d'
import { traceBuildingOutline, type WallSeg } from '../floorplan/footprint'
import { levelAsPlan, type PlanLevel, renderedLevels } from '../floorplan/levels'
import { planWallThickness, type WallBox, wallBoxes } from '../floorplan/planGeometry'
import { planRoomRects } from '../floorplan/planRoomShell'
import { railingMemberInstances } from '../floorplan/railingLayout'
import { resolvePlanRoomCeiling, resolvePlanRoomFloor } from '../floorplan/roomFinishes'
import { isSlopedWall, slopedWallHeights, slopedWallTriangles } from '../floorplan/slopedWall'
import {
  DEFAULT_CROWN_COLOR,
  DEFAULT_CROWN_HEIGHT_M,
  DEFAULT_PLAN_WALL_COLOR,
  type FloorPlan,
  type PlanRoom,
  type PlanVec2,
  type PlanWall,
  planBounds,
  wallLength,
} from '../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../floorplan/wallArc'
import { establishedWallStructureInPlan, shelterWallIds } from '../floorplan/wallHackability'
import { wallTypeOverlayColor } from '../floorplan/wallTypeColor'
import {
  type GrilleMemberInstance,
  glassBlockInstances,
  grilleBarInstances,
  invisibleGrilleCableInstances,
  louvreSlatInstances,
  sashFrameInstances,
  sashOpenTilt,
  windowGlassKindParams,
} from '../floorplan/windowGrilleLayout'
import { BeveledBox } from '../furniture/primitives/BeveledBox'
import { InstancedBoxes, InstancedCylinders } from '../furniture/primitives/InstancedBoxes'
import { MetalMaterial } from '../furniture/primitives/MetalMaterial'
import {
  GLASS_SKYCATCH_COLOR,
  glassSkyCatchIntensity,
  windowGlassPhysical,
  windowTransmission,
} from '../materials/materialRealism'
import { triplanarUv } from '../materials/triplanar'
import type { MaterialId } from '../materials/types'
import { estateVisibleNow } from '../scene/estate/estateSignal'
import { daylightFromAltitude } from '../scene/lighting/altitudeCurve'
import { useSunPosition } from '../scene/lighting/useSunPosition'
import { backdropVisibleNow } from '../scene/SceneBackdrop'
import { useStore } from '../state/store'
import { PlanRoomCeiling } from './floor/PlanRoomCeiling'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { planThresholdRects } from './floor/planThresholdRects'
import type { ThresholdRect } from './floor/thresholdRects'
import { PlanDoorLeaf } from './PlanDoorLeaf'
import { Roof } from './Roof'
import { PlanWallFace, syncFaceFade } from './walls/PlanWallFace'
import { getWallOwnStrength, setWallOwnStrength } from './walls/wallReveal'
import {
  cornerNeighbors,
  cornerSpreadStrength,
  DEFAULT_WALL_REVEAL_STRENGTH,
  facingToward,
  orientOutward,
  pointInRooms,
  type RoomRect,
  revealStrength,
  revealTargetOpacityForFade,
  SPREAD_ONSET,
} from './walls/wallRevealMath'

// Window glass day/night tint — clear cool pane by day, dark reflective at night
// (matches the fixed apartment's Window.tsx so custom + default plans look alike).
const GLASS_DAY = new Color('#bcd4e6')
const GLASS_NIGHT = new Color('#20272f')
// Scratch for the camera forward direction (avoids per-frame allocation).
const FWD = new Vector3()
// Light neutral a faded wall is lifted toward so it doesn't dim the room seen
// through it (REVEAL-THROUGH-TINT). Shared, read-only.
const REVEAL_EMISSIVE = new Color('#eceae4')
// Stable empty neighbour list for walls with no corner adjacency.
const NO_NEIGHBORS: readonly string[] = []

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
/** Camera-facing ANGLE-GRADED fade strength (0 = opaque, 1 = peak fade) for a
 *  wall/opening box (WALL-REVEAL-ANGLE-GRADED — shares the same graded curve as
 *  `WallSegment`/`useWallReveal`, replacing the retired binary target). Per-wall
 *  and shape-independent: a wall fades when the camera sits on its OUTWARD side
 *  (between the camera and the rooms). "Outward" is found by probing which side
 *  of the box is a room (`isInterior`), so it's correct on non-rectangular plans
 *  (L/U/notched) where the bounding-box centre is an unreliable reference; it
 *  falls back to "away from the plan centre" only when the probe is ambiguous.
 *  `angle` is the box's Y-rotation; the box's broad faces (the wall surfaces)
 *  have the XZ normal (cos a, −sin a). */
function revealFacingToward(
  fwdX: number,
  fwdZ: number,
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
    // Interior partition (rooms on both sides): orient its normal toward the
    // camera so it fades when looked at head-on (ORIENTATION-ONLY).
    if (nx * fwdX + nz * fwdZ > 0) {
      nx = -nx
      nz = -nz
    }
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
  // Facing purely from the camera's look direction — independent of zoom / pan.
  // Returns the raw `toward` cosine so callers can grade BOTH the own-facing
  // strength (`revealStrength`) and the corner-spread curve from it.
  return facingToward(fwdX, fwdZ, nx, nz)
}

/** Interior room rectangles (+ L-extensions) for a level, for the point-in-room
 *  outward probe. Polygon rooms fall back to their origin/width/depth bounds. */
function levelRoomRects(rooms: readonly PlanRoom[]): RoomRect[] {
  // One entry per rect piece — `planRoomRects` resolves a room's shape however
  // it is declared (rect, L-extension, or a polygon, which reports its bbox).
  return rooms.flatMap((r) =>
    planRoomRects(r).map((p) => ({ x: p.x0, z: p.z0, w: p.x1 - p.x0, d: p.z1 - p.z0 })),
  )
}

/** Target opacity (1 = solid, →0.15/0 = faded) for a wall box given the current
 *  reveal mode + scope — shared by the wall body and its skirting so they fade
 *  together. Returns 1 when the wall doesn't participate / mode is opaque. */
function planWallRevealTarget(
  fwdX: number,
  fwdZ: number,
  cameraMode: string,
  box: WallBox,
  isExterior: boolean,
  isInterior: (x: number, z: number) => boolean,
  cx: number,
  cz: number,
  /** Corner-neighbour wall ids (walls sharing an endpoint) for spread. */
  neighborIds: readonly string[],
  /** Only the wall BODY publishes its own strength (trim/glass read-only, so a
   *  wall's registry entry isn't overwritten by a lockstep follower). */
  publishOwn: boolean,
): number {
  const st = useStore.getState()
  const revealEnabled = st.qualityOverrides.wallReveal ?? true
  const fade = st.wallRevealStrength ?? DEFAULT_WALL_REVEAL_STRENGTH
  const revealScope = st.wallRevealScope ?? 'exterior'
  const participates = isExterior || revealScope === 'all'
  if (!(participates && cameraMode === 'orbit' && revealEnabled && fade > 0)) {
    if (publishOwn) setWallOwnStrength(box.wallId, 0)
    return 1
  }
  const probe = box.thickness / 2 + 0.3
  const toward = revealFacingToward(
    fwdX,
    fwdZ,
    box.cx,
    box.cz,
    box.angle,
    isInterior,
    probe,
    cx,
    cz,
    !isExterior,
  )
  const own = revealStrength(toward)
  // Publish the OWN-facing strength (never the spread-inclusive one) so spread
  // stays first-degree — a wall fading only because of spread publishes 0 and
  // cannot pull its own neighbours in (mirrors WallSegment/useWallReveal).
  if (publishOwn) setWallOwnStrength(box.wallId, own)
  // Corner spread (WALL-REVEAL-CORNER-SPREAD): a wall sharing a corner with a
  // wall that is meaningfully fading by its OWN facing fades too, graded by
  // this wall's own facing on the spread curve and gated on the strongest
  // neighbour's published own strength (one-frame lag is fine).
  let strength = own
  if (toward > SPREAD_ONSET && neighborIds.length > 0) {
    let maxNb = 0
    for (const id of neighborIds) {
      const s = getWallOwnStrength(id)
      if (s > maxNb) maxNb = s
    }
    strength = Math.max(strength, cornerSpreadStrength(toward, maxNb))
  }
  // Graded target: settles anywhere between opaque and the fade-strength floor
  // (`1 − fade`) per the wall's facing angle (WALL-REVEAL-ANGLE-GRADED).
  return revealTargetOpacityForFade(fade, strength)
}

function FadeWall({
  box,
  cx,
  cz,
  color,
  isExterior,
  isInterior,
  neighborIds,
  overlayColor,
  rooms,
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
  /** Corner-neighbour wall ids for the reveal corner-spread. */
  neighborIds: readonly string[]
  /** Wall-types 3D overlay tint (`wallTypeColor.ts`), or `null`/absent for an
   *  unclassified wall / when the overlay is off. Rendered as a translucent
   *  jacket over the body, kept simple (not fade-linked to the reveal — it
   *  just always renders at a fixed opacity when set, per the simplest
   *  acceptable read for a tint overlay). */
  overlayColor?: string | null
  /** This storey's rooms — used to resolve which room fronts each wall face,
   *  so the face can carry that room's wall finish. */
  rooms: readonly PlanRoom[]
}) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    camera.getWorldDirection(FWD)
    const target = planWallRevealTarget(
      FWD.x,
      FWD.z,
      cameraMode,
      box,
      isExterior,
      isInterior,
      cx,
      cz,
      neighborIds,
      true,
    )
    mat.opacity += (target - mat.opacity) * 0.18
    const next = mat.opacity < 0.98
    // Toggling `transparent` at runtime needs a recompile for the blend to
    // engage (see WallSegment); flip needsUpdate only on the transition.
    if (next !== mat.transparent) mat.needsUpdate = true
    mat.transparent = next
    // depthWrite stays ON through the fade (WALL-FADE-DEPTHWRITE) — flipping it
    // popped the wall (and its carved openings) between a see-through blend and
    // solid 3D as the camera orbited, and made faded walls sort inconsistently
    // against glass/openings (backdrop bleed). Constant depth-write = smooth,
    // clean single-surface translucency.
    mat.depthWrite = true
    // Lift the faded pane toward a light neutral so it doesn't dim/tint the room
    // seen through it (REVEAL-THROUGH-TINT, matching useWallReveal/WallSegment).
    if (next) {
      mat.emissive.copy(REVEAL_EMISSIVE)
      mat.emissiveIntensity = (1 - mat.opacity) * 0.7
    } else {
      mat.emissive.setRGB(0, 0, 0)
      mat.emissiveIntensity = 1
    }
    // The interior finish faces are separate meshes with cloned materials, so
    // they have to be faded alongside the body or a revealed wall keeps an
    // opaque finish pane floating in front of the room.
    syncFaceFade(mesh, mat)
    // frameloop="demand": keep rendering until the fade settles (else it freezes
    // mid-fade when the camera stops).
    if (Math.abs(mat.opacity - target) > 0.005) invalidate()
  })
  return (
    <>
      <mesh
        ref={ref}
        position={[box.cx, box.cy, box.cz]}
        rotation={[0, box.angle, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[box.thickness, box.height, box.length]} />
        <meshStandardMaterial color={color} roughness={0.9} transparent opacity={1} />
        {/* Room wall FINISHES (brick / tile / panelling / wallpaper) on the
            interior faces — without these the overview showed only the plan's
            flat wall colour and a picked finish appeared to do nothing until you
            entered the room's editor. Children of the box so they inherit its
            transform; `syncFaceFade` mirrors the reveal fade onto them. */}
        <PlanWallFace box={box} side={1} rooms={rooms} />
        <PlanWallFace box={box} side={-1} rooms={rooms} />
      </mesh>
      {overlayColor && (
        <mesh position={[box.cx, box.cy, box.cz]} rotation={[0, box.angle, 0]} raycast={() => null}>
          <boxGeometry args={[box.thickness * 1.01, box.height * 1.01, box.length * 1.01]} />
          <meshBasicMaterial
            color={overlayColor}
            transparent
            opacity={0.35}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}
    </>
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
  neighborIds: readonly string[],
) {
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    if (!mat) return
    camera.getWorldDirection(FWD)
    // publishOwn=false: the trim follows its host wall's fade (incl. spread)
    // without overwriting the wall's own-strength registry entry.
    const target = planWallRevealTarget(
      FWD.x,
      FWD.z,
      cameraMode,
      box,
      isExterior,
      isInterior,
      cx,
      cz,
      neighborIds,
      false,
    )
    mat.opacity += (target - mat.opacity) * 0.18
    const next = mat.opacity < 0.98
    if (next !== mat.transparent) mat.needsUpdate = true
    mat.transparent = next
    // depthWrite stays ON (WALL-FADE-DEPTHWRITE) so the trim fades as one clean
    // surface with its wall instead of popping / sorting inconsistently.
    mat.depthWrite = true
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
  neighborIds,
  offsetM = 0,
}: {
  box: WallBox
  height: number
  color: string
  isExterior: boolean
  isInterior: (x: number, z: number) => boolean
  cx: number
  cz: number
  neighborIds: readonly string[]
  /** FFL offset (m) of the room this strip fronts (BSJ-8 follow-up); 0 keeps
   *  the strip at the plan datum, byte-identical to the pre-BSJ-8 render. */
  offsetM?: number
}) {
  const ref = useRef<Mesh>(null)
  useTrimFade(ref, box, isExterior, isInterior, cx, cz, neighborIds)
  return (
    <BeveledBox
      ref={ref}
      position={[box.cx, offsetM + height / 2, box.cz]}
      rotation={[0, box.angle, 0]}
      receiveShadow
      args={[box.thickness + 0.024, height, box.length]}
    >
      <meshStandardMaterial color={color} roughness={0.7} transparent opacity={1} />
    </BeveledBox>
  )
}

// Threshold patch: slab thickness below the top face (never visible) + top-face
// lift. The default flat uses THRESHOLD_LIFT 0.0006 under floors at 0.001; plan
// room floors render higher (0.006, PlanRoomFloor), so the plan patch tops out
// 1 mm below them — the 12 mm THRESHOLD_OVERLAP tuck-under hides the abutment
// seam with no z-fighting (distinct heights), and it stays clear of the
// UnroomedFloor at −0.01.
const PLAN_THRESHOLD_H = 0.02
const PLAN_THRESHOLD_LIFT = 0.005

/** Floor patch under a plan doorway (DOOR-GAP-LEAK, `Thresholds.tsx` analog):
 *  a slim hardwood threshold strip filling the unfloored wall-thickness slot in
 *  the door opening. Fades/hides in lockstep with its host wall (same
 *  `useTrimFade` contract as FadeSkirting/FadeCrown), so a faded wall doesn't
 *  leave an opaque strip floating in its doorway. */
function FadeThreshold({
  rect,
  isExterior,
  isInterior,
  cx,
  cz,
  neighborIds,
}: {
  rect: ThresholdRect
  isExterior: boolean
  isInterior: (x: number, z: number) => boolean
  cx: number
  cz: number
  neighborIds: readonly string[]
}) {
  const ref = useRef<Mesh>(null)
  // WallBox stand-in for the shared fade math (probe reach uses `thickness`).
  const box = useMemo<WallBox>(
    () => ({
      wallId: rect.wallId,
      cx: rect.cx,
      cz: rect.cz,
      length: rect.length,
      thickness: rect.depth,
      height: PLAN_THRESHOLD_H,
      cy: PLAN_THRESHOLD_LIFT - PLAN_THRESHOLD_H / 2,
      angle: rect.angle,
    }),
    [rect],
  )
  useTrimFade(ref, box, isExterior, isInterior, cx, cz, neighborIds)
  return (
    <mesh
      ref={ref}
      position={[rect.cx, PLAN_THRESHOLD_LIFT - PLAN_THRESHOLD_H / 2, rect.cz]}
      rotation={[0, rect.angle, 0]}
      receiveShadow
    >
      <boxGeometry args={[rect.depth, PLAN_THRESHOLD_H, rect.length]} />
      {/* Hardwood threshold strip — matches the default flat's Thresholds. */}
      <meshStandardMaterial color="#7d6243" roughness={0.8} metalness={0} transparent opacity={1} />
    </mesh>
  )
}

/** Nosing strip proud of the riser's top edge (matches a real step's rounded
 *  lip) — a thin bevelled cap the width of the door span. */
const RISER_NOSING_H = 0.02
const RISER_NOSING_PROUD = 0.02

/** A doorway step riser (BSJ-8 follow-up): a short vertical quad spanning the
 *  door width between two rooms at different FFL levels, plus a thin nosing
 *  strip along its top edge (the higher room's floor). Not wall-reveal-linked
 *  (small + always inside a doorway — reads fine at a constant opacity, like
 *  the default flat's plain threshold strip). */
function ThresholdRiser({ riser }: { riser: ThresholdRiserSpec }) {
  const midY = (riser.bottomY + riser.topY) / 2
  return (
    <group position={[riser.center[0], midY, riser.center[1]]} rotation={[0, riser.angle, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[0.03, riser.riseM, riser.length]} />
        {/* Hardwood riser face — matches the doorway threshold strip's finish. */}
        <meshStandardMaterial color="#7d6243" roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[0, riser.riseM / 2 + RISER_NOSING_H / 2, 0]} receiveShadow>
        <boxGeometry args={[0.03 + RISER_NOSING_PROUD, RISER_NOSING_H, riser.length + 0.02]} />
        <meshStandardMaterial color="#8a6d4f" roughness={0.65} metalness={0} />
      </mesh>
    </group>
  )
}

/** Crown molding at the wall–ceiling junction that fades/hides with its host wall
 *  (ceiling trim) — so a faded wall reveals floor-to-ceiling with no opaque band
 *  left at the top. */
function FadeCrown({
  box,
  ceilingHeight,
  height,
  color,
  isExterior,
  isInterior,
  cx,
  cz,
  neighborIds,
}: {
  box: WallBox
  ceilingHeight: number
  height: number
  color: string
  isExterior: boolean
  isInterior: (x: number, z: number) => boolean
  cx: number
  cz: number
  neighborIds: readonly string[]
}) {
  const ref = useRef<Mesh>(null)
  useTrimFade(ref, box, isExterior, isInterior, cx, cz, neighborIds)
  return (
    <BeveledBox
      ref={ref}
      position={[box.cx, ceilingHeight - height / 2, box.cz]}
      rotation={[0, box.angle, 0]}
      args={[box.thickness + 0.024, height, box.length]}
    >
      <meshStandardMaterial
        color={color}
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
 * `renderedLevels` (storeys unmount when hidden, so picking can't hit them —
 * except the one storey below a WALKED level, which is deliberately present).
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const wallColor = plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR
  const [ew, ed] = planBounds(plan)
  // Walk mode also renders the storey immediately BELOW the walked one, so an
  // overlook has a floor under it instead of bare sky — see `renderedLevels`.
  const cameraMode = useStore((s) => s.cameraMode)
  const levels = renderedLevels(plan, viewLevelId, cameraMode === 'firstPerson')

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
      {/* Parametric roof over the top storey (world-space; fades in orbit so the
          dollhouse stays visible). Renders nothing when the plan has no roof or
          the `parametricRoof` flag is off. */}
      <Roof plan={plan} />
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
  // Wall-types 3D overlay (`wallTypes3d` pro flag) — tints each wall by its
  // structural classification (mirrors `WallSegment`'s default-flat treatment).
  const wallTypes3dFlag = useFeature('wallTypes3d')
  const showWallTypesToggle = useStore((s) => s.showWallTypes)
  const showWallTypes = wallTypes3dFlag && showWallTypesToggle
  // Floor levels (BSJ-8 follow-up) — per-room FFL offset applied to floors +
  // skirting; walls stay at the plan datum (see PlanShell's header note).
  const floorLevelsOn = useFeature('floorLevels')
  const lp = useMemo(() => levelAsPlan(plan, level), [plan, level])

  // Point-in-room test for this storey, used to orient each wall's "outward"
  // normal so the reveal fade works on non-rectangular / notched custom plans
  // (where a single bounding-box centre mis-judges off-centre walls).
  const isInterior = useMemo(() => {
    const rects = levelRoomRects(lp.rooms)
    return (x: number, z: number) => pointInRooms(x, z, rects, 0.05)
  }, [lp])

  // Corner-adjacency (walls sharing an endpoint) for the reveal corner-spread
  // (WALL-REVEAL-CORNER-SPREAD) — the same static map WallSegment/useWallReveal
  // build; plan geometry only changes with the plan itself.
  const neighbors = useMemo(() => cornerNeighbors(lp.walls), [lp])
  // Wall ids bounding a household shelter on THIS storey — resolved once per
  // level plan (the boundary walk is per-room) and reused by the wall boxes.
  const shelterWalls = useMemo(() => shelterWallIds(lp), [lp])

  // Pair each render box with whether its source wall is an external/perimeter
  // wall: only those fade for the camera reveal (internal partitions stay solid
  // so the room layout reads clearly), matching the default flat's WallSegment.
  const boxes = useMemo(
    () =>
      lp.walls
        // Railing walls (open parapet) render as an InstancedBoxes railing
        // below, not a solid box.
        .filter((w) => !(w.railing && w.topHeight))
        .flatMap((w) =>
          wallBoxes(lp, w).map((box) => ({
            box,
            isExterior: w.thickness === 'external',
            // Per-wall paint colour override (elementColors), else the plan default.
            color: w.color ?? wallColor,
            // Wall-types 3D overlay tint (`wallTypes3d` flag) — null when
            // unclassified; resolved once here rather than in the render loop.
            // Resolved (v0.31.8.4), so the 3D Wall-types tint cannot disagree with the
            // 2D Hackability overlay about the same facade — which is why this
            // takes the plan-aware resolver, matching `HackabilityLayer`: a
            // household shelter's RC walls must tint the same in both views.
            overlayColor: wallTypeOverlayColor(establishedWallStructureInPlan(w, shelterWalls)),
          })),
        ),
    [lp, wallColor, shelterWalls],
  )

  // Walls with `railing` set: render an open metal railing (top rail + posts
  // + balusters) up to `topHeight` instead of the solid box above.
  const railingWalls = useMemo(() => lp.walls.filter((w) => w.railing && w.topHeight), [lp])

  // Skirting strips along floor-reaching wall spans, carrying each wall's
  // optional per-wall baseboard override (PARITY-BASEBOARD): height + colour, or
  // hidden. Built per wall (not from the flattened `boxes`) so the override is
  // in scope; defaults match the shell skirting (0.09 m, off-white).
  //
  // BSJ-8 follow-up: each strip's Y follows whichever room it fronts (probed a
  // touch inside the room from the strip's own face) so a lowered/raised room's
  // skirting sits on its own floor, not the plan datum. A strip on a shared
  // wall between two differently-offset rooms picks up ONE side's offset (the
  // probe direction below) — an acceptable simplification at the mm-scale steps
  // this feature models (see floorLevels3d.ts's module header).
  // Crown-molding strips at the wall–ceiling junction, carrying each wall's
  // optional per-wall override (height / colour / hidden), mirroring `skirtings`.
  // Built per wall (not from the flattened `boxes`) so the override is in scope.
  // Only full-height spans get trim: a half-wall or a sloped wedge has no
  // ceiling junction to run a cornice along.
  const crowns = useMemo(() => {
    if (!crownMolding) return []
    const out: { box: WallBox; height: number; color: string; isExterior: boolean }[] = []
    for (const w of lp.walls) {
      const cm = w.crown
      if (cm?.hidden) continue
      const height = cm?.height && cm.height > 0 ? cm.height : DEFAULT_CROWN_HEIGHT_M
      const color = cm?.color ?? DEFAULT_CROWN_COLOR
      const isExterior = w.thickness === 'external'
      for (const box of wallBoxes(lp, w)) {
        if (box.cy + box.height / 2 >= lp.ceilingHeight - 0.01) {
          out.push({ box, height, color, isExterior })
        }
      }
    }
    return out
  }, [lp, crownMolding])

  const skirtings = useMemo(() => {
    const out: {
      box: WallBox
      height: number
      color: string
      isExterior: boolean
      offsetM: number
    }[] = []
    for (const w of lp.walls) {
      const bb = w.baseboard
      if (bb?.hidden) continue
      const height = bb?.height && bb.height > 0 ? bb.height : 0.09
      const color = bb?.color ?? '#eceae4'
      const isExterior = w.thickness === 'external'
      for (const box of wallBoxes(lp, w)) {
        if (box.cy - box.height / 2 < 0.01) {
          const probeX = box.cx + Math.cos(box.angle) * (box.thickness / 2 + 0.15)
          const probeZ = box.cz - Math.sin(box.angle) * (box.thickness / 2 + 0.15)
          const { offsetM } = roomAndOffsetAtPoint(lp.rooms, probeX, probeZ, floorLevelsOn)
          out.push({ box, height, color, isExterior, offsetM })
        }
      }
    }
    return out
  }, [lp, floorLevelsOn])

  // Plinth boxes filling the gap under a wall for its fronting room's lowered
  // floor (mirrors PlanRoomShell's WallBasePlinth) — one per floor-reaching wall
  // box whose fronting room is stepped down. Skipped entirely when the flag is
  // off or no room is lowered (empty array, no render).
  const wallPlinths = useMemo(() => {
    if (!floorLevelsOn) return []
    const out: { box: WallBox; extension: number }[] = []
    for (const w of lp.walls) {
      for (const box of wallBoxes(lp, w)) {
        if (box.cy - box.height / 2 >= 0.01) continue
        const probeX = box.cx + Math.cos(box.angle) * (box.thickness / 2 + 0.15)
        const probeZ = box.cz - Math.sin(box.angle) * (box.thickness / 2 + 0.15)
        const { offsetM } = roomAndOffsetAtPoint(lp.rooms, probeX, probeZ, floorLevelsOn)
        const extension = wallBaseExtensionM(offsetM)
        if (extension > 0) out.push({ box, extension })
      }
    }
    return out
  }, [lp, floorLevelsOn])

  // Doorway threshold patches (DOOR-GAP-LEAK): fill the unfloored
  // wall-thickness slot under every floor-level door opening, tagged with the
  // host wall's exterior flag so each fades with its wall.
  const thresholds = useMemo(() => {
    const exterior = new Map(lp.walls.map((w) => [w.id, w.thickness === 'external']))
    return planThresholdRects(lp).map((rect) => ({
      rect,
      isExterior: exterior.get(rect.wallId) ?? false,
    }))
  }, [lp])

  // Doorway step risers (BSJ-8 follow-up): a short vertical face + nosing at
  // each doorway between two rooms at different FFL levels, reusing
  // `floorLevels.ts:buildFloorTransitions` (via `buildThresholdRisers`) for the
  // pairing so the 3D riser and the dimensioned-plan's step marker never
  // disagree about where a step exists. This storey's plan (`lp`) is the whole
  // level, but the LEVEL-ELEVATION offset is added back inside
  // `buildThresholdRisers` — `PlanLevelShell`'s own parent `<group>` already
  // applies `level.elevation`, so risers here are built at world scale and then
  // rendered relative to that same parent, matching every other geometry helper
  // in this component (`wallBoxes`, `planThresholdRects`, …).
  const thresholdRisers = useMemo(() => {
    if (!floorLevelsOn) return []
    const wallById = new Map(lp.walls.map((w) => [w.id, w]))
    return buildThresholdRisers(lp, true, (openingId) => {
      const op = lp.openings.find((o) => o.id === openingId)
      const wall = op ? wallById.get(op.wallId) : undefined
      if (!op || !wall) return undefined
      const len = wallLength(wall)
      if (len === 0) return undefined
      const angle = Math.atan2(
        (wall.end[0] - wall.start[0]) / len,
        (wall.end[1] - wall.start[1]) / len,
      )
      return { width: op.width, angle }
    }).map((r) => ({ ...r, bottomY: r.bottomY - level.elevation, topY: r.topY - level.elevation }))
  }, [lp, floorLevelsOn, level.elevation])

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
          wallId: wall.id,
          cx,
          cz,
          cy: (o.sill + o.head) / 2,
          width: o.width,
          height: o.head - o.sill,
          angle,
          revealable: wall.thickness === 'external',
          // Optional per-window glass tint (elementColors); absent = cool default.
          glassTint: o.color,
          // Optional window style (openingStyles): plain / grille / louvre /
          // invisible-grille / casement / awning / hopper / transom.
          style: o.style,
          // Optional window GLASS kind (openingStyles, reuses `material`):
          // clear (default) / frosted / textured / glass-block.
          glass: o.material,
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
          works on every storey (the room editor is level-aware, ML5). Offset by
          the room's FFL level (BSJ-8 follow-up, `floorLevels` flag) — walls stay
          at the plan datum, so a lowered/raised room's floor rides its own group. */}
      {lp.rooms.map((r) => {
        const mat = resolvePlanRoomFloor(finishes, r) as MaterialId
        const roomId = r.id
        // Per-room floor-texture transform (SweetHome3DJS scale/angle parity).
        const texTransform =
          r.floorTexScale || r.floorTexAngle
            ? { scale: r.floorTexScale, angle: r.floorTexAngle }
            : undefined
        const offsetM = roomFloorOffsetM(r, floorLevelsOn)
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <group key={r.id} position={[0, offsetM, 0]}>
              <PlanRoomFloor
                roomId={roomId}
                origin={r.origin}
                width={r.width}
                depth={r.depth}
                polygon={r.polygon}
                materialId={mat}
                texTransform={texTransform}
              />
            </group>
          )
        }
        return (
          <group key={r.id} position={[0, offsetM, 0]}>
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

      {/* GAP CEILINGS — the footprint no room covers (item `(y)`, `v0.31.7.234`).
          Ceilings are per ROOM, so any area no room rect covers had a floor (the plan slab spans
          the whole footprint) and NO ceiling: a raycast up from such a point left the scene. It is
          not a rare corner — 16 of 19 templates have some, up to 45.9 m2 in `tpl-hdb-jumbo`, and it
          comes in two shapes: unassigned BLOCKS of 4-5 m2, and thin SLITS where a room rect stops
          short of a wall face (`h4-svc-s`'s south face is z = 2.95 while `h4-bed2` starts at 3.2).

          Filled here rather than by editing 19 templates' room rects, because room rects are what
          the furniture arranger and the area reports measure — moving them ripples into ratchets
          counting 1506 chairs and 897 mounts. This adds no room and moves nothing.

          GROUND LEVEL ONLY, and that restriction is item `(w)`'s lesson. A double-height room is a
          DECLARED room carrying a taller `ceilingHeight`, so it excludes itself from the gap set —
          but an UPPER storey's gap sits directly over that void, where the ground room's 5.5 m
          ceiling already is, and filling it would put a second lid in the same plane. The loft's
          entire upper-level gap is 0.6 m2, so skipping upper levels costs almost nothing. */}
      {level.elevation === 0
        ? ceilingGapRects(lp).map((r) => (
            <PlanRoomCeiling
              key={`gap-${r.x}-${r.z}-${r.width}-${r.depth}`}
              origin={[r.x, r.z]}
              width={r.width}
              depth={r.depth}
              height={lp.ceilingHeight}
              materialId={null}
            />
          ))
        : null}

      {/* Per-room ceilings (downward-facing — seen in walk, culled in orbit).
          Honour a per-room override, falling back to the level/plan height.
          A room on a storey being OVERLOOKED from above (item `(g)`) drops its
          ceiling when that ceiling sits BELOW the walked floor — from up there
          the lid is what you would see instead of the room. A double-height
          room whose ceiling rises past the walked floor keeps it: that surface
          is the roof over the void you are looking into. */}
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
      {boxes.map(({ box, isExterior, color, overlayColor }, i) => (
        <FadeWall
          key={i}
          box={box}
          cx={cx}
          cz={cz}
          color={color}
          isExterior={isExterior}
          isInterior={isInterior}
          neighborIds={neighbors.get(box.wallId) ?? NO_NEIGHBORS}
          overlayColor={showWallTypes ? overlayColor : null}
          rooms={lp.rooms}
        />
      ))}

      {/* Open railings (parapet override): top rail + posts + balusters up to
          `topHeight`, one InstancedBoxes draw call per wall — no wall-reveal
          fade (mirrors window grille members, never faded). */}
      {railingWalls.map((w) => {
        const wLen = wallLength(w)
        if (wLen === 0) return null
        const wdx = w.end[0] - w.start[0]
        const wdz = w.end[1] - w.start[1]
        // The helper's local frame is x = along-wall (see railingLayout.ts) —
        // matching `WallSegment`'s own body-outline frame, NOT `wallBoxes`'
        // x=thickness/z=length box convention. `angle = atan2(dz, dx)` +
        // `rotation=[0, -angle, 0]` maps the local +X axis onto the wall's
        // (dx, dz) direction (same derivation as `WallSegment`).
        const wAngle = Math.atan2(wdz, wdx)
        const wMidX = (w.start[0] + w.end[0]) / 2
        const wMidZ = (w.start[1] + w.end[1]) / 2
        return (
          <group key={w.id} position={[wMidX, 0, wMidZ]} rotation={[0, -wAngle, 0]}>
            <InstancedBoxes instances={railingMemberInstances(wLen, w.topHeight ?? 1)} castShadow>
              <meshStandardMaterial color="#cfd2d4" roughness={0.5} metalness={0.4} />
            </InstancedBoxes>
          </group>
        )
      })}

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
          height/colour, or hidden — PARITY-BASEBOARD). Rides its fronting
          room's FFL offset (BSJ-8 follow-up). */}
      {skirtings.map(({ box: b, height, color, isExterior, offsetM }, i) => (
        <FadeSkirting
          key={`sk${i}`}
          box={b}
          height={height}
          color={color}
          isExterior={isExterior}
          isInterior={isInterior}
          cx={cx}
          cz={cz}
          neighborIds={neighbors.get(b.wallId) ?? NO_NEIGHBORS}
          offsetM={offsetM}
        />
      ))}

      {/* Plinth boxes filling the gap under a wall for its fronting room's
          lowered floor (BSJ-8 follow-up) — walls stay at the plan datum. */}
      {wallPlinths.map(({ box: b, extension }, i) => (
        <mesh
          key={`plinth${i}`}
          position={[b.cx, -extension / 2, b.cz]}
          rotation={[0, b.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[b.thickness, extension, b.length]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0} />
        </mesh>
      ))}

      {/* Crown molding at the wall–ceiling junction (full-height spans only),
          fading/hiding with its wall so the reveal is floor-to-ceiling. Carries
          the per-wall height/colour/hidden override. */}
      {crowns.map(({ box: b, height, color, isExterior }, i) => (
        <FadeCrown
          key={`cm${i}`}
          box={b}
          ceilingHeight={lp.ceilingHeight}
          height={height}
          color={color}
          isExterior={isExterior}
          isInterior={isInterior}
          cx={cx}
          cz={cz}
          neighborIds={neighbors.get(b.wallId) ?? NO_NEIGHBORS}
        />
      ))}

      {/* Doorway threshold strips — floor patches under door openings so the
          wall-thickness slot isn't a hole (DOOR-GAP-LEAK, Thresholds analog). */}
      {thresholds.map(({ rect, isExterior }, i) => (
        <FadeThreshold
          key={`th${i}`}
          rect={rect}
          isExterior={isExterior}
          isInterior={isInterior}
          cx={cx}
          cz={cz}
          neighborIds={neighbors.get(rect.wallId) ?? NO_NEIGHBORS}
        />
      ))}

      {/* Doorway step risers (BSJ-8 follow-up) — a short vertical face + top
          nosing at a threshold between two rooms at different FFL levels. */}
      {thresholdRisers.map((r) => (
        <ThresholdRiser key={r.openingId} riser={r} />
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
              neighborIds={neighbors.get(wall.id) ?? NO_NEIGHBORS}
            />
          ) : null
        })}

      {/* Window glass — fades with its wall during the orbit reveal (FadeWindow). */}
      {windows.map((w) => (
        <FadeWindow
          key={w.id}
          win={w}
          cx={cx}
          cz={cz}
          isInterior={isInterior}
          neighborIds={neighbors.get(w.wallId) ?? NO_NEIGHBORS}
        />
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
  neighborIds,
}: {
  win: {
    wallId: string
    cx: number
    cz: number
    cy: number
    width: number
    height: number
    angle: number
    revealable: boolean
    glassTint?: string
    style?: string
    glass?: string
  }
  cx: number
  cz: number
  /** Point-in-room test used to orient the host wall's outward normal. */
  isInterior: (x: number, z: number) => boolean
  /** Host wall's corner neighbours, so the glass follows its wall's spread. */
  neighborIds: readonly string[]
}) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  // PHOTO-GLASS: High/Maximum render the pane as real refractive glass; below
  // that the cheap transparent pane stays byte-identical (null here).
  const glassPhysical = windowGlassPhysical(useStore((s) => s.qualityTier))
  // A custom glass tint replaces the cool default for the daylight colour; the
  // night blend toward dark reflective glass is preserved either way. Only the
  // `clear` glass kind (default) tells the day/night story with colour — a
  // non-clear kind (frosted/textured/glass-block) shouldn't turn dark blue at
  // night, so it keeps a static params colour instead (GLASS-KINDS).
  const isClearGlass = !win.glass || win.glass === 'clear'
  const isGlassBlock = win.glass === 'glass-block'
  const glassParams = useMemo(() => windowGlassKindParams(win.glass), [win.glass])
  // GLASS-CLARITY: on the transmission tier the pane's colour IS the shader's transmittance
  // and its roughness IS real blur of the view behind it, so both come from the kind's
  // transmission-tier fields (see `windowGlassKindParams`). The cheap tier keeps
  // `color`/`roughness`/`opacityCheap` byte-identical — there the hex is an opacity-blended
  // tint over the wall, which reads correctly as is. A user `glassTint` still wins outright.
  const paneColor = glassPhysical ? glassParams.transmissionColor : glassParams.color
  const paneRoughness = glassPhysical
    ? Math.max(glassPhysical.roughness, glassParams.transmissionRoughness)
    : glassParams.roughness
  const dayColor = useMemo(
    () =>
      win.glassTint ? new Color(win.glassTint) : glassPhysical ? new Color(paneColor) : GLASS_DAY,
    [win.glassTint, glassPhysical, paneColor],
  )
  // Held in a ref so `useFrame` calls no hook; `useSunPosition` is memoised.
  const sunAltRef = useRef(0)
  sunAltRef.current = useSunPosition().altitude

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    // Daylight-driven glass look (parity with the fixed apartment's Window): a
    // clear sky-lit pane by day → dark reflective at night, via an emissive
    // sky-catch (cheap, all tiers) + a day/night colour + opacity blend.
    // DAYLIGHT-GLASS: 1 at night, 0 in daylight — from the SUN, not the lamps
    // (`getFixtureGlow()` is exactly `lightsMode === 'on'`). See
    // `daylightFromAltitude`.
    const d = 1 - daylightFromAltitude(sunAltRef.current)
    // ESTATE-NIGHT-GLASS (see `Window.tsx`): with the estate mounted the pane stays clear
    // after dark so the lit neighbours show; `dn` is the night ramp the glass follows.
    const dn = estateVisibleNow() ? d * 0.15 : d
    if (isClearGlass) {
      mat.color.lerpColors(dayColor, GLASS_NIGHT, dn)
    } else {
      mat.color.set(paneColor)
    }
    // GLASS-SKYCATCH-VEIL: the emissive sky-catch stands in for sky luminance,
    // so it retires when a backdrop paints a real view behind the pane —
    // otherwise it adds a constant that flattens whatever the view carries.
    // ESTATE-SKYCATCH-VEIL: the estate is a SECOND real view behind the pane, mounted
    // independently of the photo backdrop (`estateVisibleNow()` per `Window.tsx`) — a
    // `backdrop: 'none'` walk still shows `<Estate>`, and there `backdropVisibleNow()`
    // alone would miss it and leave the constant emissive washing out the neighbour block.
    mat.emissiveIntensity = glassSkyCatchIntensity(
      1 - d,
      backdropVisibleNow() || estateVisibleNow(),
    )
    // Transmission tiers keep alpha at 1 (opacity is reserved for the wall-fade
    // compose) and blend day/night through transmission instead (PHOTO-GLASS).
    // Scaled by the glass kind's own transmission cap relative to the clear
    // default (0.9) — a factor of 1 for `clear`, keeping it byte-identical.
    if (glassPhysical) {
      ;(mat as MeshPhysicalMaterial).transmission =
        windowTransmission(1 - dn) * (glassParams.transmission / 0.9)
    }
    const base = glassPhysical ? 1 : 0.28 + dn * 0.45 // more opaque at night (cheap tiers)
    let factor = 1
    const st = useStore.getState()
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const fade = st.wallRevealStrength ?? DEFAULT_WALL_REVEAL_STRENGTH
    const revealScope = st.wallRevealScope ?? 'exterior'
    const participates = win.revealable || revealScope === 'all'
    if (participates && cameraMode === 'orbit' && revealEnabled && fade > 0) {
      // 0.3 m probe past the pane centre — the host wall's thickness isn't carried
      // on the window box, but a fixed reach clears the wall into the room.
      // Fade from the camera's look direction only (ORIENTATION-ONLY — zoom/pan
      // never change it), matching the host wall's own reveal.
      camera.getWorldDirection(FWD)
      const toward = revealFacingToward(
        FWD.x,
        FWD.z,
        win.cx,
        win.cz,
        win.angle,
        isInterior,
        0.3,
        cx,
        cz,
        !win.revealable,
      )
      // Own strength + the host wall's corner spread (read-only — the wall body
      // publishes; the pane just follows), so glass fades with a spread wall too.
      let s = revealStrength(toward)
      if (toward > SPREAD_ONSET && neighborIds.length > 0) {
        let maxNb = 0
        for (const id of neighborIds) {
          const nb = getWallOwnStrength(id)
          if (nb > maxNb) maxNb = nb
        }
        s = Math.max(s, cornerSpreadStrength(toward, maxNb))
      }
      factor = revealTargetOpacityForFade(fade, s)
    }
    // Glass-block glazing reads via the InstancedBoxes block grid, not this
    // backing pane — shrink it to near-invisible rather than the normal
    // clear/frosted/textured opacity story.
    const target = (isGlassBlock ? 0.12 : base) * factor
    mat.opacity += (target - mat.opacity) * 0.18
    if (Math.abs(mat.opacity - target) > 0.003) invalidate()
  })
  // Optional safety grille (vertical bars), louvre (horizontal slats), or
  // invisible grille (hair-thin cables) over the glass — pure thin geometry in
  // the window plane (local Z = width, Y = height); the layout maths lives in
  // `windowGrilleLayout.ts` so it's unit-testable without a GPU.
  // Members collapse to ONE InstancedMesh per window (bars/slats → InstancedBoxes,
  // cables → InstancedCylinders) — each bucket keeps its OWN material instance,
  // never the glass pane's fade material (only `ref`'s pane fades via the useFrame
  // above), so the wall-reveal behaviour is byte-identical to the old per-mesh grille.
  const style = win.style ?? 'plain'
  const bars: GrilleMemberInstance[] =
    style === 'grille'
      ? grilleBarInstances(win.width, win.height)
      : style === 'louvre'
        ? louvreSlatInstances(win.width, win.height)
        : []
  // Modern "invisible grille" convention: hair-thin stainless cables spaced
  // ~10 cm apart, near-transparent so they barely register at a glance (unlike
  // the chunky visible `grille` bars) while still reading as a safety barrier.
  const cables: GrilleMemberInstance[] =
    style === 'invisible-grille' ? invisibleGrilleCableInstances(win.width, win.height) : []
  // Sash-type windows (casement/awning/hopper/transom): a perimeter sash frame
  // (+ casement stile / transom rail). `sashFrameInstances`/`glassBlockInstances`
  // use the `x=width, y=height, z=depth` convention (see `windowGrilleLayout.ts`
  // header) — this window's own frame is `x=depth, y=height, z=width`, so the
  // x/z components of both position and size are swapped when feeding them in.
  const sashMembers: GrilleMemberInstance[] = sashFrameInstances(win.width, win.height, style).map(
    (m) => ({
      position: [m.position[2], m.position[1], m.position[0]],
      size: [m.size[2], m.size[1], m.size[0]],
    }),
  )
  // `glass-block` glazing kind: a grid of thick translucent blocks instead of
  // the usual pane read (the backing pane shrinks to near-invisible above).
  const blocks: GrilleMemberInstance[] = isGlassBlock
    ? glassBlockInstances(win.width, win.height).map((m) => ({
        position: [m.position[2], m.position[1], m.position[0]],
        size: [m.size[2], m.size[1], m.size[0]],
      }))
    : []
  // An "open" sash (awning/hopper) tilts about its hinge edge — a group
  // pivoted at the hinge (`pivotY * height/2`), with the pane + members
  // offset back inside so they carry the tilt. Closed styles skip this
  // wrapper entirely (zero-diff for the pre-existing plain/grille/louvre/
  // invisible-grille styles, and for casement/transom which don't tilt).
  const tilt = sashOpenTilt(style)
  const paneAndMembers = (
    <>
      <mesh ref={ref}>
        <boxGeometry args={[0.03, win.height, win.width]} />
        {glassPhysical ? (
          <meshPhysicalMaterial
            color={paneColor}
            emissive={GLASS_SKYCATCH_COLOR}
            emissiveIntensity={0.4}
            transmission={0.9}
            ior={glassPhysical.ior}
            thickness={glassPhysical.thickness}
            attenuationColor={glassPhysical.attenuationColor}
            attenuationDistance={glassPhysical.attenuationDistance}
            transparent
            opacity={1}
            roughness={paneRoughness}
            metalness={glassPhysical.metalness}
          />
        ) : (
          <meshStandardMaterial
            color={glassParams.color}
            emissive={GLASS_SKYCATCH_COLOR}
            emissiveIntensity={0.4}
            transparent
            opacity={glassParams.opacityCheap}
            roughness={glassParams.roughness}
            metalness={0}
          />
        )}
      </mesh>
      {bars.length > 0 && (
        <InstancedBoxes instances={bars} castShadow>
          <meshStandardMaterial color="#cfd2d4" roughness={0.5} metalness={0.4} />
        </InstancedBoxes>
      )}
      {cables.length > 0 && (
        <InstancedCylinders instances={cables} radialSegments={6}>
          <MetalMaterial
            color="#d7dade"
            roughness={0.3}
            metalness={0.7}
            transparent
            opacity={0.4}
          />
        </InstancedCylinders>
      )}
      {sashMembers.length > 0 && (
        <InstancedBoxes instances={sashMembers} castShadow>
          <meshStandardMaterial color="#e6e7e4" roughness={0.45} metalness={0.35} />
        </InstancedBoxes>
      )}
      {blocks.length > 0 && (
        <InstancedBoxes instances={blocks} castShadow>
          <meshStandardMaterial
            color={glassParams.color}
            roughness={glassParams.roughness}
            transparent
            opacity={0.75}
          />
        </InstancedBoxes>
      )}
    </>
  )
  return (
    <group position={[win.cx, win.cy, win.cz]} rotation={[0, win.angle, 0]}>
      {tilt ? (
        <group
          position={[0, (tilt.pivotY * win.height) / 2, 0]}
          rotation={[0, 0, -tilt.pivotY * tilt.angleRad]}
        >
          <group position={[0, (-tilt.pivotY * win.height) / 2, 0]}>{paneAndMembers}</group>
        </group>
      ) : (
        paneAndMembers
      )}
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
  const triplanar = useFeature('triplanarWalls')
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = slopedWallTriangles(wall, ceiling, thickness, baseY)
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.computeVertexNormals()
    // Triplanar (dominant-axis world) UVs (MAT-006b) so a tiled finish on this
    // non-planar prism reads at a constant world scale with no stretch. Pure
    // geometry; the solid-colour fallback ignores UVs, so this is texture-readiness.
    if (triplanar) {
      const uv = triplanarUv(pos, 1)
      if (uv) g.setAttribute('uv', new BufferAttribute(uv, 2))
    }
    return g
  }, [wall, ceiling, thickness, baseY, triplanar])
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
