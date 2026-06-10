import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  Vignette,
} from '@react-three/postprocessing'
import { type ReactElement, useMemo } from 'react'
import { Vector2 } from 'three'
import { AO } from './look'

interface EffectsProps {
  /** Render SSAO at full resolution (sharper, deeper) instead of half-res. */
  aoFullRes?: boolean
  /** Add the cinematic finish: faint film grain + subtle chromatic aberration. */
  cinematic?: boolean
}

/**
 * Tier-aware post-processing stack.
 *   - N8AO: SSAO, tuned via look.AO so corners/recesses ground deeply. Full-res
 *     + high-quality on the top (`aoFullRes`) tier, half-res elsewhere.
 *   - Bloom: gentle glow on emissive fixtures at night (thresholded).
 *   - HueSaturation: a touch of saturation so finishes read rich, not muddy.
 *   - ChromaticAberration (cinematic only): a sub-pixel RGB split at the frame
 *     edges — the lens signature that makes a still read "photographed".
 *   - Vignette: subtle edge darkening so the frame reads "shot, not rendered".
 *   - Noise (cinematic only): a faint, luminance-aware film grain.
 *   - SMAA: edge antialiasing (composer renders off-screen).
 *
 * Effects are assembled into a keyed array (the composer's children typing
 * rejects conditional `null`s) so the cinematic passes drop in/out cleanly.
 */
export default function EffectsImpl({ aoFullRes = false, cinematic = false }: EffectsProps) {
  // Sub-pixel split, strongest at the edges via radial modulation. Memoised so
  // the Vector2 isn't recreated every render.
  const caOffset = useMemo(() => new Vector2(0.0006, 0.0006), [])

  const effects: ReactElement[] = [
    <N8AO
      key="ao"
      aoRadius={AO.aoRadius}
      distanceFalloff={AO.distanceFalloff}
      intensity={AO.intensity}
      quality={aoFullRes ? 'high' : 'medium'}
      halfRes={!aoFullRes}
    />,
    <Bloom
      key="bloom"
      mipmapBlur
      luminanceThreshold={1.05}
      luminanceSmoothing={0.15}
      intensity={0.6}
    />,
    <HueSaturation key="hue" saturation={0.06} hue={0} />,
  ]
  if (cinematic) {
    effects.push(
      <ChromaticAberration key="ca" offset={caOffset} radialModulation modulationOffset={0.35} />,
    )
  }
  effects.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={0.55} />)
  if (cinematic) effects.push(<Noise key="noise" premultiply opacity={0.035} />)
  effects.push(<SMAA key="smaa" />)

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>
}
