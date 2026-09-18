import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  type Camera,
  CanvasTexture,
  EquirectangularReflectionMapping,
  type Material,
  type Mesh,
  Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { useStore } from '../state/store'

/**
 * Pre-compiles the shader variant the wall reveal is about to need, while a
 * loading overlay is still covering the canvas (SHADER-WARMUP).
 *
 * ## The measured defect
 *
 * Steady-state cost at Maximum is tight — p50 10.9 / p90 11.4 / p99 12.0 ms over
 * ~1480 orbit frames, all inside the 16.67 ms budget. But one frame inside the
 * first ~44 costs **204–214 ms and compiles +25 to +29 shader programs**
 * (`scripts/dev-probes/frame-spikes.mjs`). So the tiers are not slow; the user's
 * FIRST interaction stalls for a fifth of a second — invisible to a p90, and
 * exactly when an impression is formed.
 *
 * ## Why it happens
 *
 * A material census across that gesture reads **+0 materials but +29 programs**:
 * nothing is being created, EXISTING materials are recompiling. The cause is
 * `material.transparent`. three derives a program parameter from it —
 * `opaque: material.transparent === false && blending === NormalBlending &&
 * alphaToCoverage === false` — so `transparent` is part of the program cache key,
 * and flipping it false → true forces a fresh compile.
 *
 * The wall reveal flips exactly that, on the first frame of the first camera
 * gesture, across every fading surface at once: `WallSegment`, `useWallReveal`,
 * `PlanShell`, `PlanRoomShell`, `Skirting`, `Door`, `Window` all set
 * `transparent = opacity < 0.985`. ~29 distinct materials cross that threshold
 * together, so ~29 programs compile in one frame.
 *
 * ## The fix
 *
 * Compile the *other* variant up front. This flips every scene material to
 * `transparent: true`, asks three to compile, and restores the original flags —
 * all inside ONE task, so no frame can render in the flipped state. Afterwards
 * both variants are in three's program cache, and the reveal's flip is a cache
 * hit instead of a compile.
 *
 * Two notes for anyone changing this:
 *  - **An earlier version of this file was reverted for not working.** It called
 *    `compileAsync(scene, camera)` in the CURRENT state and drove extra frames.
 *    That warms only the variant already being rendered, which is by definition
 *    the one that is already compiled — it moved the spike not at all, across
 *    several variants (immediate rAFs, and spread over 1.5 s to cover the lazy
 *    `EffectsImpl` import). Warming the *opposite* `transparent` state is the
 *    part that matters.
 *  - **It must NOT call `compileAsync` (FIREFOX-TIER-SWITCH).** That was the shape
 *    that shipped, and it threw an UNCATCHABLE `TypeError` at every tier switch on
 *    any driver without `KHR_parallel_shader_compile` — reproduced in Playwright
 *    Firefox 150 (`pageerror: can't access property "isReady",
 *    properties.get(...).currentProgram is undefined`) AND in headless Chromium
 *    under SwiftShader (`Cannot read properties of undefined (reading 'isReady')`),
 *    both of which log `THREE.WebGLRenderer: KHR_parallel_shader_compile extension
 *    not supported`. Mechanism, from three 0.184's `WebGLRenderer.compileAsync`:
 *    without that extension it cannot poll a program's status cheaply, so it defers
 *    its readiness check to `setTimeout(checkMaterialsReady, 10)` instead of running
 *    it synchronously — and that check reads
 *    `properties.get(material).currentProgram.isReady()`. Any material that is
 *    DISPOSED inside that 10 ms window (a tier switch remounts a good part of the
 *    tree) has already been removed from the renderer's `properties` map by
 *    `deallocateMaterial`, so `currentProgram` is `undefined` and the check throws
 *    **from a timer callback** — outside the promise chain, so the `p.then(undefined,
 *    () => {})` this file used to carry could never catch it, and outside our own
 *    try/catch. The warmup gained NOTHING from the async variant either: programs are
 *    created synchronously by both, and the returned promise was discarded. So use
 *    the synchronous `compile()`, which has no polling loop and therefore no window
 *    in which to throw.
 *  - It deliberately does NOT make `transparent` permanently true, which would
 *    also avoid the recompile: that would move these surfaces into the sorted
 *    transparent pass for the whole session and change draw ordering against
 *    opaque geometry. Pre-warming keeps runtime behaviour byte-identical.
 *
 * Fire-and-forget: a driver that refuses to pre-compile just falls back to the
 * old lazy behaviour. Nothing here changes what is rendered.
 *
 * ## BACKDROP-WARMUP (N3 residual, follow-up shipped)
 *
 * A second, unrelated lazy-compile lives one level BELOW the app: three's
 * `WebGLBackground` creates its box/plane background mesh + material the first time
 * `scene.background` is non-null, **inside an actual `render()` call**
 * (`WebGLBackground.js:addToRenderList`, called from `WebGLRenderer`'s render path —
 * verified against `three/src/renderers/WebGLRenderer.js`, `background.render(scene)` is
 * called at lines ~1733/1747/2021, never from `this.compile`, ~line 1372). `SceneBackdrop.tsx`
 * sets `scene.background` only in `firstPerson` mode (`isPhotoBackdropActive`), so the FIRST
 * walk entry of a session pays for that compile — measured (N3, `docs/audit/
 * interaction-sweep-2026-09-18.md`) at 220→257 programs (+37) on a fresh session's first
 * orbit→walk switch, against +1 on the session's second switch. It is a DIFFERENT class of
 * lazy-compile from the `transparent` flip above: that flips a flag on a material ALREADY IN
 * THE SCENE GRAPH (`gl.compile` reaches it); this program does not exist until an actual
 * render happens with a non-null background, and `gl.compile()` structurally cannot reach it.
 *
 * **Partially fixed by `warmBackdropProgram` below** — one forced `gl.render()`, but into a 1×1
 * offscreen `WebGLRenderTarget`, never the visible drawing buffer, so it cannot be the
 * GPU-STARVE-3 / BLOOM-MIP-FLASH shape (both of those are about a stray render reaching the
 * DEFAULT framebuffer — a resize-cleared one for GPU-STARVE-3, a garbage-sampling blit for
 * BLOOM-MIP-FLASH; `gl.setRenderTarget(rt)` touches neither, and is restored to the prior target
 * synchronously in the same task before anything else can run). Verified against
 * `WebGLRenderer.js` that `background.addToRenderList` — where the box/plane mesh is created —
 * is unconditional on the render target; the `_renderBackground` guard around it is XR-only
 * (`environmentBlendMode`/depth-sensing), not render-target-gated. Renders a THROWAWAY `Scene`,
 * not the app's real one (see below for why the real scene was tried and rejected). Runs once
 * per SESSION, not once per tier (a separate ref, `backdropWarmed`, independent of the
 * `warmed`/`tier` gate above): the background shader (`ShaderLib.backgroundCube`) carries no
 * tier-dependent `#define`s, so re-running the warm on a tier change would not compile a new
 * program, only redo the equirect→cube conversion and leak a fresh `WebGLCubeRenderTarget` per
 * call (`WebGLEnvironments`'s conversion cache is keyed by texture identity — disposing the
 * dummy texture frees it, but only once).
 *
 * **Census, real GPU, fresh session, desktop-metal (2026-09-18,
 * `scripts/dev-probes/census-backdrop.mjs`): the +37 is confirmed reproducible (218→252, +34 net
 * / 37 distinct added cacheKeys, 3 evicted) and is almost ENTIRELY NOT walk-only new material —
 * it is the SAME LIGHT-COUNT-STABLE mechanism this file already documents for the wall-reveal
 * gesture, hitting the whole scene a second time, ROOT-CAUSED to a specific light.** Grouped by
 * `program.name || cacheKey`'s `shaderID`:
 *
 * | group | count | cause |
 * | --- | --- | --- |
 * | `physical`/`STANDARD` (furniture + architecture PBR, incl. one named `side_table_01`) | 27 | light/shadow-census tail changed (`numDirLights`/`numDirLightShadows` 2→1); same UV/feature defines as the pre-existing program |
 * | `depth` (shadow-map pre-pass materials) | 4 | same census-driven recompile |
 * | `basic` (`MeshBasicMaterial` helpers) | 4 (2 of the pre-existing `basic` programs were evicted in the same window) | same census-driven recompile |
 * | `BackgroundCubeMaterial` | 1 | same census-driven recompile, on the one program this file DOES warm |
 *
 * A control run (identical timing, boot settle, NO switch) held program count flat (217→217)
 * over the same window, ruling out "this is asset-streaming settling, not the switch". A direct
 * `scene.traverse` census of `DirectionalLight`s (`scripts/dev-probes/census-lights.mjs`) then
 * ROOT-CAUSED it: **orbit carries 2 directional lights, firstPerson carries 1** —
 * `ORBIT-STUDIO-LOOK`'s orbit-only overhead key (`src/scene/CLAUDE.md`) unmounts on entering
 * walk, and three bakes `numDirLights`/`numDirLightShadows` into EVERY program's cache key
 * regardless of whether that program's shader reads a light — the same fact LIGHT-COUNT-STABLE
 * already documents for a fixture-count change, here triggered by a camera-mode change instead.
 * Every one of the 37 (background included) is this ONE mechanism, not 37 different causes.
 *
 * **A second attempt — rendering the REAL scene (background swapped, everything else live)
 * instead of a throwaway one — was tried and REJECTED, measured.** The idea: if the warm-up
 * compiles against the scene's actual light census instead of an empty one, the background
 * program would match. It does not fix the mismatch (warm-up runs at BOOT, still in ORBIT's
 * 2-light census — the mismatch is orbit-vs-walk, not empty-vs-real) and it is drastically more
 * expensive: `[probe] backdrop-warmup` went from **~31 ms / 1 program** to **1671.5 ms / 28
 * programs** on the same machine, because rendering the full apartment for the first time at
 * this exact tier/state also compiles every OTHER not-yet-compiled material in the same pass —
 * exactly the "one big shader-compile stall" this file exists to avoid, just moved earlier
 * rather than removed. Reverted; kept here so it is not re-tried.
 *
 * **The remaining 37 (background included) are NOT closable by the same offscreen-render
 * trick, and are recorded as the residual.** Unlike `transparent` (a fixed, enumerable per-
 * material boolean this file already warms both sides of), "orbit's light count" is a
 * SESSION-BOOT-TIME fact this warm-up runs under and cannot pre-empt: warming the walk-mode
 * census would require rendering under a scene that has ALREADY lost the studio key, i.e.
 * simulating the very switch this file is trying to warm ahead of — the same circularity that
 * sank LIGHT-COUNT-STABLE's slot-padding idea for fixture counts, now reappearing for camera
 * modes. A structural fix (not attempted here) would look like `ShaderWarmup` temporarily hiding
 * the studio-key light (by its `STUDIO_KEY_SHADOW_TAG`, `Lighting.tsx`) and re-running
 * `gl.compile()` under that state — the same "flip a scene-wide fact, compile, restore" shape as
 * the `transparent` pass above, but coupling this file to `Lighting.tsx`'s internal light
 * reference for the first time, and unverified for cost/correctness. Left for a follow-up.
 *
 * **Tier gating, checked rather than assumed.** `SceneBackdrop.tsx` mounts unconditionally in
 * `Scene.tsx` with no `qualityTier`/`deviceClass` gate, and its static presets are active in
 * every camera mode's firstPerson entry regardless of tier — the default kind is `'sky'`
 * (`uiSlice.ts`), gated only on the `proceduralSky` feature flag, which is `default: true`,
 * NOT `devOnly`, and `tier: 'simple'` (the Simple/Pro UI-mode axis, unrelated to GPU quality) —
 * so it is on for `performance` too. There is therefore no tier at which the backdrop is unused
 * and this warm-up would be wasted; it runs at every quality tier, same as the rest of this
 * component. `prefers-reduced-motion` has no bearing either: this is one synchronous hidden
 * render at boot, not an animation, and the ONE thing that reduced motion does touch nearby
 * (`ModeSwitchCrossfade`'s veil) is a separate, unrelated component.
 */
