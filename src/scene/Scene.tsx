import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { useStore } from '../state/store';
import { Apartment } from '../apartment/Apartment';
import { CameraRig } from './cameras/CameraRig';
import { CameraForwardTracker } from './cameras/cameraForward';
import { Lighting } from './lighting/Lighting';
import { Sky } from './lighting/Sky';
import { EnvironmentMap } from './lighting/EnvironmentMap';
import { MeasurementOverlay } from '../ui/MeasurementOverlay';
import { FurnitureLayer } from '../furniture/FurnitureLayer';
import { SelectionOutline } from './selection/SelectionOutline';
import { MarqueeCameraTracker } from './selection/MarqueeSelector';
import { PlacementGhost } from './PlacementGhost';
import { DragController } from './DragController';

export function Scene() {
  const showFps = useStore((s) => s.showFps);
  return (
    <Canvas
      shadows
      dpr={[1, 1.25]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
    >
      <Sky />
      <Lighting />
      <EnvironmentMap />
      <Apartment />
      <FurnitureLayer />
      <SelectionOutline />
      <PlacementGhost />
      <DragController />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      {showFps ? <Stats /> : null}
    </Canvas>
  );
}
