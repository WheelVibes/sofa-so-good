import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import { type ReactElement, useMemo } from 'react'
import { Vector2 } from 'three'
import { useStore } from '../state/store'
import { rasterDofParams } from './cameras/cameraLensSettings'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'
import { AO, BLOOM, bloomActiveForDay, bloomIntensityForDay, hueSatSaturation } from './look'
import { resolveToneMapping, toneContextFromState } from './toneContext'
import { TONE_MAPPING_POST } from './toneMappingPost'

interface EffectsProps {
  /**
   * Run the FULL post stack. When false the composer mounts in AO-ONLY mode
   * (TIER-AO): ambient occlusion + the tone mapper + HueSaturation, and nothing
   * else — no bloom, DoF, chromatic aberration, vignette, grain or SMAA.
   */
  full?: boolean
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
 *
 * Ordered HDR → display-referred, which is the part that actually matters:
 *   - N8AO: SSAO, tuned via look.AO so corners/recesses ground deeply. Full-res
 *     + high-quality on the top (`aoFullRes`) tier, half-res elsewhere.
 *   - DepthOfField: a lens effect, so it belongs on the HDR side of the tone
 *     mapper (bokeh has to average scene-referred energy to look right).
 *   - Bloom: gentle glow on genuinely emissive night fixtures only. Also
 *     HDR-side — it is a sensor bleed of over-range energy, which is exactly
 *     what the tone mapper is about to compress away.
 *   - **ToneMapping**: the view transform (TONE-POST). Under the composer three
 *     does NOT apply `gl.toneMapping` — see `toneMappingPost.ts` for the full
 *     mechanism — so without this pass the post tiers rendered raw linear HDR
 *     and clipped ~32% of the frame to flat white. Everything above this line is
 *     scene-referred (may exceed 1.0); everything below is display-referred.
 *   - HueSaturation: a touch of saturation so finishes read rich, not muddy.
 *   - ChromaticAberration (cinematic only): a sub-pixel RGB split at the frame
 *     edges — the lens signature that makes a still read "photographed".
 *   - Vignette: subtle edge darkening so the frame reads "shot, not rendered".
 *   - Noise (cinematic only): a faint, luminance-aware film grain.
 *   - SMAA: edge antialiasing, last (it wants final display-referred pixels).
 *
 * Effects are assembled into a keyed array (the composer's children typing
 * rejects conditional `null`s) so the cinematic passes drop in/out cleanly.
 *
 * `full={false}` is AO-ONLY mode (TIER-AO), used by `medium`: ambient occlusion,
 * the tone mapper and HueSaturation only. AO is the one pass that shapes
 * non-directional fill, and interiors here are fill-lit, so it is what makes a
 * room read as having corners. The tone mapper is NOT optional in that mode —
 * mounting any composer disables three's own view transform (see
 * `toneMappingPost.ts`), so dropping it would blow the highlights exactly the way
 * High/Maximum used to.
 */
