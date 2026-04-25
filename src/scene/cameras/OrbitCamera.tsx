import { OrbitControls } from '@react-three/drei';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from '../../apartment/constants';

export function OrbitCamera() {
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={3}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[APARTMENT_EXT_W / 2, 1.3, APARTMENT_EXT_D / 2]}
    />
  );
}