/** Pure formatter for the backdrop-warmup probe log — kept separate from the
 *  GL-touching code below so its exact shape is unit-testable without a WebGL
 *  context. `ms` is rounded to one decimal; `programsAdded` is an integer. */
export function formatBackdropWarmupProbe(ms: number, programsAdded: number): string {
  return `[probe] backdrop-warmup ${Math.round(ms * 10) / 10} ${programsAdded}`
}

/**
 * One forced render of a THROWAWAY `Scene` (never the app's real one) into a
 * 1×1-per-face offscreen `WebGLRenderTarget`, to compile the
 * `WebGLBackground` box material before the user's first walk entry. See the
 * module docstring's BACKDROP-WARMUP section for why this is safe (never
 * touches the visible drawing buffer, restores the prior render target
 * synchronously in this same task) and for the measured, REJECTED attempt at
 * rendering the real scene instead (BACKDROP-WARMUP-LIGHT-CENSUS).
 *
 * `WebGLBackground`'s `boxMesh`/`planeMesh` are per-RENDERER closure state,
 * not per-scene (verified against `WebGLBackground.js`), so warming them
 * against a throwaway 2×1 dummy canvas compiles the exact PROGRAM the real
 * equirect background will hit later — pixel content is irrelevant to
 * program identity, only the light census and the texture's `mapping`/type
 * matter (which is exactly why this does NOT close the residual — see below).
 */
