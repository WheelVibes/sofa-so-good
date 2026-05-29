import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
import { useStore } from '../state/store';
import { Apartment } from '../apartment/Apartment';
import { CameraRig } from './cameras/CameraRig';
import { CameraForwardTracker } from './cameras/cameraForward';
import { Lighting } from './lighting/Lighting';
import { FurnitureLights } from './lighting/FurnitureLights';
import { SceneEnvironment } from './lighting/SceneEnvironment';
import { Sky } from './lighting/Sky';
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
      shadows={{ type: PCFSoftShadowMap }}
      dpr={[1, 1.75]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <Sky />
      <SceneEnvironment />
      <Lighting />
      <FurnitureLights />
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
