import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useSunPosition } from './useSunPosition';
import { lightingFromAltitude } from './altitudeCurve';
import { useQuality } from '../useQuality';

/**
 * A lightweight procedural image-based-lighting environment, built once from
 * Lightformers (no network HDR fetch). It gives PBR surfaces — varnished
 * wood, tile, marble, glass, metal — believable reflections and soft ambient
 * bounce. The IBL intensity is dialled down as the sun sets so interiors go
 * appropriately dark at night.
 */
export function SceneEnvironment() {
  const { scene } = useThree();
  const sun = useSunPosition();
  const enabled = useQuality().ibl;

  useFrame(() => {
    if (!enabled) return;
    const level = lightingFromAltitude(sun.altitude).sun; // 1 day → 0 night
    // Keep a little IBL at night so reflective surfaces aren't pure black.
    scene.environmentIntensity = 0.12 + level * 0.55;
  });

  if (!enabled) {
    if (scene.environment) scene.environment = null;
    return null;
  }
  return (
    <Environment resolution={64} frames={1} background={false}>
      {/* Bright sky cap + cooler horizon for a soft top-down gradient. */}
      <Lightformer form="rect" intensity={1.4} color="#cfe0f2" scale={[12, 12, 1]} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={0.5} color="#9fb0c4" scale={[14, 6, 1]} position={[0, 2, -9]} rotation={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.5} color="#9fb0c4" scale={[14, 6, 1]} position={[0, 2, 9]} rotation={[0, Math.PI, 0]} />
      <Lightformer form="rect" intensity={0.45} color="#b8c2cf" scale={[6, 6, 1]} position={[-9, 2, 0]} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={0.45} color="#b8c2cf" scale={[6, 6, 1]} position={[9, 2, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {/* Warm ground bounce. */}
      <Lightformer form="rect" intensity={0.25} color="#6b5b48" scale={[14, 14, 1]} position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  );
}
