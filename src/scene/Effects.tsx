import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';
import { useStore } from '../state/store';
import { QUALITY_PRESETS } from './quality';

/**
 * Post-processing stack (quality === 'high'):
 *   - Bloom: gentle glow on emissive fixtures (lamps, screens) at night —
 *     thresholded so daytime diffuse surfaces don't bloom.
 *   - SMAA: edge antialiasing (the composer renders off-screen, so the
 *     canvas MSAA doesn't apply).
 * The renderer's ACES tone mapping carries through the render pass.
 * Disabled when quality is 'off' (the default) for the fastest path.
 */
export function Effects() {
  const tier = useStore((s) => s.qualityTier);
  if (!QUALITY_PRESETS[tier].postprocessing) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.15} intensity={0.6} />
      <SMAA />
    </EffectComposer>
  );
}
