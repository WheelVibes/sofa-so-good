import { useFrame, useThree } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, Mesh, type MeshStandardMaterial } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { BeveledBox } from '../../furniture/primitives/BeveledBox'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types'
import {
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { WallFloorAO } from '../../scene/CornerAO'
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { useQuality } from '../../scene/useQuality'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { APARTMENT_EXT_D, APARTMENT_EXT_W, FLAT, ROOMS, WALLS } from '../constants'
import type { RoomId, WallSpec } from '../types'
import {
  buildWallSegments,
  type WallSegment as WallSegmentSpan,
  wallEndAbutmentThickness,
  wallThicknessMetres,
} from '../wallSegments'
import { extrudeWallBody, WALL_STRUCTURE_COLOR } from './wallBodyGeometry'
import { buildWallBodyOutline } from './wallBodyShape'
import { setWallOpacity } from './wallReveal'
import {
  cameraFacingNormal,
  orientOutward,
  pointInRooms,
  type RoomRect,
  wallRevealFactor,
} from './wallRevealMath'
import { wallSidesSpans } from './wallRoomSides'

// Interior room rectangles (+ L-extensions) for the point-in-room test that
// orients each wall's "outward" normal — robust to the flat's non-rectangular,
// notched perimeter (a single bounding-box centre mis-judges offset walls).
const ROOM_RECTS: RoomRect[] = Object.values(ROOMS).map((r) => ({
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
const isInteriorPoint = (x: number, z: number) => pointInRooms(x, z, ROOM_RECTS, 0.05)

const FACE_OFFSET = 0.001 // lift face plane fractionally off the body box

interface FacePlaneProps {
  segLen: number
  segHeight: number
  segMid: number
  segMidY: number
  thickness: number
  /** +1 = +Z face, -1 = -Z face in the wall's local frame. */
  sign: 1 | -1
  material: MeshStandardMaterial
  /** Click handler for accent-wall selection. */
  onSelect?: () => void
  /** Room this face backs onto — tags the mesh as a wall finish-drop target. */
  roomId?: string
}

function FacePlane({
  segLen,
  segHeight,
  segMid,
  segMidY,
  thickness,
  sign,
  material,
  onSelect,
  roomId,
}: FacePlaneProps) {
  const z = sign * (thickness / 2 + FACE_OFFSET)
  const yRot = sign === 1 ? 0 : Math.PI
  const geometry = useMemo(() => worldUvPlaneGeometry(segLen, segHeight), [segLen, segHeight])
  // Geometry passed via `geometry=` isn't R3F-owned: dispose the superseded one
  // when segLen/segHeight change (ceiling-height / wall-thickness edits) or on
  // unmount, else every wall-face plane leaks across the session (BUG-006).
  useDisposeGeometry(geometry)
  // Clone so this wall's face can fade for camera-reveal independently of the
  // shared, cached finish material (which other walls also use). Textures are
  // shared by reference, so disposing the clone frees only its own GPU program.
  // polygonOffset biases the depth test in rasterizer units so the face always
  // wins over the wall body it sits 1 mm above — the world-space offset alone
  // z-fights at zoomed-out orbit distances (depth precision shrinks with range).
  const faded = useMemo(() => {
    const m = material.clone()
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -1
    return m
  }, [material])
  useEffect(() => () => faded.dispose(), [faded])
  return (
    <mesh
      position={[segMid, segMidY, z]}
      rotation={[0, yRot, 0]}
      material={faded}
      geometry={geometry}
      // Drop-target tag for the canvas finish drag (scene/finishDropTarget.ts).
      userData={roomId ? finishSurfaceUserData('wall', roomId) : undefined}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect()
            }
          : undefined
      }
    />
  )
}

/** Translucent highlight overlay shown on the wall face selected for accent
 *  finishing, so the user can see which face they're editing. */
function FaceHighlight({
  segLen,
  segHeight,
  segMid,
  segMidY,
  thickness,
  sign,
}: Omit<FacePlaneProps, 'material' | 'onSelect'>) {
  const z = sign * (thickness / 2 + FACE_OFFSET + 0.004)
  const yRot = sign === 1 ? 0 : Math.PI
  return (
    <mesh position={[segMid, segMidY, z]} rotation={[0, yRot, 0]}>
      <planeGeometry args={[segLen, segHeight]} />
      <meshBasicMaterial color="#4a90d9" transparent opacity={0.25} depthWrite={false} />
    </mesh>
  )
}

const BASEBOARD_H = 0.09
const CROWN_H = 0.07 // crown molding height (matches skirting board proportions)
const CROWN_T = 0.016 // crown molding thickness (proud of wall face)

/** A painted skirting board strip along the floor edge of a wall face. */
function Baseboard({
  segLen,
  segMid,
  thickness,
  sign,
}: {
  segLen: number
  segMid: number
  thickness: number
  sign: 1 | -1
}) {
  const z = sign * (thickness / 2 + 0.006)
  return (
    <BeveledBox
      position={[segMid, BASEBOARD_H / 2, z]}
      castShadow
      receiveShadow
      args={[segLen, BASEBOARD_H, 0.018]}
    >
      <meshStandardMaterial color="#eeece6" roughness={0.55} metalness={0} />
    </BeveledBox>
  )
}

/**
 * Decorative crown molding strip at the wall–ceiling junction.
 * Shares the same abutment-extended span length as the skirting board so
 * mitre corners close flush at every wall junction — no gaps or overlaps.
 * polygonOffset prevents z-fighting against the ceiling plane above.
 */
function CrownMolding({
  segLen,
  segMid,
  segTop,
  thickness,
  sign,
}: {
  segLen: number
  segMid: number
  segTop: number
  thickness: number
  sign: 1 | -1
}) {
  const z = sign * (thickness / 2 + 0.004)
  return (
    <BeveledBox position={[segMid, segTop - CROWN_H / 2, z]} args={[segLen, CROWN_H, CROWN_T]}>
      <meshStandardMaterial
        color="#eeece6"
        roughness={0.55}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </BeveledBox>
  )
}

interface SegmentFaceProps extends Omit<FacePlaneProps, 'material'> {
  materialId: MaterialId
}

function SolidSegmentFace({
  def,
  ...rest
}: Omit<FacePlaneProps, 'material'> & { def: SolidMaterialDef }) {
  const material = useSolidMaterial(def)
  return <FacePlane {...rest} material={material} />
}

function TexturedSegmentFace({
  def,
  ...rest
}: Omit<FacePlaneProps, 'material'> & { def: TexturedMaterialDef }) {
  const material = useTexturedMaterial(def)
  return <FacePlane {...rest} material={material} />
}

function ProceduralSegmentFace({
  def,
  ...rest
}: Omit<FacePlaneProps, 'material'> & { def: ProceduralMaterialDef }) {
  const material = useProceduralMaterial(def)
  return <FacePlane {...rest} material={material} />
}

function SegmentFaceInner({ materialId, ...rest }: SegmentFaceProps) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <TexturedSegmentFace def={def} {...rest} />
  if (def.kind === 'procedural') return <ProceduralSegmentFace def={def} {...rest} />
  return <SolidSegmentFace def={def} {...rest} />
}

const SegmentFace = memo(SegmentFaceInner)

interface WallSegmentProps {
  wall: WallSpec
}

/** Renders one wall as: a generic body box per render-segment (structural
 *  concrete look) plus up to two interior face planes per segment, each
 *  painted with the adjacent room's wall finish. Sides are sampled per
 *  segment because some walls (e.g. wall-int-mid-S, wall-int-corridor-S)
 *  span multiple rooms — each segment's face must pick up its own room's
 *  finish, not the room that happens to sit at the whole-wall midpoint.
 *  External faces (no adjacent interior room) skip rendering. */
const CENTER_X = APARTMENT_EXT_W / 2
const CENTER_Z = APARTMENT_EXT_D / 2

function WallSegmentInner({ wall }: WallSegmentProps) {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  // Wall height follows the (adjustable) plan ceiling height; per-wall
  // `topHeight` overrides (e.g. parapets) still win inside buildWallSegments.
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  // Reactive thickness inputs (this wall is memoised on `wall`, a constant, so
  // it would otherwise never re-render on a thickness change): the plan-wide
  // default + the whole walls array. Subscribing to ALL walls (not just this
  // one's override) is deliberate — a corner stays seamless only if BOTH walls
  // rebuild when EITHER changes, since each extends to its neighbour's outer
  // face (`wallEndAbutmentThickness`, override-aware). `thickness` + the abutment
  // extents below are real body-geometry deps, so the rebuild is exact.
  const wallThicknessDefault = useStore((s) => s.floorPlan.wallThickness)
  const planWalls = useStore((s) => s.floorPlan.walls)
  const wallThicknessOverride = planWalls.find((w) => w.id === wall.id)?.thicknessM
  const { camera, invalidate } = useThree()
  const groupRef = useRef<Group>(null)
  const opacityRef = useRef(1)
  // Last-applied `transparent` flag for the group's materials. Toggling
  // `Material.transparent` at runtime only changes the alpha-blend behaviour
  // after a `needsUpdate` (it's baked into the compiled program), so without
  // this the wall keeps rendering opaque even as `opacity` drops — the "values
  // decrease but the render doesn't update" bug. We flip needsUpdate only on the
  // transition (not every frame) to avoid needless shader recompiles.
  const transparentRef = useRef(false)

  // Outward (away-from-interior) horizontal normal + midpoint of this wall, used
  // to fade the wall when the camera sits on its outward side (between the camera
  // and the rooms). The outward direction is found per-wall by probing which
  // side is a room (robust to the flat's notched perimeter); if that's ambiguous
  // we fall back to "away from the bounding-box centre".
  const reveal = useMemo(() => {
    const mx = (wall.start[0] + wall.end[0]) / 2
    const mz = (wall.start[1] + wall.end[1]) / 2
    const len = Math.hypot(dx, dz) || 1
    const pnx = -dz / len
    const pnz = dx / len
    const probe = wallThicknessMetres(wall) / 2 + 0.3
    const out = orientOutward(mx, mz, pnx, pnz, isInteriorPoint, probe)
    let nx = pnx
    let nz = pnz
    if (out) {
      nx = out.nx
      nz = out.nz
    } else if (nx * (mx - CENTER_X) + nz * (mz - CENTER_Z) < 0) {
      nx = -nx
      nz = -nz
    }
    return { nx, nz, mx, mz }
  }, [wall, dx, dz])

  const isExterior = wall.thickness === 'external'

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const st = useStore.getState()
    const orbit = st.cameraMode === 'orbit'
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const revealMode = st.wallRevealMode ?? 'translucent'
    const revealScope = st.wallRevealScope ?? 'exterior'
    // Exterior walls always participate; interior partitions only in 'all' scope
    // (default 'exterior' keeps them solid so the room layout reads).
    const participates = isExterior || revealScope === 'all'
    let target = 1
    if (participates && orbit && revealEnabled && revealMode !== 'opaque') {
      // Exterior: fade when the camera is on the wall's OUTWARD side (the wall is
      // between the camera and the rooms). Interior partition: it has rooms on
      // both sides, so fade when the camera FACES it (revealing the room behind);
      // orient the normal toward the camera for that.
      let nx = reveal.nx
      let nz = reveal.nz
      if (!isExterior) {
        const f = cameraFacingNormal(
          reveal.mx,
          reveal.mz,
          nx,
          nz,
          camera.position.x,
          camera.position.z,
        )
        nx = f.nx
        nz = f.nz
      }
      const faded = wallRevealFactor(
        camera.position.x,
        camera.position.z,
        reveal.mx,
        reveal.mz,
        nx,
        nz,
        CENTER_X,
        CENTER_Z,
      )
      // translucent: walls never fully disappear (min 0.15 opacity).
      // auto-hide: walls can fully disappear (current legacy behaviour).
      target = revealMode === 'auto-hide' ? faded : Math.max(0.15, faded)
    }
    // Settled and fully opaque: nothing to do (the common case).
    if (Math.abs(target - opacityRef.current) < 0.004 && target >= 0.999) return
    const cur = opacityRef.current + (target - opacityRef.current) * 0.18
    opacityRef.current = cur
    // The canvas is frameloop="demand": once the camera stops, the loop halts —
    // which would freeze this opacity lerp mid-fade (walls stuck part-faded).
    // Keep requesting frames until the fade settles.
    if (Math.abs(cur - target) > 0.005) invalidate()
    // Publish so windows/doors on this wall fade with it (interior doors too,
    // when interior partitions participate). Always published while lerping so
    // the value also returns to 1 when a wall stops participating (scope change).
    setWallOpacity(wall.id, cur)
    const visible = cur > 0.02
    const transparent = cur < 0.985
    // Only force a material recompile when the transparent flag actually flips.
    const transparentChanged = transparent !== transparentRef.current
    transparentRef.current = transparent
    group.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.visible = visible
      const mat = o.material as MeshStandardMaterial | MeshStandardMaterial[]
      const apply = (m: MeshStandardMaterial) => {
        m.transparent = transparent
        m.opacity = cur
        // Keep depthWrite ON through the whole fade (WALL-FADE-DEPTHWRITE) — do
        // NOT flip it with `transparent`. Flipping it made a wall snap between a
        // solid occluder and a see-through pane the instant it crossed the ~0.985
        // threshold (visible popping while orbiting), and left faded walls (dw
        // off) sorting inconsistently against glass/openings (dw on) so the
        // backdrop bled through their overlap and bloomed into a bright band. A
        // watertight wall body writes depth as one surface, so its front face
        // occludes its back (no double-blend) and it sorts cleanly against every
        // other transparent surface — smooth, artifact-free translucency.
        m.depthWrite = true
        if (transparentChanged) m.needsUpdate = true
      }
      if (Array.isArray(mat)) mat.forEach(apply)
      else if (mat) apply(mat)
    })
  })
  // Resolve reactively (mirrors wallThicknessMetres' precedence: per-wall
  // override → plan default → built-in) so a 2D-editor thickness edit rebuilds
  // this wall's body. Pure collision/geometry still read the module holder.
  const thickness =
    wallThicknessOverride != null && wallThicknessOverride > 0
      ? wallThicknessOverride
      : wall.thickness === 'external'
        ? (wallThicknessDefault?.external ?? FLAT.externalWallThickness)
        : (wallThicknessDefault?.internal ?? FLAT.internalWallThickness)
  // Half-thickness of the wall this end abuts (0 if the end is free). Used to
  // (a) extend the body box outward so corners close flush, and (b) pull the
  // interior face plane in to the inner edge of the abutting wall, so finish
  // textures stop exactly at the inner corner with no overlap into the body.
  const startAbut = wallEndAbutmentThickness(wall, WALLS, true) / 2
  const endAbut = wallEndAbutmentThickness(wall, WALLS, false) / 2
  // Distinct per-wall depth bias (its index in WALLS) applied to the body's
  // polygonOffset, so where two walls OVERLAP at a corner (each extended to the
  // other by the abutment) their now-coplanar faces resolve to a deterministic
  // winner instead of z-fighting — a stable corner instead of a flickering one
  // once faded walls write depth (WALL-CORNER-BIAS, mirrors the room editor).
  const bodyBias = WALLS.findIndex((w) => w.id === wall.id)
  const segments = buildWallSegments(wall, ceilingHeight)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2

  // Body geometry: ONE watertight extruded shape (wall rectangle minus window
  // holes / door notches) instead of separate abutting boxes. Boxes left
  // internal end-cap faces that showed through as floor-to-ceiling seams at
  // every opening once the wall faded translucent for the dollhouse reveal; a
  // single shape has no internal faces, so the translucent wall reads cleanly.
  const wallTop = wall.topHeight ?? ceilingHeight
  const bodyGeometry = useMemo(
    () =>
      extrudeWallBody(buildWallBodyOutline(wall, wallTop, length, startAbut, endAbut), thickness),
    [wall, wallTop, length, startAbut, endAbut, thickness],
  )
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])

  // Subdivide each render segment further by room boundary projections
  // so a wall like wall-int-mid-S (which spans bath2/SY/HS on its north
  // face with no cutouts) gets one face-span per backing room.
  type FaceSpan = WallSegmentSpan & { positive: RoomId | null; negative: RoomId | null }
  const faceSpans: FaceSpan[] = []
  for (const s of segments) {
    const spans = wallSidesSpans(wall, s.start, s.end)
    for (const span of spans) {
      faceSpans.push({
        start: span.start,
        end: span.end,
        bottom: s.bottom,
        top: s.top,
        positive: span.positive as RoomId | null,
        negative: span.negative as RoomId | null,
      })
    }
  }

  const wallFinishes = useStore(
    useShallow((s) => {
      const out: Partial<Record<RoomId, MaterialId>> = {}
      for (const span of faceSpans) {
        // Accent override (per wall+room face) wins over the room default.
        if (span.positive)
          out[span.positive] =
            s.finishes.wallAccents[`${wall.id}:${span.positive}`] ?? s.finishes.walls[span.positive]
        if (span.negative)
          out[span.negative] =
            s.finishes.wallAccents[`${wall.id}:${span.negative}`] ?? s.finishes.walls[span.negative]
      }
      return out
    }),
  )
  const selectWall = useStore((s) => s.selectWall)
  const selectedWall = useStore((s) => s.selectedWall)
  const crownMolding = useFeature('crownMolding')
  const accentWalls = useFeature('wallAccentPicker')
  // Cheap baked wall/floor corner AO (RD-403): feature flag AND the per-tier
  // quality setting (on for performance/medium, off on high+ where SSAO runs).
  const cornerAoFlag = useFeature('cornerAo')
  const cornerAoQuality = useQuality().cornerAo
  const cornerAoOn = cornerAoFlag && cornerAoQuality
  // Accent-wall finishing is editing, so it's only reachable inside the room
  // editor (orbit) AND when the `wallAccentPicker` feature is on. Otherwise a
  // wall-face click does nothing (view-only / feature disabled).
  const selectWallIfEditing = (wallId: string, roomId: RoomId) => {
    if (accentWalls && canEditScene(useStore.getState())) selectWall(wallId, roomId)
  }

  return (
    <group ref={groupRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {/* Body — a single watertight extruded shape (wall outline minus window
          holes / door notches), extended at each end by the abutting wall's
          half-thickness so outside corners close flush. One mesh = no internal
          seams when the wall fades translucent for the dollhouse reveal. */}
      <mesh geometry={bodyGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={WALL_STRUCTURE_COLOR}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={0}
          polygonOffsetUnits={bodyBias}
        />
      </mesh>
      {/* Interior face planes — one per (face-span, side), each painted
          with the room actually backing that span. Spans that touch the
          wall's absolute start/end are extended outward by the abutting
          wall's half-thickness so the finish reaches the outer corner edge
          (matching the body extension above). The extra portion sits inside
          the perpendicular wall's body and is hidden from view; visible
          finishes from adjacent walls now meet flush at the outer corner. */}
      {faceSpans.map((span, i) => {
        const extStart = span.start < 1e-6 ? startAbut : 0
        const extEnd = span.end > length - 1e-6 ? endAbut : 0
        const a = span.start - extStart
        const b = span.end + extEnd
        const segLen = b - a
        const segMid = (a + b) / 2 - length / 2
        const segHeight = span.top - span.bottom
        const segMidY = span.bottom + segHeight / 2
        const positiveMat = span.positive ? wallFinishes[span.positive] : null
        const negativeMat = span.negative ? wallFinishes[span.negative] : null
        // Skirting boards only on spans that reach the floor.
        const onFloor = span.bottom < 0.01
        // Crown molding only on full-height spans (span top at or near ceiling).
        // The 0.01 m tolerance absorbs floating-point differences. The same
        // abutment-extended segLen already closes mitre corners correctly.
        const atCeiling = crownMolding && span.top >= ceilingHeight - 0.01
        return (
          <group key={i}>
            {/* Baked corner-AO strips along the floor edge of each room-facing
                side — independent of whether a wall finish is set, so the
                grounding cue is present on bare plaster too (RD-403). */}
            {cornerAoOn && onFloor && span.positive && (
              <WallFloorAO segLen={segLen} segMid={segMid} thickness={thickness} sign={1} />
            )}
            {cornerAoOn && onFloor && span.negative && (
              <WallFloorAO segLen={segLen} segMid={segMid} thickness={thickness} sign={-1} />
            )}
            {positiveMat ? (
              <>
                <SilentErrorBoundary resetKey={positiveMat}>
                  <Suspense fallback={null}>
                    <SegmentFace
                      segLen={segLen}
                      segHeight={segHeight}
                      segMid={segMid}
                      segMidY={segMidY}
                      thickness={thickness}
                      sign={1}
                      materialId={positiveMat}
                      roomId={span.positive ?? undefined}
                      onSelect={
                        span.positive && accentWalls
                          ? () => selectWallIfEditing(wall.id, span.positive!)
                          : undefined
                      }
                    />
                  </Suspense>
                </SilentErrorBoundary>
                {onFloor && (
                  <Baseboard segLen={segLen} segMid={segMid} thickness={thickness} sign={1} />
                )}
                {atCeiling && (
                  <CrownMolding
                    segLen={segLen}
                    segMid={segMid}
                    segTop={span.top}
                    thickness={thickness}
                    sign={1}
                  />
                )}
                {selectedWall?.wallId === wall.id && selectedWall.roomId === span.positive && (
                  <FaceHighlight
                    segLen={segLen}
                    segHeight={segHeight}
                    segMid={segMid}
                    segMidY={segMidY}
                    thickness={thickness}
                    sign={1}
                  />
                )}
              </>
            ) : null}
            {negativeMat ? (
              <>
                <SilentErrorBoundary resetKey={negativeMat}>
                  <Suspense fallback={null}>
                    <SegmentFace
                      segLen={segLen}
                      segHeight={segHeight}
                      segMid={segMid}
                      segMidY={segMidY}
                      thickness={thickness}
                      sign={-1}
                      materialId={negativeMat}
                      roomId={span.negative ?? undefined}
                      onSelect={
                        span.negative && accentWalls
                          ? () => selectWallIfEditing(wall.id, span.negative!)
                          : undefined
                      }
                    />
                  </Suspense>
                </SilentErrorBoundary>
                {onFloor && (
                  <Baseboard segLen={segLen} segMid={segMid} thickness={thickness} sign={-1} />
                )}
                {atCeiling && (
                  <CrownMolding
                    segLen={segLen}
                    segMid={segMid}
                    segTop={span.top}
                    thickness={thickness}
                    sign={-1}
                  />
                )}
                {selectedWall?.wallId === wall.id && selectedWall.roomId === span.negative && (
                  <FaceHighlight
                    segLen={segLen}
                    segHeight={segHeight}
                    segMid={segMid}
                    segMidY={segMidY}
                    thickness={thickness}
                    sign={-1}
                  />
                )}
              </>
            ) : null}
          </group>
        )
      })}
    </group>
  )
}

export const WallSegment = memo(WallSegmentInner, (a, b) => a.wall === b.wall)

export type { WallSegmentSpan }