function warmBackdropProgram(
  gl: WebGLRenderer,
  camera: Camera,
): { ms: number; programsAdded: number } | null {
  const start = performance.now()
  const before = gl.info.programs?.length ?? 0
  const prevTarget = gl.getRenderTarget()
  let rt: WebGLRenderTarget | null = null
  let tex: CanvasTexture | null = null
  try {
    // A 2x1 canvas keeps the equirect aspect (2:1) that `WebGLEnvironments.getCube`
    // expects, without spending anything on pixel content nobody will see — only
    // `image.height > 0` is checked before the conversion runs.
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 1
    tex = new CanvasTexture(canvas)
    tex.mapping = EquirectangularReflectionMapping
    const dummyScene = new Scene()
    dummyScene.background = tex
    // depthBuffer/stencilBuffer off + generateMipmaps off: the background
    // material itself disables depth test/write, and nothing else renders into
    // this target, so neither buffer is ever read.
    rt = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    })
    gl.setRenderTarget(rt)
    gl.render(dummyScene, camera)
    return {
      ms: performance.now() - start,
      programsAdded: (gl.info.programs?.length ?? 0) - before,
    }
  } catch {
    return null
  } finally {
    gl.setRenderTarget(prevTarget)
    // Disposing the dummy texture is what frees the `WebGLCubeRenderTarget` the
    // equirect→cube conversion allocated for it (`WebGLEnvironments`'s
    // conversion cache holds it in a WeakMap keyed by texture identity, and
    // only its own `dispose` listener releases the GPU resources) — without
    // this every call would leak one.
    tex?.dispose()
    rt?.dispose()
  }
}

