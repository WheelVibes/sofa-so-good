import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { CeilingOccluder } from '../apartment/ceiling/CeilingOccluder'
import { occluderRectsForPlan } from '../apartment/ceiling/occluderRects'
import { PlanRoomShell } from '../apartment/PlanRoomShell'
import { RoomShell } from '../apartment/RoomShell'
import { FurnitureLayer } from '../furniture/FurnitureLayer'
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader'
import { useStore } from '../state/store'
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { AnisotropyController } from './AnisotropyController'
import { AnnotationsOverlay } from './AnnotationsOverlay'
import { ClearanceOverlay } from './ClearanceOverlay'
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
import { CurtainLightController } from './lighting/CurtainLightController'
import { FurnitureLights } from './lighting/FurnitureLights'
import { Lighting } from './lighting/Lighting'
import { SceneEnvironment } from './lighting/SceneEnvironment'
import { DEFAULT_TONE_MAPPING, shadowFilterForTier } from './look'
import { PlacementDropAnimator } from './PlacementDropAnimator'
import { PlacementGhost } from './PlacementGhost'
import { QualityController } from './QualityController'
import { RendererTierController, SHADOW_FILTER_THREE } from './RendererTierController'
import { RenderPump } from './RenderPump'
import { getRoomEditorShell } from './roomEditorShell'
import { ScreenshotController } from './ScreenshotController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { ResizeGizmo } from './selection/ResizeGizmo'
import { RotateGizmo } from './selection/RotateGizmo'
import { SelectionOutline } from './selection/SelectionOutline'
import { TiltGizmo } from './selection/TiltGizmo'
import { TONE_MAPPING_THREE } from './toneMappingThree'
import { useQuality } from './useQuality'

/** Per-room editor scene. Renders one isolated room but with the SAME rendering
 *  stack as the main orbit `<Canvas>` (shadows, procedural/HDRI IBL via
 *  `SceneEnvironment`, the graded `Lighting` sun + tone mapping, real fixture
 *  lights, the tier-gated `Effects` post stack, and demand-mode `RenderPump`),
 *  so materials/finishes look identical to orbit at every quality tier — a
 *  glossy or metallic surface reflects the environment instead of rendering
 *  flat. Reuses every store-driven interaction controller so catalog/placement/
 *  measurement work unchanged. */
export function RoomEditorScene() {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const plan = useStore((s) => s.floorPlan)
  const occluderRects = useMemo(
    () => occluderRectsForPlan(plan).filter((r) => r.id === roomId),
    [plan, roomId],
  )
  // Honour the user's global quality tier for the pixel-ratio ceiling, matching
  // the main orbit Canvas (High/Maximum renders crisp; Performance caps at 1).
  const dprMax = useQuality().dprMax
  const shadowMapType = SHADOW_FILTER_THREE[shadowFilterForTier(useStore((s) => s.qualityTier))]
  if (!roomId) return null
  const editorShell = getRoomEditorShell(plan, roomId)
  if (!editorShell) return null
  const shell = editorShell.shell
  const [cx, cz] = shell.center
  const r = shell.radius
  // Mask the alignment grid to just this room (its polygon when free-form, else
  // its footprint rects) so it never paints the whole apartment floor.
  const gridPolygon =
    editorShell.kind === 'plan' && editorShell.shell.room.polygon?.length
      ? (editorShell.shell.room.polygon as [number, number][])
      : undefined
  const gridRects = shell.rects
  return (
    <Canvas
      // Demand mode + RenderPump, exactly like the main orbit Canvas: the scene
      // draws 0 frames when idle and continuously only while something animates.
      frameloop="demand"
      dpr={[1, dprMax]}
      // Tier-driven filter (PHOTO-SOFTSHADOW): VSM soft shadows on Medium+, PCF
      // on the (shadowless) Performance tier. Must be THIS prop, not only the
      // controller: r3f re-applies `shadows` on every Canvas render, so a
      // gl-level write elsewhere would be stomped. Runtime-switch material
      // recompiles live in RendererTierController.
      shadows={{ type: shadowMapType }}
      camera={{
        position: [cx + r * 1.6, r * 1.8, cz + r * 1.6],
        fov: 45,
        near: 0.05,
        far: 400,
      }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        preserveDrawingBuffer: true,
        // Initial only — Lighting.tsx drives the operator + per-frame exposure
        // from grade(altitude), same as the main scene.
        toneMapping: TONE_MAPPING_THREE[DEFAULT_TONE_MAPPING],
        toneMappingExposure: 1.05,
      }}
      onPointerMissed={deselectOnMiss}
    >
      <ContextLossGuard />
      <RenderPump />
      <AnisotropyController />
      <RendererTierController />
      {/* Neutral dollhouse backdrop (ROOM-EDITOR-BACKDROP): the isolated room is
          an authoring "dollhouse", so we do NOT paint the time-of-day <Sky/> as
          the background here. A faded exterior wall in an isolated room reveals
          the background DIRECTLY (nothing else is behind it), so a bright sky bled
          through the fade — a blown-out band on the wall and, worse, the shower
          glass's transmission sampled that bright sky and lit up cyan. A flat
          neutral background can't do either, and keeps the room reading as a
          dollhouse whose look isn't driven by the exterior sky. IBL for material
          reflections still comes from <SceneEnvironment/>; daytime lighting is
          the full graded sun simulation, roofed by the virtual ceiling occluder
          (ORBIT-CEILING). */}
      <color attach="background" args={['#e6eaef']} />
      <SceneEnvironment />
      <Lighting />
      <CurtainLightController />
      <FurnitureLights />
      {editorShell.kind === 'default' ? (
        <RoomShell shell={editorShell.shell} />
      ) : (
        <PlanRoomShell shell={editorShell.shell} />
      )}
      <CeilingOccluder rects={occluderRects} />
      <GridOverlay rects={gridRects} polygon={gridPolygon} />
      <AlignmentGuides />
      <ClearanceOverlay />
      <FurnitureLayer room={shell} />
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
      <AnnotationsOverlay />
      <Effects />
      <QualityController />
      <ScreenshotController />
      <FrameRenderedNotifier />
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
    </Canvas>
  )
}
