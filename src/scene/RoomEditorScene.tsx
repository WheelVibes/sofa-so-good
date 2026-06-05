import { Canvas } from '@react-three/fiber'
import { RoomShell } from '../apartment/RoomShell'
import { roomShell } from '../apartment/roomShell'
import { FurnitureLayer } from '../furniture/FurnitureLayer'
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader'
import { useStore } from '../state/store'
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { ClearanceOverlay } from './ClearanceOverlay'
import { ContextLossGuard } from './ContextLossGuard'
import { CameraRig } from './cameras/CameraRig'
import { CameraForwardTracker } from './cameras/cameraForward'
import { DevCameraExpose } from './DevCameraExpose'
import { DragController } from './DragController'
import { GridOverlay } from './GridOverlay'
import { PlacementGhost } from './PlacementGhost'
import { ScreenshotController } from './ScreenshotController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { SelectionOutline } from './selection/SelectionOutline'

/** Lightweight per-room editor scene. Renders one isolated room with a flat,
 *  Performance-tier look (no sun/IBL/post). Reuses every store-driven
 *  interaction controller so catalog/placement/measurement work unchanged. */
export function RoomEditorScene() {
  const roomId = useStore((s) => s.roomEditor.roomId)
  if (!roomId) return null
  const shell = roomShell(roomId)
  const [cx, cz] = shell.center
  const r = shell.radius
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
    >
      <ContextLossGuard />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 2.2]} />
      <ambientLight intensity={0.6} />
      <RoomShell shell={shell} />
      <GridOverlay />
      <AlignmentGuides />
      <ClearanceOverlay />
      <FurnitureLayer room={shell} />
      <FurnitureMaterialLoader />
      <SelectionOutline />
      <HoverHighlight />
      <PlacementGhost />
      <DragController />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      <ScreenshotController />
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
    </Canvas>
  )
}
