import { Canvas } from '@react-three/fiber';
import { Apartment } from '../apartment/Apartment';
import { OrbitCamera } from './cameras/OrbitCamera';

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#e9eef2']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <Apartment />
      <OrbitCamera />
    </Canvas>
  );
}
