import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { type Material, PCFShadowMap, type ShadowMapType, VSMShadowMap } from 'three'
import { transmissionResolutionScaleForTier } from '../materials/materialRealism'
import { useStore } from '../state/store'
import { type ShadowFilter, shadowFilterForTier } from './look'

/** Pure `ShadowFilter` → three constant mapping (same pattern as
 *  `TONE_MAPPING_THREE`), so `look.ts` stays three-free. NOTE: `pcf` maps to
 *  `PCFShadowMap`, not the deprecated `PCFSoftShadowMap` (three r184 coerces
 *  the latter to plain PCF anyway, with a per-boot console warning). */
export const SHADOW_FILTER_THREE: Record<ShadowFilter, ShadowMapType> = {
  pcf: PCFShadowMap,
  vsm: VSMShadowMap,
}

/**
 * Applies the render tier's RENDERER-level settings — the ones that live on
 * `gl`, not on a light or material. Mounted once in BOTH Canvases (main scene
 * + room editor), like `AnisotropyController`.
 *
 *  - **Sun-shadow filter (PHOTO-SOFTSHADOW):** Medium+ tiers run
 *    `VSMShadowMap` (soft penumbrae via `shadow.radius`/`blurSamples` — NOT
 *    drei PCSS, broken on three r182+); Performance keeps cheap PCF (it is
 *    shadowless anyway). The three CONSTANT is applied by the Canvas `shadows`
 *    prop (Scene/RoomEditorScene derive it from the tier) because r3f
 *    re-applies that prop on every Canvas render — a controller-only write
 *    would be stomped right back. What r3f does NOT do on a runtime filter
 *    switch is recompile the shadow-receiving materials (the filter is a
 *    shader `#define`), so this controller tracks the last-applied filter and
 *    flags every scene material `needsUpdate` when it changes — without it the
 *    old shaders sample the new map format and the driver spams
 *    `GL_INVALID_OPERATION: Mismatch between texture format and sampler type`.
 *    The sun light itself also remounts via its `key` in `Lighting.tsx`.
 *  - **Transmission pass resolution (PHOTO-GLASS):** bounds the cost of the
 *    shared transmissive render pass (window panes + glassware) per tier.
 */
export function RendererTierController() {
  const tier = useStore((s) => s.qualityTier)
  const deviceClass = useStore((s) => s.deviceClass)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const lastFilter = useRef<ShadowFilter | null>(null)
  useEffect(() => {
    gl.transmissionResolutionScale = transmissionResolutionScaleForTier(tier, deviceClass)
    const filter = shadowFilterForTier(tier, deviceClass)
    // Belt-and-braces: the Canvas `shadows` prop normally applied this already
    // during render; setting the same value again is a no-op.
    gl.shadowMap.type = SHADOW_FILTER_THREE[filter]
    if (lastFilter.current !== null && lastFilter.current !== filter) {
      gl.shadowMap.needsUpdate = true
      // Recompile every material that may sample the shadow map. One-off cost,
      // only on an actual filter-boundary tier switch (not per frame).
      scene.traverse((o) => {
        const m = (o as { material?: Material | Material[] }).material
        if (!m) return
        if (Array.isArray(m)) for (const mm of m) mm.needsUpdate = true
        else m.needsUpdate = true
      })
    }
    lastFilter.current = filter
    invalidate()
    // `deviceClass` belongs here: it now drives both the transmission scale and
    // the shadow filter, so an adaptive step from capable to weak has to re-run
    // this or the renderer keeps the old filter until the mode changes.
  }, [tier, deviceClass, gl, scene, invalidate])
  return null
}
