/**
 * Pure decision for the demand-mode render pump (see RenderPump.tsx). Kept free
 * of React/three.js so it's unit-testable with explicit inputs.
 *
 * The main `<Canvas>` runs `frameloop="demand"` — it renders only when
 * `invalidate()` is called. RenderPump runs one always-on rAF loop that calls
 * `invalidate()` whenever this function returns true, so the scene draws every
 * frame while something is animating and goes quiet (0 redraws) when idle.
 */

export interface PumpInputs {
  /** Tab hidden / window minimised — never render (biggest battery win). */
  hidden: boolean
  /** Boot not finished — keep rendering so the scene warms + SceneReadySignal ticks. */
  sceneReady: boolean
  /** drei asset loader still streaming (GLBs/textures) — keep rendering. */
  assetsActive: boolean
  /** First-person walkthrough — the FPS camera needs every frame. */
  walk: boolean
  /** Turntable auto-orbit (OrbitControls.autoRotate). */
  autoRotate: boolean
  /** Automated walkthrough tour is flying the camera. */
  touring: boolean
  /** Recording the canvas to video — must capture frames. */
  recording: boolean
  /** Legacy showcase-accumulation flag — pinned `false` since the accumulator was
   *  retired (RD-410); retained so the pump-input shape stays stable. */
  showcaseAccumulating: boolean
  /** A furniture drag gesture is in progress. */
  dragging: boolean
  /** Count of items running a continuous per-frame animation (spinning fans). */
  animatedCount: number
  /** Monotonic clock (performance.now()). */
  now: number
  /** Keep rendering until this clock value — the post-change "settle tail". */
  dirtyUntil: number
  /** Transition loading overlay is opaque — warm the swapped-in scene with
   *  throttled frames so shaders compile / textures upload behind the loader,
   *  and the readiness-based hide (scheduleTransitionHide) gets its frames. */
  overlayTransition: boolean
  /** Boot loading overlay is up — throttle WebGL so loader CSS stays smooth. */
  overlayBoot: boolean
  /** Monotonic clock of the last overlay-throttled invalidate (owned by RenderPump). */
  lastOverlayRenderMs: number
}

/** Min ms between WebGL frames while a loading overlay (boot or transition) is
 *  visible. ~10 fps warms shaders/textures + keeps SceneReadySignal and asset
 *  streaming alive without hogging the main-thread/GPU budget the loader
 *  animation needs. */
export const OVERLAY_RENDER_MS = 100

/** True while a continuous animation source wants every frame (independent of
 *  the settle tail). Used to know whether the scene is in continuous mode. */
export function isContinuous(i: PumpInputs): boolean {
  if (!i.sceneReady) return true
  if (i.assetsActive) return true
  if (i.walk || i.autoRotate || i.touring || i.recording || i.showcaseAccumulating || i.dragging)
    return true
  return i.animatedCount > 0
}

/** Should the pump request a render this rAF tick? */
export function shouldRender(i: PumpInputs): boolean {
  if (i.hidden) return false
  // Either overlay up: unconditionally grant throttled warm frames — even an
  // idle scene must produce the first frame the transition hide waits for.
  // (Boot always has !sceneReady → isContinuous anyway, so this is a pure
  // throttle there.)
  if (i.overlayTransition || i.overlayBoot)
    return i.now - i.lastOverlayRenderMs >= OVERLAY_RENDER_MS
  if (isContinuous(i)) return true
  return i.now < i.dirtyUntil
}

/** Settle-tail length (ms) after a discrete change — how long the demand-mode
 *  pump keeps drawing once a discrete edit lands, covering the emissive-glow lerp
 *  + orbit-damping safety. The longer `showcaseEnabled` branch dates from the
 *  retired AccumulativeShadows accumulator (RD-410); kept as a pure parameter so
 *  the signature/test stay stable and a future parked-camera converge step can
 *  reuse it. */
export function settleTailMs(showcaseEnabled: boolean): number {
  return showcaseEnabled ? 700 : 300
}
