import type { ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import { allowsQuarterTurns } from '../../materials/finishDirection'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types'
import {
  useDeferredFinishId,
  useFloorProceduralMaterial,
  useFloorTexturedMaterial,
  useMaterialDef,
  useSolidMaterial,
} from '../../materials/useMaterial'
import {
  type UvTransform,
  worldUvPlaneGeometry,
  worldUvShapeGeometry,
} from '../../materials/worldUv'
import { isDragRelease } from '../../scene/clickVsDrag'
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { canEditScene } from '../../state/editing'
import { confirmAndEnterRoom } from '../../state/enterRoomConfirm'
import { useStore } from '../../state/store'
import { floorClickAction } from './floorClick'

/** Click-to-edit + hover affordance for a custom-plan room floor (mirrors the
 *  default apartment's `RoomFloor`). **Inside** the room editor a floor click
 *  selects the room, which is what opens the finish picker — without it a
 *  custom-plan room had no way to reach its own floor/wall finishes by clicking
 *  the floor (the default flat's `RoomFloor` has always done this). In the
 *  view-only overview a click dives into the room's editor instead, and
 *  hovering shows a pointer cursor + highlight. No-op without a `roomId`. */
function useOverviewRoomEntry(roomId?: string) {
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!roomId) return
      const s = useStore.getState()
      const action = floorClickAction({
        canEdit: canEditScene(s),
        cameraMode: s.cameraMode,
        roomEditorActive: s.roomEditor.active,
      })
      if (action === 'select-room') {
        // Inside the room editor: clicking the floor opens the finish picker.
        e.stopPropagation()
        s.selectRoom(roomId)
        return
      }
      if (action === 'enter-room') {
        // Skip the tail of an orbit drag (it lands here as a click too).
        if (isDragRelease(e.nativeEvent)) return
        e.stopPropagation()
        void confirmAndEnterRoom(roomId)
      }
    },
    [roomId],
  )
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!roomId) return
      const s = useStore.getState()
      if (s.cameraMode !== 'orbit' || s.roomEditor.active) return
      e.stopPropagation()
      s.setHoveredRoom(roomId)
      document.body.style.cursor = 'pointer'
    },
    [roomId],
  )
  const onPointerOut = useCallback(() => {
    const s = useStore.getState()
    if (s.hoveredRoomId === roomId) {
      s.setHoveredRoom(null)
      document.body.style.cursor = ''
    }
  }, [roomId])
  return roomId ? { onClick, onPointerOver, onPointerOut } : {}
}

/**
 * A floor plane for a user-authored plan room, finished with any catalog
 * floor material. Mirrors RoomFloor's material dispatch but without the
 * RoomId-keyed finishes selection (custom rooms aren't in the finishes slice).
 * A `polygon` (world-metre `[x,z]` verts) renders a triangulated non-rectangular
 * floor; otherwise the origin/width/depth rectangle is used.
 */
interface Rect {
  origin: [number, number]
  width: number
  depth: number
  polygon?: [number, number][]
  /** When set, clicking the floor in the overview enters that room's editor. */
  roomId?: string
  /** Optional floor-texture transform (scale/angle) — SweetHome3DJS parity. */
  texTransform?: UvTransform
  /** Tile period in metres (material `uvScale`) for the RD-406 repetition
   *  break-up — only tiling (procedural/textured) finishes set it. */
  tileSize?: number
  /** May the break-up turn a cell by 90°? Only for a finish with no lay
   *  direction (`materials/finishDirection.ts`). */
  quarterTurns?: boolean
}
type Props = Rect & { materialId: MaterialId }

function FloorMesh({
  origin,
  width,
  depth,
  polygon,
  roomId,
  texTransform,
  tileSize,
  quarterTurns,
  material,
}: Rect & { material: MeshStandardMaterial }) {
  const handlers = useOverviewRoomEntry(roomId)
  // Drop-target tag for the canvas finish drag (scene/finishDropTarget.ts).
  const userData = roomId ? finishSurfaceUserData('floor', roomId) : undefined
  if (polygon && polygon.length >= 3) {
    // Non-rectangular floors take the triangulated shape path — which now gets
    // the SAME repetition break-up as the rectangles, by clipping the room to
    // the tile grid (`breakRepetitionShape`) instead of subdividing a plane.
    return (
      <PolygonFloor
        polygon={polygon}
        material={material}
        handlers={handlers}
        userData={userData}
        texTransform={texTransform}
        tileSize={tileSize}
        quarterTurns={quarterTurns}
      />
    )
  }
  return (
    <RectFloor
      origin={origin}
      width={width}
      depth={depth}
      material={material}
      handlers={handlers}
      userData={userData}
      texTransform={texTransform}
      tileSize={tileSize}
      quarterTurns={quarterTurns}
    />
  )
}

