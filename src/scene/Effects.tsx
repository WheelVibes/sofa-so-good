import { Suspense, useRef } from 'react'
import { isFeatureEnabled } from '../features/featureFlags'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { lazyWithRetry } from '../ui/app/lazyWithRetry'
import { useQuality } from './useQuality'

// The post-processing stack (Bloom + SMAA + N8AO) and its dependencies are
// only used on the high tier. Lazy-load them so low/medium users — the fast
// path — never download the heavy postprocessing/n8ao code.
const EffectsImpl = lazyWithRetry(() => import('./EffectsImpl'))

/**
 * Mounts the high-tier post-processing stack when quality enables it; renders
 * nothing (and pulls in no postprocessing code) otherwise.
 *
 * Raster depth-of-field (PC2-CAM-DOF-LENS) is wired here from the shared store
 * lens/DoF model: it mounts only when the tier allows it (`quality.dof`, i.e.
 * high/maximum), the `cameraDof` feature flag is on, and the user has chosen a
 * non-zero aperture (`dofFStop`). Focus is the shared metres value
 * (`dofFocusDistance`); a lower f-stop → a larger bokeh + tighter focus range.
 */
/**
 * WALL-NO-COMPOSER invariant (v0.31.5.67), as a pure decision so it can be
 * tested without rendering: **a composer mounts for EVERY tier.** Returning
 * `null` here is what broke `performance` — see the comment in {@link Effects}.
 * `full` and `ao` only decide WHICH passes it carries, never whether it exists.
 */
export function composerPlan(q: { postprocessing: boolean; ao: boolean }): {
  mount: true
  full: boolean
  ao: boolean
} {
  return { mount: true, full: q.postprocessing, ao: q.ao }
}

/** MOBILE-POLISH — samples for the FULL post composer. 4 is the measured
 *  `MAX_SAMPLES` on this GPU class (ANGLE/Metal, Apple M4) and the same number
 *  the AO-only composer has always used.
 *
 *  Weak-class only: `capable` runs at `dprMax 2` on a desktop-density display
 *  where SMAA alone already holds up, and it is the class with the least
 *  headroom to spend. Never on a SOFTWARE rasteriser — SwiftShader has no tile
 *  memory, so every sample is real ALU work on the tier that can least afford it
 *  (REALISTIC-SOFTWARE-FALLBACK). Pure so it can be unit-tested. */
export const MOBILE_MSAA_SAMPLES = 4
/**
 * MSAA-DEPTH-BLIT (candidate fix, unverified in a live browser — see
 * `docs/…` / the investigation that added this comment): `ao=true` mounts
 * `N8AO` (`n8ao/dist/N8AO.js:1349`, `this.needsDepthTexture = true`), which
 * makes `postprocessing`'s `EffectComposer.addPass` allocate a "stable depth
 * texture" (`node_modules/postprocessing/build/index.js:1047` `createDepthTexture`,
 * `DepthTexture.type = FloatType` → `DEPTH_COMPONENT32F`) and, every frame,
 * `blitFramebuffer` the scene's depth into it (`index.js:1072` `blitDepthBuffer`,
 * called from `render()` at `index.js:1281` whenever `RenderPass.needsDepthBlit`
 * is set, which it always is — `index.js:6722`). When the composer's own input
 * buffer is multisampled (`multisampling > 0`), its depth attachment is an
 * implicit MSAA renderbuffer (`node_modules/three/src/renderers/webgl/WebGLTextures.js:1697`
 * `renderbufferStorageMultisample`, format `DEPTH_COMPONENT24` per
 * `getInternalDepthFormat(false, null)` at `WebGLTextures.js:276-278`). WebGL2
 * does not support resolving a multisample depth/stencil plane into a
 * single-sample one via `blitFramebuffer` (sample counts must match on both
 * sides for DEPTH_BUFFER_BIT/STENCIL_BUFFER_BIT) — measured directly: turning
 * `mobileMsaa` on floods the console with
 * `GL_INVALID_OPERATION: glBlitFramebuffer: Depth/stencil buffer format
 * combination not allowed for blit.` (real Metal backend, `SHOT_GPU=1`; silent
 * under the default SwiftShader path, which is why this was easy to miss). The
 * blit then no-ops every frame, so N8AO's `setDepthTexture` — and therefore its
 * whole SSAO term — reads a stale/garbage depth buffer for as long as MSAA is
 * on. That is the leading suspect for the measured ~20% mid-tone dimming
 * (living ceiling/wall/floor 115/118/67 → 90/100/64) and the night highlight
 * clipping (200 → 254): a corrupted AO term biasing the frame before tone
 * mapping, not tone mapping itself.
 *
 * TRADE-OFF: forcing `msaa` to 0 whenever `ao` is mounted is the conservative
 * fix — it removes the corruption but also removes MOBILE-POLISH's whole
 * benefit, because `ao` is true on every tier that would otherwise want MSAA
 * (the AO-only tier always ran `multisampling=4` unconditionally too, so THAT
 * path likely has the same bug and predates this feature — worth checking
 * independently). The properly-fixed version would give `N8AO` its own
 * private, non-multisampled depth pre-pass instead of the composer's shared
 * one, decoupling it from `multisampling`; that is a bigger change than this
 * patch attempts. Until then, AO wins over MSAA rather than shipping a
 * silently wrong frame.
 */
