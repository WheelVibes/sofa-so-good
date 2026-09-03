import { useProgress } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Apartment } from '../apartment/Apartment'
import { CeilingOccluder } from '../apartment/ceiling/CeilingOccluder'
import { occluderRectsForPlan } from '../apartment/ceiling/occluderRects'
import { RoomHoverHighlight } from '../apartment/floor/RoomHoverHighlight'
import { PlanShell } from '../apartment/PlanShell'
import { ProfilerProbe } from '../dev/profiler/ProfilerProbe'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { FurnitureLayer } from '../furniture/FurnitureLayer'
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader'
import { useStore } from '../state/store'
import { shouldForceSceneReady } from '../ui/loading/frameGate'
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
import { AirconTrunking } from './AirconTrunking'
import { AlignmentGuides } from './AlignmentGuides'
import { AnisotropyController } from './AnisotropyController'
import { AnnotationsOverlay } from './AnnotationsOverlay'
import { ClearanceOverlay } from './ClearanceOverlay'
import { CommentPins } from './CommentPins'
import { ContextLossGuard } from './ContextLossGuard'
import { CameraRig } from './cameras/CameraRig'
import { CameraForwardTracker } from './cameras/cameraForward'
import { DevCameraExpose } from './DevCameraExpose'
import { DragController } from './DragController'
import { deselectOnMiss } from './deselectOnMiss'
import { Effects } from './Effects'
import { FinishDropSurface } from './FinishDropSurface'
import { FinishEyedropperSurface } from './FinishEyedropperSurface'
import { FrameRenderedNotifier } from './FrameRenderedNotifier'
import { GridOverlay } from './GridOverlay'
import { HqRenderController } from './HqRenderController'
import { InteractiveDprController } from './InteractiveDprController'
import { LuxOverlay } from './LuxOverlay'
import { CurtainLightController } from './lighting/CurtainLightController'
import { FurnitureLights } from './lighting/FurnitureLights'
import { Lighting } from './lighting/Lighting'
import { SceneEnvironment } from './lighting/SceneEnvironment'
import { Sky } from './lighting/Sky'
import { SCENE_CAMERA_FAR } from './lighting/skyDome'
import { DEFAULT_TONE_MAPPING, shadowFilterForTier } from './look'
import { PanoramaController } from './PanoramaController'
import { PlacementDropAnimator } from './PlacementDropAnimator'
import { PlacementGhost } from './PlacementGhost'
import { QualityController } from './QualityController'
import { RecordController } from './RecordController'
import { RendererTierController, SHADOW_FILTER_THREE } from './RendererTierController'
import { RenderPump } from './RenderPump'
import { SceneBackdrop } from './SceneBackdrop'
import { SceneExportController } from './SceneExportController'
import { ScreenshotController } from './ScreenshotController'
import { ShaderWarmup } from './ShaderWarmup'
import { ShowcaseController } from './ShowcaseController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { ResizeGizmo } from './selection/ResizeGizmo'
import { RotateGizmo } from './selection/RotateGizmo'
import { SelectionOutline } from './selection/SelectionOutline'
import { TiltGizmo } from './selection/TiltGizmo'
import { TapeMeasure } from './TapeMeasure'
import { TONE_MAPPING_THREE } from './toneMappingThree'
import { useQuality } from './useQuality'
import { VisibilityLightmaps } from './VisibilityLightmaps'
import { WalkMeasureOverlay } from './WalkMeasureOverlay'
import { MaybeXr } from './xr/MaybeXr'

/** Flips `sceneReady` once the scene has painted a few solid frames (so
 *  shaders + procedural textures are warm) and nothing is still streaming
 *  through the asset loaders (restored GLB layouts). The boot loading screen
 *  waits on this so the scene is already nice when revealed. */
/** How often to check whether a hidden page should be called ready anyway. */
const HIDDEN_READY_POLL_MS = 200

function SceneReadySignal() {
  const frames = useRef(0)
  // A hidden page paints nothing, so the frame count below never advances and
  // the boot cover would hide a scene that is, as far as anything can tell,
  // finished — that is what makes a background tab look like a hang. Poll for
  // that case only (`shouldForceSceneReady` is hidden-only, so a visible tab
  // still waits for four real frames and can never be shown unwarmed).
  useEffect(() => {
    if (useStore.getState().sceneReady) return
    const id = setInterval(() => {
      if (
        shouldForceSceneReady({
          hidden: typeof document !== 'undefined' && document.hidden,
          sceneReady: useStore.getState().sceneReady,
          progressActive: useProgress.getState().active,
        })
      ) {
        useStore.getState().setSceneReady(true)
      }
    }, HIDDEN_READY_POLL_MS)
    return () => clearInterval(id)
  }, [])
  useFrame(() => {
    if (useStore.getState().sceneReady) return
    frames.current += 1
    // Read drei's progress IMPERATIVELY. Subscribing with `useProgress()` made
    // this mounted component set state while another was rendering — drei
    // updates that store from its loading manager during React's render phase:
    //   "Cannot update a component (SceneReadySignal) while rendering a
    //    different component (Textured)"
    // (Chrome audit 2026-08; same cause as the RenderPump fix). The value is
    // only ever read here, inside the frame loop, so nothing is lost.
    if (frames.current >= 4 && !useProgress.getState().active) {
      useStore.getState().setSceneReady(true)
    }
  })
  return null
}

