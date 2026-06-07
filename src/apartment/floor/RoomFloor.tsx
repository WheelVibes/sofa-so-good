import type { ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useCallback, useMemo } from 'react'
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
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { canEditScene } from '../../state/editing'
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
}

function FloorMesh({ roomId, origin, width, depth, material }: FloorMeshProps) {
  const selectRoom = useStore((s) => s.selectRoom)
  const geometry = useMemo(() => worldUvPlaneGeometry(width, depth), [width, depth])
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
      // editor (the primary way to start editing). Walk mode does nothing.
      if (state.cameraMode === 'orbit' && !state.roomEditor.active) {
        e.stopPropagation()
        state.enterRoomEditor(roomId)
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
}: Omit<FloorMeshProps, 'material'> & { def: TexturedMaterialDef }) {
  const material = useTexturedMaterial(def)
  return <FloorMesh {...rest} material={material} />
}

function ProceduralRoomFloor({
  def,
  ...rest
}: Omit<FloorMeshProps, 'material'> & { def: ProceduralMaterialDef }) {
  const material = useProceduralMaterial(def)
  return <FloorMesh {...rest} material={material} />
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
