import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  Vignette,
} from '@react-three/postprocessing'
import { type ReactElement, useMemo } from 'react'
import { Vector2 } from 'three'
import { useStore } from '../state/store'
import { rasterDofParams } from './cameras/cameraLensSettings'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { isDollhouseLighting } from './lighting/dollhouse'
import { useSunPosition } from './lighting/useSunPosition'
import { AO, BLOOM, bloomIntensityForDay } from './look'

interface EffectsProps {
  /** Render SSAO at full resolution (sharper, deeper) instead of half-res. */
  aoFullRes?: boolean
  /** Add the cinematic finish: faint film grain + subtle chromatic aberration. */
  cinematic?: boolean
  /** Mount the raster depth-of-field pass (already gated by tier + flag + the
   *  user's aperture upstream). PC2-CAM-DOF-LENS. */
  dof?: boolean
  /** Aperture f-stop driving the bokeh strength + focus range (raster DoF). */
  dofFStop?: number
  /** Focus plane distance from the camera, metres (world-space) — shared with
   *  the HQ path tracer. */
  dofFocusDistance?: number
}

/**
 * Tier-aware post-processing stack.
 *   - N8AO: SSAO, tuned via look.AO so corners/recesses ground deeply. Full-res
 *     + high-quality on the top (`aoFullRes`) tier, half-res elsewhere.
 *   - Bloom: gentle glow on genuinely emissive night fixtures only. Thresholded
 *     HIGH (`BLOOM.luminanceThreshold`) so broad sunlit daytime surfaces stay
 *     under the line — a lower threshold smeared a milky veil across the whole
 *     frame at High/Maximum.
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
export default function EffectsImpl({
  aoFullRes = false,
  cinematic = false,
  dof = false,
  dofFStop = 0,
  dofFocusDistance = 3,
}: EffectsProps) {
  // Sub-pixel split, strongest at the edges via radial modulation. Memoised so
  // the Vector2 isn't recreated every render.
  const caOffset = useMemo(() => new Vector2(0.0006, 0.0006), [])
  const { bokehScale, worldFocusRange } = useMemo(() => rasterDofParams(dofFStop), [dofFStop])

  // Bloom strength tracks the day level: full at night (glow genuinely-emissive
  // fixtures) and →0 at midday, where the same pass would otherwise smear a milky
  // veil over the (HDR-brighter-than-fixtures) sunlit surfaces — the "washed out
  // on Maximum" report (LIGHT-IBL-OVERLAP). The threshold is unchanged, so the
  // fixtureGlow lock-step + night glow are preserved.
  const sun = useSunPosition()
  const dayLevel = lightingFromAltitude(sun.altitude).sun
  // Orbit daytime dollhouse (ORBIT-DOLLHOUSE): no bloom — it's a flat, uniform
  // view, not the exterior-sun simulation. Walk + night orbit keep the day-ramped
  // bloom (genuinely-emissive fixtures glow at night, →0 at midday).
  const cameraMode = useStore((s) => s.cameraMode)
  const lightsMode = useStore((s) => s.lightsMode ?? 'auto')
  const dollhouse = isDollhouseLighting({ cameraMode, sunAltitude: sun.altitude, lightsMode })
  const bloomIntensity = dollhouse ? 0 : bloomIntensityForDay(dayLevel)

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
      luminanceThreshold={BLOOM.luminanceThreshold}
      luminanceSmoothing={BLOOM.luminanceSmoothing}
      intensity={bloomIntensity}
    />,
    <HueSaturation key="hue" saturation={0.06} hue={0} />,
  ]
  if (cinematic) {
    effects.push(
      <ChromaticAberration key="ca" offset={caOffset} radialModulation modulationOffset={0.35} />,
    )
  }
  // Raster depth of field (PC2-CAM-DOF-LENS). World-space focus (metres) so the
  // model matches the HQ path tracer; half-res (`resolutionScale`) to keep the
  // bokeh convolution cheap. Mounted only when DoF is enabled upstream.
  if (dof) {
    effects.push(
      <DepthOfField
        key="dof"
        worldFocusDistance={dofFocusDistance}
        worldFocusRange={worldFocusRange}
        bokehScale={bokehScale}
        resolutionScale={0.5}
      />,
    )
  }
  effects.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={0.55} />)
  if (cinematic) effects.push(<Noise key="noise" premultiply opacity={0.035} />)
  effects.push(<SMAA key="smaa" />)

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>
}
