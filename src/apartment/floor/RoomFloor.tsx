import type { ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useCallback, useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types'
import {
  useFloorProceduralMaterial,
  useFloorTexturedMaterial,
  useMaterialDef,
  useSolidMaterial,
} from '../../materials/useMaterial'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { isDragRelease } from '../../scene/clickVsDrag'
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { canEditScene } from '../../state/editing'
import { confirmAndEnterRoom } from '../../state/enterRoomConfirm'
import { useStore } from '../../state/store'
import type { RoomId } from '../types'

const FLOOR_LIFT = 0.001

interface RoomFloorProps {
  roomId: RoomId
  origin: [number, number]
  width: number
  depth: number
  materialId: MaterialId
}

interface FloorMeshProps {
  roomId: RoomId
  origin: [number, number]
  width: number
  depth: number
  material: MeshStandardMaterial
  /** Tile period in metres (material `uvScale`) for the RD-406 repetition
   *  break-up — only tiling (procedural/textured) finishes pass it. */
  tileSize?: number
}

function FloorMesh({ roomId, origin, width, depth, material, tileSize }: FloorMeshProps) {
  const selectRoom = useStore((s) => s.selectRoom)
  // RD-406 repetition break-up (`tileBreakup`, pro-tier): a large tiled floor
  // gets a per-tile-cell UV rotation/offset so it stops repeating every metre.
  // Off (or no tile size) → the plain world-UV plane (byte-identical).
  const breakup = tileSize != null && isFeatureEnabled('tileBreakup') ? tileSize : undefined
  const geometry = useMemo(
    () => worldUvPlaneGeometry(width, depth, undefined, breakup),
    [width, depth, breakup],
  )
  // Geometry passed via `geometry=` isn't R3F-owned: dispose on resize/unmount.
  useDisposeGeometry(geometry)
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const state = useStore.getState()
      if (canEditScene(state)) {
        // Inside the room editor: clicking the floor opens the finish picker.
        e.stopPropagation()
        selectRoom(roomId)
        return
      }
      // View-only orbit over the whole flat: clicking a room dives into its
      // editor (the primary way to start editing) — after a confirm, since it's
      // easy to click a floor by accident while looking around. Walk does nothing.
      // A press-drag that rotated the orbit camera ends as a "click" here too, so
      // skip those — only a genuine tap should prompt to enter the room.
      if (state.cameraMode === 'orbit' && !state.roomEditor.active) {
        if (isDragRelease(e.nativeEvent)) return
        e.stopPropagation()
        void confirmAndEnterRoom(roomId)
      }
    },
    [roomId, selectRoom],
  )
  // In the view-only overview, a room floor is a click target ("click to edit"),
  // so flag it for the hover highlight + show a pointer cursor.
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
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
  return (
    <mesh
      position={[origin[0] + width / 2, FLOOR_LIFT, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      // Drop-target tag for the canvas finish drag (scene/finishDropTarget.ts).
      userData={finishSurfaceUserData('floor', roomId)}
      material={material}
      geometry={geometry}
    />
  )
}

function SolidRoomFloor({
  def,
  ...rest
}: Omit<FloorMeshProps, 'material'> & { def: SolidMaterialDef }) {
  const material = useSolidMaterial(def)
  return <FloorMesh {...rest} material={material} />
}

function TexturedRoomFloor({
  def,
  ...rest
}: Omit<FloorMeshProps, 'material' | 'tileSize'> & { def: TexturedMaterialDef }) {
  // Floor-specific hook: a scan carrying a displacement map gets POM on
  // High/Maximum (PHOTO-POM), otherwise the plain textured material.
  const material = useFloorTexturedMaterial(def)
  return <FloorMesh {...rest} material={material} tileSize={def.uvScale[0]} />
}

function ProceduralRoomFloor({
  def,
  ...rest
}: Omit<FloorMeshProps, 'material' | 'tileSize'> & { def: ProceduralMaterialDef }) {
  const material = useFloorProceduralMaterial(def)
  return <FloorMesh {...rest} material={material} tileSize={def.uvScale[0]} />
}

function RoomFloorInner({ materialId, ...rest }: RoomFloorProps) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <TexturedRoomFloor def={def} {...rest} />
  if (def.kind === 'procedural') return <ProceduralRoomFloor def={def} {...rest} />
  return <SolidRoomFloor def={def} {...rest} />
}

const RoomFloorMemo = memo(RoomFloorInner, (prev, next) => {
  return (
    prev.roomId === next.roomId &&
    prev.materialId === next.materialId &&
    prev.origin[0] === next.origin[0] &&
    prev.origin[1] === next.origin[1] &&
    prev.width === next.width &&
    prev.depth === next.depth
  )
})

/** Wraps the per-room floor mesh in a Suspense boundary so a slow
 *  texture load on one room doesn't block the others. */
export function RoomFloor(props: RoomFloorProps) {
  return (
    <SilentErrorBoundary resetKey={props.materialId}>
      <Suspense fallback={null}>
        <RoomFloorMemo {...props} />
      </Suspense>
    </SilentErrorBoundary>
  )
}
