import { Suspense, useRef } from 'react'
import { isFeatureEnabled } from '../features/featureFlags'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { lazyWithRetry } from '../ui/app/lazyWithRetry'
import { aoMsaaDecision } from './aoDepthPrepass'
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
 * MSAA-DEPTH-BLIT, **fixed upstream (R7-F)**. The long diagnosis that used to live
 * here — N8AO forcing a stable depth texture, the composer blitting scene depth into
 * it every frame, and that blit failing under `multisampling > 0` — was right about
 * the mechanism and wrong about the illegal operation: it is a depth *format* mismatch
 * (`DEPTH_COMPONENT24` MSAA renderbuffer vs `DEPTH_COMPONENT32F` stable texture), not
 * an illegal multisample resolve, and pmndrs/postprocessing #745 fixed it in v6.39.3.
 * The full write-up, the spec citations and the version gate live in
 * {@link file://./aoDepthPrepass.ts}; the policy itself is {@link aoMsaaDecision}.
 *
 * What changed here: the `ao` veto is **gone**. It was the conservative mitigation, and
 * since `quality.ts` sets `ao: true` on every tier with `postprocessing: true`, it made
 * this function constant-0 — `mobileMsaa` was unreachable dead configuration, not a
 * flag. The weak-device-class and SwiftShader exclusions stand unchanged.
 *
 * The flag still defaults OFF. This exact change regressed once; it is re-enabled by a
 * product call on real-device evidence, not by a green harness run.
 */
export function mobileMsaaSamples(o: {
  full: boolean
  deviceClass: string
  softwareRenderer: boolean
  flagOn: boolean
}): number {
  return aoMsaaDecision({ ...o, samples: MOBILE_MSAA_SAMPLES }).samples
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