export function ShaderWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const sceneReady = useStore((s) => s.sceneReady)
  const tier = useStore((s) => s.qualityTier)
  // A tier change legitimately needs a fresh pass (new defines → new programs);
  // an unrelated re-render must not, because compiling is not free.
  const warmed = useRef<string | null>(null)
  // Independent of `warmed`/`tier`: the backdrop program has no tier-dependent
  // defines (see the docstring), so it only ever needs warming ONCE per
  // session, not once per tier change.
  const backdropWarmed = useRef(false)

  useEffect(() => {
    if (!sceneReady) return
    if (warmed.current !== tier) {
      warmed.current = tier

      const flipped: Array<[Material, boolean]> = []
      try {
        scene.traverse((o) => {
          const mesh = o as Mesh
          if (!mesh.isMesh || !mesh.material) return
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (m.transparent) continue
            flipped.push([m, m.transparent])
            m.transparent = true
            // `needsUpdate` is what makes three re-derive the program parameters;
            // without it the cached program for the old key is reused and nothing
            // is warmed.
            m.needsUpdate = true
          }
        })
        if (flipped.length > 0) {
          const r = gl as unknown as { compile?: (s: unknown, c: unknown) => unknown }
          // SYNCHRONOUS `compile` only — never `compileAsync` (see the docstring:
          // its timer-polled readiness check throws an uncatchable TypeError when a
          // material is disposed mid-window, on any driver lacking
          // KHR_parallel_shader_compile). Programs are created synchronously either
          // way, so the restore below still happens in this same task, before any
          // frame can render.
          r.compile?.(scene, camera)
        }
      } catch {
        // Mid-teardown or an uncooperative driver — fall through to the restore.
      } finally {
        for (const [m, was] of flipped) {
          m.transparent = was
          m.needsUpdate = true
        }
      }
    }

    if (!backdropWarmed.current) {
      backdropWarmed.current = true
      const result = warmBackdropProgram(gl, camera)
      if (result && import.meta.env.DEV) {
        console.info(formatBackdropWarmupProbe(result.ms, result.programsAdded))
      }
    }
  }, [gl, scene, camera, sceneReady, tier])

  return null
}
