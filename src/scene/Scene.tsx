import { useProgress } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { PCFSoftShadowMap } from 'three'
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
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
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
import { FrameRenderedNotifier } from './FrameRenderedNotifier'
import { GridOverlay } from './GridOverlay'
import { HqRenderController } from './HqRenderController'
import { LuxOverlay } from './LuxOverlay'
import { CurtainLightController } from './lighting/CurtainLightController'
import { FurnitureLights } from './lighting/FurnitureLights'
import { Lighting } from './lighting/Lighting'
import { SceneEnvironment } from './lighting/SceneEnvironment'
import { Sky } from './lighting/Sky'
import { DEFAULT_TONE_MAPPING } from './look'
import { PanoramaController } from './PanoramaController'
import { PlacementDropAnimator } from './PlacementDropAnimator'
import { PlacementGhost } from './PlacementGhost'
import { QualityController } from './QualityController'
import { RecordController } from './RecordController'
import { RenderPump } from './RenderPump'
import { SceneBackdrop } from './SceneBackdrop'
import { SceneExportController } from './SceneExportController'
import { ScreenshotController } from './ScreenshotController'
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
import { MaybeXr } from './xr/MaybeXr'

/** Flips `sceneReady` once the scene has painted a few solid frames (so
 *  shaders + procedural textures are warm) and nothing is still streaming
 *  through the asset loaders (restored GLB layouts). The boot loading screen
 *  waits on this so the scene is already nice when revealed. */
function SceneReadySignal() {
  const frames = useRef(0)
  const { active } = useProgress()
  useFrame(() => {
    if (useStore.getState().sceneReady) return
    frames.current += 1
    if (frames.current >= 4 && !active) useStore.getState().setSceneReady(true)
  })
  return null
}

export function Scene() {
  const profilerEnabled = useFeature('profiler')
  const customPlan = useStore((s) => !isDefaultPlan(s.floorPlan))
  const floorPlan = useStore((s) => s.floorPlan)
  const occluderRects = useMemo(() => occluderRectsForPlan(floorPlan), [floorPlan])
  // Tier-gate the device-pixel-ratio ceiling: the default Performance tier caps
  // at DPR 1 (big fill-rate saving on weak/mobile GPUs); higher tiers render
  // sharper. R3F applies `dpr` changes live, so this tracks a tier switch.
  const dprMax = useQuality().dprMax
  return (
    <Canvas
      // Demand mode: render only when RenderPump calls invalidate() — the scene
      // draws 0 frames when idle (battery/thermal win) and continuously only
      // while something animates. See RenderPump / renderDecision.
      frameloop="demand"
      shadows={{ type: PCFSoftShadowMap }}
      dpr={[1, dprMax]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 400 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        // Keep the drawing buffer readable so the in-app Export (PNG) and
        // Record (.webm) capture features reliably grab rendered frames.
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
        <CurtainLightController />
        <FurnitureLights />
        {customPlan ? <PlanShell /> : <Apartment />}
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
        <MarqueeCameraTracker />
        <CameraRig />
        <CameraForwardTracker />
        <MeasurementOverlay />
        <TapeMeasure />
        <AnnotationsOverlay />
        <CommentPins />
        <Effects />
        <ShowcaseController />
        <QualityController />
        {import.meta.env.DEV && profilerEnabled ? <ProfilerProbe /> : null}
        <AnisotropyController />
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
