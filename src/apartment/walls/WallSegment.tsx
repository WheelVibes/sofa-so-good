import { useFrame, useThree } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, Mesh, type MeshStandardMaterial } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
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
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { APARTMENT_EXT_D, APARTMENT_EXT_W, WALLS } from '../constants'
import type { RoomId, WallSpec } from '../types'
import {
  buildWallSegments,
  type WallSegment as WallSegmentSpan,
  wallEndAbutmentThickness,
  wallThicknessMetres,
} from '../wallSegments'
import { setWallOpacity } from './wallReveal'
import { wallSidesSpans } from './wallRoomSides'

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
    <mesh position={[segMid, BASEBOARD_H / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[segLen, BASEBOARD_H, 0.018]} />
      <meshStandardMaterial color="#eeece6" roughness={0.55} metalness={0} />
    </mesh>
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
    <mesh position={[segMid, segTop - CROWN_H / 2, z]}>
      <boxGeometry args={[segLen, CROWN_H, CROWN_T]} />
      <meshStandardMaterial
        color="#eeece6"
        roughness={0.55}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function WallSegmentInner({ wall }: WallSegmentProps) {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  // Wall height follows the (adjustable) plan ceiling height; per-wall
  // `topHeight` overrides (e.g. parapets) still win inside buildWallSegments.
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const { camera } = useThree()
  const groupRef = useRef<Group>(null)
  const opacityRef = useRef(1)

  // Outward (away-from-interior) horizontal normal of this wall, used to fade
  // the wall when it sits between the orbit camera and the apartment centre.
  const reveal = useMemo(() => {
    const mx = (wall.start[0] + wall.end[0]) / 2
    const mz = (wall.start[1] + wall.end[1]) / 2
    const len = Math.hypot(dx, dz) || 1
    // Two perpendiculars; pick the one pointing away from the apartment centre.
    let nx = -dz / len
    let nz = dx / len
    if (nx * (mx - CENTER_X) + nz * (mz - CENTER_Z) < 0) {
      nx = -nx
      nz = -nz
    }
    return { nx, nz }
  }, [wall.start, wall.end, dx, dz])

  // Only exterior perimeter walls are revealed; internal partitions stay solid
  // so the room layout reads clearly.
  const revealable = wall.thickness === 'external'

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const st = useStore.getState()
    const orbit = st.cameraMode === 'orbit'
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const revealMode = st.wallRevealMode ?? 'translucent'
    let target = 1
    if (revealable && orbit && revealEnabled && revealMode !== 'opaque') {
      const cdx = CENTER_X - camera.position.x
      const cdz = CENTER_Z - camera.position.z
      const clen = Math.hypot(cdx, cdz) || 1
      // dot(outwardNormal, camera→centre dir). Near walls face the camera, so
      // their outward normal opposes this direction (dot ≈ −1) → fade out.
      const d = (reveal.nx * cdx + reveal.nz * cdz) / clen
      // Wide reveal: near walls fully fade (d≈−1) AND grazing/side walls that
      // face the camera even slightly fade partially (d up to +0.25), opening
      // the dollhouse more; only walls clearly on the far side (d≳0.25) stay solid.
      const faded = smoothstep(-0.2, 0.25, d)
      // translucent: walls never fully disappear (min 0.15 opacity).
      // auto-hide: walls can fully disappear (current legacy behaviour).
      target = revealMode === 'auto-hide' ? faded : Math.max(0.15, faded)
    }
    // Settled and fully opaque: nothing to do (the common case).
    if (Math.abs(target - opacityRef.current) < 0.004 && target >= 0.999) return
    const cur = opacityRef.current + (target - opacityRef.current) * 0.18
    opacityRef.current = cur
    // Publish so windows/doors on this wall fade with it.
    if (revealable) setWallOpacity(wall.id, cur)
    const visible = cur > 0.02
    const transparent = cur < 0.985
    group.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.visible = visible
      const mat = o.material as MeshStandardMaterial | MeshStandardMaterial[]
      const apply = (m: MeshStandardMaterial) => {
        m.transparent = transparent
        m.opacity = cur
        m.depthWrite = !transparent
      }
      if (Array.isArray(mat)) mat.forEach(apply)
      else if (mat) apply(mat)
    })
  })
  const thickness = wallThicknessMetres(wall)
  // Half-thickness of the wall this end abuts (0 if the end is free). Used to
  // (a) extend the body box outward so corners close flush, and (b) pull the
  // interior face plane in to the inner edge of the abutting wall, so finish
  // textures stop exactly at the inner corner with no overlap into the body.
  const startAbut = wallEndAbutmentThickness(wall, WALLS, true) / 2
  const endAbut = wallEndAbutmentThickness(wall, WALLS, false) / 2
  const segments = buildWallSegments(wall, ceilingHeight)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2

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
  // Accent-wall finishing is editing, so it's only reachable inside the room
  // editor (orbit). Outside it, wall-face clicks do nothing (view-only).
  const selectWallIfEditing = (wallId: string, roomId: RoomId) => {
    if (canEditScene(useStore.getState())) selectWall(wallId, roomId)
  }

  return (
    <group ref={groupRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {/* Body — one box per render segment (cutouts split the body). At the
          wall's absolute start/end, extend the body box by the abutting
          wall's half-thickness so it reaches that wall's outer face; without
          this, centerline-length boxes leave a notch at every outside corner. */}
      {segments.map((s, i) => {
        const extStart = s.start < 1e-6 ? startAbut : 0
        const extEnd = s.end > length - 1e-6 ? endAbut : 0
        const segLen = s.end - s.start + extStart + extEnd
        const segMid = (s.start - extStart + s.end + extEnd) / 2 - length / 2
        const segHeight = s.top - s.bottom
        const segMidY = s.bottom + segHeight / 2
        return (
          <mesh key={i} position={[segMid, segMidY, 0]} castShadow receiveShadow>
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial color="#dcd8d2" roughness={0.95} />
          </mesh>
        )
      })}
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
                        span.positive
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
                        span.negative
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
