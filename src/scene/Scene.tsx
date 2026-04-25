import { Canvas } from '@react-three/fiber';
import { Apartment } from '../apartment/Apartment';
import { CameraRig } from './cameras/CameraRig';
import { Lighting } from './lighting/Lighting';
import { Sky } from './lighting/Sky';
import { MeasurementOverlay } from '../ui/MeasurementOverlay';

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <Sky />
      <Lighting />
      <Apartment />
      <CameraRig />
      <MeasurementOverlay />
    </Canvas>
  );
}
