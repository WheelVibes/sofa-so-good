import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { ACESFilmicToneMapping } from 'three';
import { useStore } from '../state/store';
import { Apartment } from '../apartment/Apartment';
import { CameraRig } from './cameras/CameraRig';
import { CameraForwardTracker } from './cameras/cameraForward';
import { Lighting } from './lighting/Lighting';
import { RoomDaylight } from './lighting/RoomDaylight';
import { Sky } from './lighting/Sky';
import { Environment } from './lighting/Environment';
import { MeasurementOverlay } from '../ui/MeasurementOverlay';
import { FurnitureLayer } from '../furniture/FurnitureLayer';
import { FurnitureLights } from './furniture/FurnitureLights';
import { SelectionOutline } from './selection/SelectionOutline';
import { MarqueeCameraTracker } from './selection/MarqueeSelector';
import { PlacementGhost } from './PlacementGhost';
import { DragController } from './DragController';
import { PostFx } from './lighting/PostFx';
import { AcceleratedClock } from './lighting/AcceleratedClock';
import { WindowSunbeams } from './lighting/WindowSunbeams';
import { OutdoorScene } from './outdoor/OutdoorScene';

export function Scene() {
  const showFps = useStore((s) => s.showFps);
  const shadowsQuality = useStore((s) => s.quality.shadows);
  const gi = useStore((s) => s.quality.globalIllumination);
  // MSAA at the WebGL level only at the highest preset; SMAA in PostFx covers
  // the lower presets cheaply.
  const antialias = gi === 'ibl+ssao';
  return (
    <Canvas
      shadows={shadowsQuality !== 'off' ? 'soft' : false}
      dpr={[1, 1.25]}
      camera={{ position: [12, 8, 12], fov: 70, near: 0.1, far: 500 }}
      gl={{
        antialias,
        powerPreference: 'high-performance',
        stencil: false,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
    >
      <Sky />
      <Environment />
      <Lighting />
      <RoomDaylight />
      <WindowSunbeams />
      <OutdoorScene />
      <AcceleratedClock />
      <Apartment />
      <FurnitureLayer />
      <FurnitureLights />
      <SelectionOutline />
      <PlacementGhost />
      <DragController />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      {showFps ? <Stats /> : null}
      <PostFx />
    </Canvas>
  );
}