export function mobileMsaaSamples(o: {
  full: boolean
  deviceClass: string
  softwareRenderer: boolean
  flagOn: boolean
  ao: boolean
}): number {
  if (!o.full || !o.flagOn || o.softwareRenderer || o.deviceClass !== 'weak' || o.ao) return 0
  return MOBILE_MSAA_SAMPLES
}

/**
 * @param allowOrbitStudio ORBIT-STUDIO-LOOK. Only the main `Scene` passes it —
 * `RoomEditorScene` is a second canvas over the SAME store whose `cameraMode` is
 * also `'orbit'`, so the mode alone cannot separate the dollhouse from the
 * isolated-room editor. Structural, exactly as for `<Lighting allowOrbitStudio />`.
 */
export function Effects({ allowOrbitStudio = false }: { allowOrbitStudio?: boolean } = {}) {
  const { postprocessing, ao, aoFullRes, cinematic, dof } = useQuality()
  const cameraMode = useStore((s) => s.cameraMode)
  const orbitStudioFlag = useFeature('orbitStudioLook')
  const deviceClass = useStore((s) => s.deviceClass)
  const softwareRenderer = useStore((s) => s.softwareRenderer)
  const mobileMsaaFlag = useFeature('mobileMsaa')
  const dofFStop = useStore((s) => s.dofFStop)
  const dofFocusDistance = useStore((s) => s.dofFocusDistance)
  //
  // WALL-NO-COMPOSER (v0.31.5.67): this used to `return null` when neither the
  // full stack nor AO was wanted, which made `performance` the only tier that
  // rasterised straight into the canvas' DEFAULT framebuffer. That framebuffer
  // is created with `preserveDrawingBuffer: true` (`Scene.tsx`, for the in-app
  // PNG/video capture), and in that combination interior WALL FACES are not
  // drawn at all — measured across headless-metal, headless-gl and a real
  // browser window. Mounting even a minimal composer moves the scene into an
  // offscreen target and the walls come back.
  //
  // The minimal composer is not empty: under a composer three does NOT apply
  // `gl.toneMapping` (see `toneMappingPost.ts`), so it must still carry the view
  // transform or the tier would render raw linear HDR. `ao={false}` keeps N8AO
  // off, which is the whole point of this tier.
  const dofEnabled = dof && isFeatureEnabled('cameraDof') && dofFStop > 0
  // The AO half of ORBIT-STUDIO-LOOK: a metre-scale kernel for the 15 m orbit
  // viewing distance. Walk keeps AO-SMALL-ROOM's 0.7 m / 5 byte-identical.
  const orbitStudio = allowOrbitStudio && orbitStudioFlag && cameraMode === 'orbit'
  const msaaWanted = mobileMsaaSamples({
    full: postprocessing,
    deviceClass,
    softwareRenderer,
    flagOn: mobileMsaaFlag,
    ao,
  })
  // MSAA-FREEZE (candidate fix, unverified in a live browser): reading `msaa`
  // fresh every render lets `<EffectComposer multisampling>` change value
  // while mounted. `@react-three/postprocessing`'s `EffectComposer` builds the
  // underlying `postprocessing.EffectComposer` in a `useMemo` whose dependency
  // array includes `multisampling` itself
  // (`node_modules/@react-three/postprocessing/dist/index.js`, the `dt`
  // component: `z(()=>{...new ze(d,{...multisampling:_,...})...},[u,d,s,p,_,S,f,l,r])`
  // — `_` is `multisampling`). So any live change to `deviceClass`,
  // `softwareRenderer` or the `mobileMsaa` flag while this component stays
  // mounted tears down the WHOLE `postprocessing.EffectComposer` (all its
  // render targets) and builds a fresh one; the new targets' first
  // `renderer.setRenderTarget` call does the actual GPU allocation
  // (`WebGLTextures.js` `setupRenderTarget`), and a real device/driver hiccup
  // during that allocation reads as a single fully black canvas — which
  // matches "black canvas in 2 of 4 attempts right after the sample count
  // changes". Freezing `msaa` at the first render where the full stack is
  // mounted makes `multisampling` a true mount-time constant: a later
  // capability re-probe or an admin flag flip only takes effect on the next
  // full remount (tier change / page reload), never mid-session.
  const msaaRef = useRef<number | null>(null)
  if (msaaRef.current === null && postprocessing) msaaRef.current = msaaWanted
  const msaa = msaaRef.current ?? 0
  return (
    <Suspense fallback={null}>
      <EffectsImpl
        ao={ao}
        full={postprocessing}
        aoFullRes={aoFullRes}
        cinematic={cinematic}
        dof={dofEnabled}
        dofFStop={dofFStop}
        dofFocusDistance={dofFocusDistance}
        orbitStudio={orbitStudio}
        msaa={msaa}
      />
    </Suspense>
  )
}