/** Rectangular-room floor plane. Geometry is memoised on its dimensions/UV
 *  transform and disposed when those change or the mesh unmounts — a `new`
 *  geometry passed via the `geometry=` prop is NOT owned by R3F, so rebuilding
 *  it every render (as the old inline path did) leaks GPU buffers toward context
 *  loss on long edit sessions. Mirrors {@link PolygonFloor}. */
function RectFloor({
  origin,
  width,
  depth,
  material,
  handlers,
  userData,
  texTransform,
  tileSize,
  quarterTurns = true,
}: {
  origin: [number, number]
  width: number
  depth: number
  material: MeshStandardMaterial
  handlers?: Record<string, unknown>
  userData?: Record<string, unknown>
  texTransform?: UvTransform
  tileSize?: number
  quarterTurns?: boolean
}) {
  const texScale = texTransform?.scale
  const texAngle = texTransform?.angle
  // RD-406 repetition break-up (`tileBreakup`, pro-tier): per-tile-cell UV
  // rotation/offset on a large tiled floor. Off / no tile size → plain plane.
  const breakup = tileSize != null && isFeatureEnabled('tileBreakup') ? tileSize : undefined
  // Guard degenerate sizes: a zero/negative plane would build an empty/NaN
  // geometry. Returning null keeps the render valid and skips the leak entirely.
  const valid = width > 0 && depth > 0
  const geometry = useMemo(
    () =>
      valid
        ? worldUvPlaneGeometry(
            width,
            depth,
            { scale: texScale, angle: texAngle },
            breakup,
            quarterTurns,
          )
        : null,
    [valid, width, depth, texScale, texAngle, breakup, quarterTurns],
  )
  useDisposeGeometry(geometry)
  if (!geometry) return null
  return (
    <mesh
      position={[origin[0] + width / 2, 0.006, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      material={material}
      geometry={geometry}
      userData={userData}
      {...handlers}
    />
  )
}

/** Triangulated absolute-coord floor for a non-rectangular room (verts are
 *  world metres, so no position offset). Geometry is memoised on the polygon. */
function PolygonFloor({
  polygon,
  material,
  handlers,
  userData,
  texTransform,
  tileSize,
  quarterTurns = true,
}: {
  polygon: [number, number][]
  material: MeshStandardMaterial
  handlers?: Record<string, unknown>
  userData?: Record<string, unknown>
  texTransform?: UvTransform
  tileSize?: number
  quarterTurns?: boolean
}) {
  const texScale = texTransform?.scale
  const texAngle = texTransform?.angle
  // RD-406 break-up for irregular rooms — same flag + same tile period as the
  // rect path, so an L-shaped living room stops out-repeating its neighbours.
  const breakup = tileSize != null && isFeatureEnabled('tileBreakup') ? tileSize : undefined
  const geometry = useMemo(
    () =>
      worldUvShapeGeometry(polygon, { scale: texScale, angle: texAngle }, breakup, quarterTurns),
    [polygon, texScale, texAngle, breakup, quarterTurns],
  )
  // Geometry passed via `geometry=` isn't R3F-owned: dispose on change/unmount.
  useDisposeGeometry(geometry)
  return (
    <mesh
      position={[0, 0.006, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      material={material}
      geometry={geometry}
      userData={userData}
      {...handlers}
    />
  )
}

function Solid({ def, ...rest }: Rect & { def: SolidMaterialDef }) {
  return <FloorMesh {...rest} material={useSolidMaterial(def)} />
}
function Textured({ def, ...rest }: Rect & { def: TexturedMaterialDef }) {
  // Floor-specific hook: a scan carrying a displacement map gets POM on
  // High/Maximum (PHOTO-POM), otherwise the plain textured material.
  const material = useFloorTexturedMaterial(def)
  return (
    <FloorMesh
      {...rest}
      material={material}
      tileSize={def.uvScale[0]}
      quarterTurns={allowsQuarterTurns(def, material)}
    />
  )
}
function Procedural({ def, ...rest }: Rect & { def: ProceduralMaterialDef }) {
  const material = useFloorProceduralMaterial(def)
  return (
    <FloorMesh
      {...rest}
      material={material}
      tileSize={def.uvScale[0]}
      quarterTurns={allowsQuarterTurns(def, material)}
    />
  )
}

function Inner({ materialId, ...rest }: Props) {
  // FINISH-DEFER: resolve the DEFERRED id so a suspending photo finish keeps the
  // surface's current look on screen instead of blanking it (see useDeferredFinishId).
  const def = useMaterialDef(useDeferredFinishId(materialId))
  if (def.kind === 'textured') return <Textured def={def} {...rest} />
  if (def.kind === 'procedural') return <Procedural def={def} {...rest} />
  return <Solid def={def} {...rest} />
}

export function PlanRoomFloor(props: Props) {
  return (
    <SilentErrorBoundary resetKey={props.materialId}>
      <Suspense fallback={null}>
        <Inner {...props} />
      </Suspense>
    </SilentErrorBoundary>
  )
}