export default function EffectsImpl({
  full = true,
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
  // Bloom follows the day-ramped path in every mode (ORBIT-CEILING): full at
  // night so genuinely-emissive fixtures glow, →0 at midday so sunlit surfaces
  // don't smear. Orbit/editor no longer suppress it.
  const bloomIntensity = bloomIntensityForDay(dayLevel)

  // COLOR-GRADE: the user scene-saturation dial rides the HueSaturation pass.
  // The default (1) resolves to the long-standing +0.06 baseline exactly.
  const sceneSaturation = useStore((s) => s.sceneSaturation)

  // TONE-POST: the same resolved operator `Lighting` feeds the renderer, so the
  // look is identical across the tier boundary instead of the post tiers silently
  // running with no view transform at all. Context-aware (`'auto'` → Neutral
  // while previewing a finish) exactly as on Performance/Medium. Subscribed as
  // two primitive selectors so this component doesn't re-render on unrelated
  // store writes — a re-render here changes the composer's `children` identity,
  // which makes it tear down and rebuild every `EffectPass`.
  const toneSetting = useStore((s) => s.toneMapping)
  const finishPreview = useStore((s) => s.selectedRoomId != null || s.selectedWall != null)
  const toneMode = resolveToneMapping(
    toneSetting,
    toneContextFromState({
      selectedRoomId: finishPreview ? 'finish-preview' : null,
      selectedWall: null,
    }),
  )

  const effects: ReactElement[] = [
    <N8AO
      key="ao"
      aoRadius={AO.aoRadius}
      distanceFalloff={AO.distanceFalloff}
      intensity={AO.intensity}
      quality={aoFullRes ? 'high' : 'medium'}
      halfRes={!aoFullRes}
    />,
  ]
  // Raster depth of field (PC2-CAM-DOF-LENS). World-space focus (metres) so the
  // model matches the HQ path tracer; half-res (`resolutionScale`) to keep the
  // bokeh convolution cheap. Mounted only when DoF is enabled upstream.
  if (full && dof) {
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
  // Mount Bloom only when the day ramp leaves it something to do. In daylight
  // `bloomIntensityForDay` is 0, so the pass contributed nothing visible while
  // still running its whole blur chain every frame — and an
  // intensity-zeroed Bloom is NOT inert: its blur texture is still sampled by the
  // combined effect shader, which is exactly the path that blanked frames (see
  // the mipmapBlur note below). Skipping it outright is both cheaper and safer.
  if (full && bloomActiveForDay(dayLevel)) {
    effects.push(
      <Bloom
        key="bloom"
        // BLOOM-MIP-FLASH: `mipmapBlur` is deliberately OFF — do not re-enable it
        // without re-running `scripts/dev-probes/blank-cause.mjs`. Its
        // `MipmapBlurPass` rebinds a chain of ~15 differently-sized half-float
        // render targets every frame, and on ANGLE/Metal (Apple silicon) that
        // intermittently leaves the combined `EffectPass` shader sampling an
        // unready blur texture. That blanks the WHOLE frame, because the
        // composer's final blit still runs and writes the result to the default
        // framebuffer regardless. With `alpha: true` (r3f's default, which the
        // orbit view relies on to show the page background around the model) a
        // blanked frame reads as the light page colour: the reported "white
        // flashes when rotating the view in orbit mode" on the higher tiers.
        // Measured on a Mac mini M4 driving a real orbit drag — blank frames per
        // 78 captured frames at Maximum:
        //   full stack, mipmapBlur on ....... 4/78   (7/78 at night)
        //   Bloom alone, mipmapBlur on ...... 5/78
        //   everything EXCEPT Bloom ......... 0/78
        //   Bloom alone, mipmapBlur off ..... 0/78
        //   full stack, mipmapBlur off ...... 0/78   (0/78 at night)
        // Performance/Medium never flashed (0/78): they mount no composer at all,
        // which is why the report was tier-specific. Ruled out along the way —
        // WebGL context loss (no `webglcontextlost` ever fired), drawing-buffer
        // resizes / the DPR degrade (no `setSize`/`setPixelRatio` near a blank
        // frame, and disabling `interactiveDegrade` made it *more* frequent),
        // `EffectPass` rebuilds (this component re-renders 0 times during an
        // orbit), every other pass individually, and mip `levels` 5/6/7.
        // `alpha: false` only changed the flash colour to black. The Kawase blur
        // below is the library's other supported blur path and is artifact-free.
        mipmapBlur={false}
        kernelSize={KernelSize.LARGE}
        resolutionScale={0.5}
        luminanceThreshold={BLOOM.luminanceThreshold}
        luminanceSmoothing={BLOOM.luminanceSmoothing}
        intensity={bloomIntensity}
      />,
    )
  }
  effects.push(<ToneMapping key="tone" mode={TONE_MAPPING_POST[toneMode]} />)
  effects.push(<HueSaturation key="hue" saturation={hueSatSaturation(sceneSaturation)} hue={0} />)
  if (full && cinematic) {
    effects.push(
      <ChromaticAberration key="ca" offset={caOffset} radialModulation modulationOffset={0.35} />,
    )
  }
  if (full) effects.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={0.55} />)
  if (full && cinematic) effects.push(<Noise key="noise" premultiply opacity={0.035} />)
  // SMAA belongs to the full stack. In AO-only mode the composer instead keeps
  // real MSAA (below), which is both cheaper here and better on edges.
  if (full) effects.push(<SMAA key="smaa" />)

  // Antialiasing has to be replaced, not dropped, when the full stack is off: the
  // Canvas is created with `antialias: true`, but a composer renders the scene
  // into its OWN off-screen target, so the canvas' MSAA no longer applies. With
  // `multisampling={0}` and no SMAA an AO-only Medium would have visibly worse
  // edges than Medium had with no composer at all — a realism regression sold as
  // a realism feature. 4 samples is the measured `MAX_SAMPLES` on this GPU class.
  return <EffectComposer multisampling={full ? 0 : 4}>{effects}</EffectComposer>
}
