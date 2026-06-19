import type { ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
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
import {
  type UvTransform,
  worldUvPlaneGeometry,
  worldUvShapeGeometry,
} from '../../materials/worldUv'
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { confirmAndEnterRoom } from '../../state/enterRoomConfirm'
import { useStore } from '../../state/store'

/** Click-to-edit + hover affordance for a custom-plan room floor in the
 *  view-only overview (mirrors the default apartment's `RoomFloor`). Clicking a
 *  room dives into its per-room editor; hovering shows a pointer cursor +
 *  highlight. No-op without a `roomId` or outside the overview. */
function useOverviewRoomEntry(roomId?: string) {
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!roomId) return
      const s = useStore.getState()
      if (s.cameraMode === 'orbit' && !s.roomEditor.active) {
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
}
type Props = Rect & { materialId: MaterialId }

function FloorMesh({
  origin,
  width,
  depth,
  polygon,
  roomId,
  texTransform,
  material,
}: Rect & { material: MeshStandardMaterial }) {
  const handlers = useOverviewRoomEntry(roomId)
  // Drop-target tag for the canvas finish drag (scene/finishDropTarget.ts).
  const userData = roomId ? finishSurfaceUserData('floor', roomId) : undefined
  if (polygon && polygon.length >= 3) {
    return (
      <PolygonFloor
        polygon={polygon}
        material={material}
        handlers={handlers}
        userData={userData}
        texTransform={texTransform}
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
}: {
  origin: [number, number]
  width: number
  depth: number
  material: MeshStandardMaterial
  handlers?: Record<string, unknown>
  userData?: Record<string, unknown>
  texTransform?: UvTransform
}) {
  const texScale = texTransform?.scale
  const texAngle = texTransform?.angle
  // Guard degenerate sizes: a zero/negative plane would build an empty/NaN
  // geometry. Returning null keeps the render valid and skips the leak entirely.
  const valid = width > 0 && depth > 0
  const geometry = useMemo(
    () => (valid ? worldUvPlaneGeometry(width, depth, { scale: texScale, angle: texAngle }) : null),
    [valid, width, depth, texScale, texAngle],
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
}: {
  polygon: [number, number][]
  material: MeshStandardMaterial
  handlers?: Record<string, unknown>
  userData?: Record<string, unknown>
  texTransform?: UvTransform
}) {
  const texScale = texTransform?.scale
  const texAngle = texTransform?.angle
  const geometry = useMemo(
    () => worldUvShapeGeometry(polygon, { scale: texScale, angle: texAngle }),
    [polygon, texScale, texAngle],
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
  return <FloorMesh {...rest} material={useTexturedMaterial(def)} />
}
function Procedural({ def, ...rest }: Rect & { def: ProceduralMaterialDef }) {
  return <FloorMesh {...rest} material={useProceduralMaterial(def)} />
}

function Inner({ materialId, ...rest }: Props) {
  const def = useMaterialDef(materialId)
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
