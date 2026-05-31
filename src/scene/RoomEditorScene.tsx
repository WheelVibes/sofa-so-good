import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { useStore } from '../state/store';
import { roomShell } from '../apartment/roomShell';
import { RoomShell } from '../apartment/RoomShell';
import { CameraRig } from './cameras/CameraRig';
import { CameraForwardTracker } from './cameras/cameraForward';
import { FurnitureLayer } from '../furniture/FurnitureLayer';
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader';
import { SelectionOutline } from './selection/SelectionOutline';
import { HoverHighlight } from './selection/HoverHighlight';
import { MarqueeCameraTracker } from './selection/MarqueeSelector';
import { PlacementGhost } from './PlacementGhost';
import { GridOverlay } from './GridOverlay';
import { AlignmentGuides } from './AlignmentGuides';
import { ClearanceOverlay } from './ClearanceOverlay';
import { DragController } from './DragController';
import { ScreenshotController } from './ScreenshotController';
import { MeasurementOverlay } from '../ui/MeasurementOverlay';
import { DevCameraExpose } from './DevCameraExpose';

/** Lightweight per-room editor scene. Renders one isolated room with a flat,
 *  Performance-tier look (no sun/IBL/post). Reuses every store-driven
 *  interaction controller so catalog/placement/measurement work unchanged. */
export function RoomEditorScene() {
  const roomId = useStore((s) => s.roomEditor.roomId);
  const showFps = useStore((s) => s.showFps);
  if (!roomId) return null;
  const shell = roomShell(roomId);
  const [cx, cz] = shell.center;
  const r = shell.radius;
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
      {showFps ? <Stats /> : null}
    </Canvas>
  );
}
