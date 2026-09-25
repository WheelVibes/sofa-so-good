import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { type Material, PCFShadowMap, type ShadowMapType, VSMShadowMap } from 'three'
import { useFeature } from '../features/useFeature'
import { transmissionResolutionScaleForTier } from '../materials/materialRealism'
import { useStore } from '../state/store'
import { type ShadowFilter, shadowFilterForTier } from './look'
import { installShaderErrorHook } from './shaderLinkError'

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
 *  - **Shader link-error checking (SHADER-LINK-CHECK):** `gl.debug.checkShaderErrors`
 *    makes three call `getProgramInfoLog` + `getProgramParameter(LINK_STATUS)` the first
 *    time each program draws (`WebGLProgram.js:onFirstUse`, three r184). Those are
 *    synchronous GPU round-trips that block the main thread until the driver has finished
 *    linking, which is what makes a program BURST — turning the lights on (z16),
 *    the first orbit↔walk switch (z17) — a visible stutter rather than a background
 *    compile. A CDP trace of the P1 repro put 683 ms in `getProgramInfoLog` alone
 *    (`docs/audit/perf-trace-2026-09-25.md`). three's own docs recommend disabling it in
 *    production; `skipShaderLinkChecks` is that switch.
 *
 *    **It defaults OFF for ONE CYCLE (R7-V), and that is not a retreat from the perf
 *    win.** The measurement stands (683 ms of 10.3 s sampled CPU; worst mode-switch frame
 *    717 → 283 ms) and the flag is meant to go back on. What it landed beside is the
 *    problem: this round also shipped `lighting/boxProjectEnv.ts`, the repo's first
 *    hand-written `ShaderChunk` replacement, injected into materials that already carry
 *    `visibilityLightmap.ts`'s injection — the highest-probability source of a
 *    driver-specific GLSL link failure this codebase has ever shipped, default-on at
 *    `realistic`. A driver that rejects it presents as black or missing glossy surfaces
 *    with a completely clean console, which is indistinguishable from "the reflection is
 *    subtle". Turning error REPORTING off in the same round as the thing most likely to
 *    produce an error is the wrong order of operations, so the reporting stays on until
 *    `roomProbes` has real-device mileage. Verdict + reasoning:
 *    `docs/audit/code-review-r7-2026-09-25.md`.
 *
 *    A broken shader still fails to render either way — the flag only decides whether it
 *    reports itself. When checking IS on, `gl.debug.onShaderError` points at
 *    `shaderLinkError.ts`'s ring buffer, so a failure is readable in-app rather than
 *    living only in whichever console saw it.
 *
 *    **The runtime flip is a DEV / ADMIN affordance, not a production escape hatch.**
 *    `features/flags/resolve.ts:65` honours `?ff=` and localStorage overrides only when
 *    `privileged = isDev || isAdmin`, so a `?ff=skipShaderLinkChecks:off` in a production
 *    build does nothing for an ordinary user. Chasing a shader error on a device you do
 *    not own means a dev build on that device — or reading the ring buffer.
 */
export function RendererTierController() {
  const tier = useStore((s) => s.qualityTier)
  const deviceClass = useStore((s) => s.deviceClass)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const skipLinkChecks = useFeature('skipShaderLinkChecks')
  const lastFilter = useRef<ShadowFilter | null>(null)
  // Install the hook ONCE per renderer, independently of the flag: three only ever CALLS
  // `onShaderError` while `checkShaderErrors` is true, so an installed-but-unused hook is
  // free, and keeping it out of the flag's effect means flipping the flag on mid-session
  // (a dev or admin chasing a shader error) finds the buffer already wired.
  useEffect(() => {
    installShaderErrorHook(gl.debug)
  }, [gl])
  useEffect(() => {
    gl.debug.checkShaderErrors = !skipLinkChecks
  }, [gl, skipLinkChecks])
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
