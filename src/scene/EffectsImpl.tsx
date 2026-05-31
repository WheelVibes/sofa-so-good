import {
  Bloom,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  Vignette,
} from '@react-three/postprocessing'
import { AO } from './look'

/**
 * High-tier post-processing stack.
 *   - N8AO: SSAO, tuned via look.AO so corners/recesses ground deeply.
 *   - Bloom: gentle glow on emissive fixtures at night (thresholded).
 *   - HueSaturation: a touch of saturation so finishes read rich, not muddy.
 *   - Vignette: subtle edge darkening so the frame reads "shot, not rendered".
 *   - SMAA: edge antialiasing (composer renders off-screen).
 */
export default function EffectsImpl() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        aoRadius={AO.aoRadius}
        distanceFalloff={AO.distanceFalloff}
        intensity={AO.intensity}
        quality="medium"
        halfRes
      />
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.15} intensity={0.6} />
      <HueSaturation saturation={0.06} hue={0} />
      <Vignette eskil={false} offset={0.32} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  )
}
