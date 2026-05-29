import { EffectComposer, Bloom, SMAA, N8AO } from '@react-three/postprocessing';

/**
 * High-tier post-processing stack. Split into its own module so the heavy
 * postprocessing + n8ao code is lazy-loaded only when the high tier is active
 * (see Effects.tsx) — low/medium users never download it.
 *
 *   - N8AO: screen-space ambient occlusion. Grounds furniture with soft
 *     contact darkening and deepens corners/recesses. halfRes keeps it cheap.
 *   - Bloom: gentle glow on emissive fixtures (lamps, screens) at night —
 *     thresholded so daytime diffuse surfaces don't bloom.
 *   - SMAA: edge antialiasing (the composer renders off-screen, so the canvas
 *     MSAA doesn't apply).
 * The renderer's ACES tone mapping carries through the render pass.
 */
export default function EffectsImpl() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.6} distanceFalloff={1} intensity={2.4} quality="medium" halfRes />
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.15} intensity={0.6} />
      <SMAA />
    </EffectComposer>
  );
}
