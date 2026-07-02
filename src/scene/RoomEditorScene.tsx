import { Canvas } from '@react-three/fiber'
import { PlanRoomShell } from '../apartment/PlanRoomShell'
import { RoomShell } from '../apartment/RoomShell'
import { FurnitureLayer } from '../furniture/FurnitureLayer'
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader'
import { useStore } from '../state/store'
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { AnisotropyController } from './AnisotropyController'
import { AnnotationsOverlay } from './AnnotationsOverlay'
import { ClearanceOverlay } from './ClearanceOverlay'
import { ContextLossGuard } from './ContextLossGuard'
import { CameraRig } from './cameras/CameraRig'
import { CameraForwardTracker } from './cameras/cameraForward'
import { DevCameraExpose } from './DevCameraExpose'
import { DragController } from './DragController'
import { deselectOnMiss } from './deselectOnMiss'
import { FinishDropSurface } from './FinishDropSurface'
import { FrameRenderedNotifier } from './FrameRenderedNotifier'
import { GridOverlay } from './GridOverlay'
import { PlacementDropAnimator } from './PlacementDropAnimator'
import { PlacementGhost } from './PlacementGhost'
import { getRoomEditorShell } from './roomEditorShell'
import { ScreenshotController } from './ScreenshotController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { ResizeGizmo } from './selection/ResizeGizmo'
import { RotateGizmo } from './selection/RotateGizmo'
import { SelectionOutline } from './selection/SelectionOutline'

/** Lightweight per-room editor scene. Renders one isolated room with a flat,
 *  Performance-tier look (no sun/IBL/post). Reuses every store-driven
 *  interaction controller so catalog/placement/measurement work unchanged. */
export function RoomEditorScene() {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const plan = useStore((s) => s.floorPlan)
  if (!roomId) return null
  const editorShell = getRoomEditorShell(plan, roomId)
  if (!editorShell) return null
  const shell = editorShell.shell
  const [cx, cz] = shell.center
  const r = shell.radius
  // Mask the alignment grid to just this room (its polygon when free-form, else
  // its footprint rects) so it never paints the whole apartment floor.
  const gridPolygon =
    editorShell.kind === 'plan' && editorShell.shell.room.polygon?.length
      ? (editorShell.shell.room.polygon as [number, number][])
      : undefined
  const gridRects = shell.rects
  return (
    <Canvas
      dpr={1}
      shadows={false}
      camera={{
        position: [cx + r * 1.6, r * 1.8, cz + r * 1.6],
        fov: 45,
        near: 0.05,
        far: 100,
      }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        preserveDrawingBuffer: true,
      }}
      onPointerMissed={deselectOnMiss}
    >
      <ContextLossGuard />
      <AnisotropyController />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 2.2]} />
      <ambientLight intensity={0.6} />
      {editorShell.kind === 'default' ? (
        <RoomShell shell={editorShell.shell} />
      ) : (
        <PlanRoomShell shell={editorShell.shell} />
      )}
      <GridOverlay rects={gridRects} polygon={gridPolygon} />
      <AlignmentGuides />
      <ClearanceOverlay />
      <FurnitureLayer room={shell} />
      <FurnitureMaterialLoader />
      <SelectionOutline />
      <RotateGizmo />
      <ResizeGizmo />
      <HoverHighlight />
      <PlacementGhost />
      <PlacementDropAnimator />
      <DragController />
      <FinishDropSurface />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      <AnnotationsOverlay />
      <ScreenshotController />
      <FrameRenderedNotifier />
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
    </Canvas>
  )
}
