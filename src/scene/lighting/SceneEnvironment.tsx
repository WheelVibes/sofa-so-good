import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useQuality } from '../useQuality'
import { lightingFromAltitude } from './altitudeCurve'
import { useSunPosition } from './useSunPosition'

/**
 * A lightweight procedural image-based-lighting environment, built once from
 * Lightformers (no network HDR fetch). It gives PBR surfaces — varnished
 * wood, tile, marble, glass, metal — believable reflections and soft ambient
 * bounce. The IBL intensity is dialled down as the sun sets so interiors go
 * appropriately dark at night.
 */
export function SceneEnvironment() {
  const { scene } = useThree()
  const sun = useSunPosition()
  const quality = useQuality()
  const enabled = quality.ibl

  useFrame(() => {
    if (!enabled) return
    const level = lightingFromAltitude(sun.altitude).sun // 1 day → 0 night
    // Keep a little IBL at night so reflective surfaces aren't pure black.
    scene.environmentIntensity = 0.12 + level * 0.55
  })

  if (!enabled) {
    if (scene.environment) scene.environment = null
    return null
  }
  return (
    <Environment resolution={quality.envResolution} frames={1} background={false}>
      {/* Bright sky cap + cooler horizon for a soft top-down gradient. */}
      <Lightformer
        form="rect"
        intensity={1.4}
        color="#cfe0f2"
        scale={[12, 12, 1]}
        position={[0, 8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, -9]}
        rotation={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, 9]}
        rotation={[0, Math.PI, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[-9, 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[9, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      {/* Warm ground bounce. */}
      <Lightformer
        form="rect"
        intensity={0.25}
        color="#6b5b48"
        scale={[14, 14, 1]}
        position={[0, -3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {/* Warm key aimed down-and-inward from the sun-side corner for spec variation on wood/metal. */}
      <Lightformer
        form="rect"
        intensity={0.8}
        color="#ffe6c2"
        scale={[5, 5, 1]}
        position={[5, 5, 5]}
        rotation={[Math.PI / 4, -Math.PI / 4, 0]}
      />
      {/* Cool counter-fill from the opposite corner so reflections aren't flat. */}
      <Lightformer
        form="rect"
        intensity={0.35}
        color="#c2d4ff"
        scale={[5, 5, 1]}
        position={[-5, 4, -5]}
        rotation={[Math.PI / 4, (3 * Math.PI) / 4, 0]}
      />
    </Environment>
  )
}
