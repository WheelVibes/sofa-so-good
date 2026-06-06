import { useProgress } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
import { Apartment } from '../apartment/Apartment'
import { PlanShell } from '../apartment/PlanShell'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { FurnitureLayer } from '../furniture/FurnitureLayer'
import { FurnitureMaterialLoader } from '../furniture/FurnitureMaterialLoader'
import { useStore } from '../state/store'
import { MeasurementOverlay } from '../ui/MeasurementOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { CityBackdrop } from './CityBackdrop'
import { ClearanceOverlay } from './ClearanceOverlay'
import { ContextLossGuard } from './ContextLossGuard'
import { CameraRig } from './cameras/CameraRig'
import { CameraForwardTracker } from './cameras/cameraForward'
import { DevCameraExpose } from './DevCameraExpose'
import { DragController } from './DragController'
import { Effects } from './Effects'
import { GridOverlay } from './GridOverlay'
import { FurnitureLights } from './lighting/FurnitureLights'
import { Lighting } from './lighting/Lighting'
import { SceneEnvironment } from './lighting/SceneEnvironment'
import { Sky } from './lighting/Sky'
import { PlacementGhost } from './PlacementGhost'
import { QualityController } from './QualityController'
import { RecordController } from './RecordController'
import { RenderPump } from './RenderPump'
import { ScreenshotController } from './ScreenshotController'
import { ShowcaseController } from './ShowcaseController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { RotateGizmo } from './selection/RotateGizmo'
import { SelectionOutline } from './selection/SelectionOutline'

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
  const customPlan = useStore((s) => !isDefaultPlan(s.floorPlan))
  return (
    <Canvas
      // Demand mode: render only when RenderPump calls invalidate() — the scene
      // draws 0 frames when idle (battery/thermal win) and continuously only
      // while something animates. See RenderPump / renderDecision.
      frameloop="demand"
      shadows={{ type: PCFSoftShadowMap }}
      dpr={[1, 1.75]}
      camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 400 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        // Keep the drawing buffer readable so the in-app Export (PNG) and
        // Record (.webm) capture features reliably grab rendered frames.
        preserveDrawingBuffer: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05, // initial only — Lighting.tsx drives this per-frame from grade(altitude)
      }}
    >
      <ContextLossGuard />
      <RenderPump />
      <Sky />
      <CityBackdrop />
      <SceneEnvironment />
      <Lighting />
      <FurnitureLights />
      {customPlan ? <PlanShell /> : <Apartment />}
      <GridOverlay />
      <AlignmentGuides />
      <ClearanceOverlay />
      <FurnitureLayer />
      <FurnitureMaterialLoader />
      <SelectionOutline />
      <RotateGizmo />
      <HoverHighlight />
      <PlacementGhost />
      <DragController />
      <MarqueeCameraTracker />
      <CameraRig />
      <CameraForwardTracker />
      <MeasurementOverlay />
      <Effects />
      <ShowcaseController />
      <QualityController />
      <ScreenshotController />
      <RecordController />
      <SceneReadySignal />
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
    </Canvas>
  )
}