export function Scene() {
  const profilerEnabled = useFeature('profiler')
  const customPlan = useStore((s) => !isDefaultPlan(s.floorPlan))
  const floorPlan = useStore((s) => s.floorPlan)
  const occluderRects = useMemo(() => occluderRectsForPlan(floorPlan), [floorPlan])
  // Tier-gated device-pixel-ratio ceiling (GPU-STARVE-3). The `dpr` prop's
  // VALUE must always equal what QualityController's clamp puts in
  // `viewport.dpr`: r3f's root `configure()` re-runs on every Canvas commit
  // and calls `setDpr` (a buffer-clearing resize with no same-task repaint =
  // one white flash) whenever the prop value and `viewport.dpr` disagree.
  // That's also why the interactive degrade lives at the raw `gl` level, not
  // in r3f state — see InteractiveDprController.tsx / QualityController.tsx.
  const dprMax = useQuality().dprMax
  const dprRange = useMemo<[number, number]>(() => [1, dprMax], [dprMax])
  const shadowMapType =
    SHADOW_FILTER_THREE[
      shadowFilterForTier(
        useStore((s) => s.qualityTier),
        useStore((s) => s.deviceClass),
      )
    ]
  const cameraMode = useStore((s) => s.cameraMode)
  return (
    <Canvas
      // A11Y: r3f's Canvas forwards unknown HTML attributes to the wrapping
      // div (CanvasProps extends React.HTMLAttributes<HTMLDivElement>) — so
      // this labels the actual interactive surface for a screen reader, which
      // otherwise announces a bare, unlabelled <canvas>. Wording tracks the
      // active camera mode (orbit drags/scrolls; first-person walks WASD).
      role="img"
      aria-label={
        cameraMode === 'firstPerson'
          ? '3D first-person walkthrough of your home'
          : '3D view of your home — drag to orbit, scroll to zoom'
      }
      // Demand mode: render only when RenderPump calls invalidate() — the scene
      // draws 0 frames when idle (battery/thermal win) and continuously only
      // while something animates. See RenderPump / renderDecision.
      frameloop="demand"
      // Tier-driven filter (PHOTO-SOFTSHADOW): VSM soft shadows on Medium+, PCF
      // on the (shadowless) Performance tier. Must be THIS prop, not only the
      // controller: r3f re-applies `shadows` on every Canvas render, so a
      // gl-level write elsewhere would be stomped. Runtime-switch material
      // recompiles live in RendererTierController.
      shadows={{ type: shadowMapType }}
      dpr={dprRange}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: SCENE_CAMERA_FAR }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        // Keep the drawing buffer readable so the in-app Export (PNG) and
        // Record (MP4/WebM) capture features reliably grab rendered frames.
        preserveDrawingBuffer: true,
        // Initial only — Lighting.tsx drives both the operator (from the user's
        // tone-mapping "look") and the exposure per-frame from grade(altitude).
        toneMapping: TONE_MAPPING_THREE[DEFAULT_TONE_MAPPING],
        toneMappingExposure: 1.05,
      }}
      onPointerMissed={deselectOnMiss}
    >
      {/* Inert pass-through until a VR session is requested (F21). */}
      <MaybeXr>
        <ContextLossGuard />
        <RenderPump />
        <Sky />
        <SceneBackdrop />
        <SceneEnvironment />
        <Lighting />
        {/* Baked skylight-visibility maps (item (w)), flag-gated and off by default. Mounted
            beside the rig it corrects, and inside the scene so its one-time shader compiles
            happen behind the loader rather than mid-session. Renders nothing. */}
        <VisibilityLightmaps />
        <CurtainLightController />
        <FurnitureLights />
        {customPlan ? <PlanShell /> : <Apartment />}
        {/* Modeled aircon trunking route (BSJ-2 follow-up) — custom plans only,
            see the module doc for why (no room-graph for the curated flat). */}
        {customPlan && <AirconTrunking />}
        <CeilingOccluder rects={occluderRects} />
        {/* "Click a room to edit" hover highlight — works for both plans now. */}
        <RoomHoverHighlight />
        <GridOverlay />
        <AlignmentGuides />
        <ClearanceOverlay />
        <LuxOverlay />
        <FurnitureLayer />
        <FurnitureMaterialLoader />
        <SelectionOutline />
        <RotateGizmo />
        <ResizeGizmo />
        <TiltGizmo />
        <HoverHighlight />
        <PlacementGhost />
        <PlacementDropAnimator />
        <DragController />
        <FinishDropSurface />
        <FinishEyedropperSurface />
        <MarqueeCameraTracker />
        <CameraRig />
        <CameraForwardTracker />
        <MeasurementOverlay />
        <TapeMeasure />
        <WalkMeasureOverlay />
        <AnnotationsOverlay />
        <CommentPins />
        <Effects />
        <ShowcaseController />
        <QualityController />
        <ShaderWarmup />
        {import.meta.env.DEV && profilerEnabled ? <ProfilerProbe /> : null}
        <AnisotropyController />
        <RendererTierController />
        <InteractiveDprController />
        <ScreenshotController />
        <SceneExportController />
        <PanoramaController />
        <HqRenderController />
        <RecordController />
        <SceneReadySignal />
        <FrameRenderedNotifier />
        {import.meta.env.DEV ? <DevCameraExpose /> : null}
      </MaybeXr>
    </Canvas>
  )
}
