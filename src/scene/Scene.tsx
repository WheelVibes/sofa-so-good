import { Stats } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
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
import { ScreenshotController } from './ScreenshotController'
import { ShowcaseController } from './ShowcaseController'
import { HoverHighlight } from './selection/HoverHighlight'
import { MarqueeCameraTracker } from './selection/MarqueeSelector'
import { SelectionOutline } from './selection/SelectionOutline'

export function Scene() {
  const showFps = useStore((s) => s.showFps)
  const customPlan = useStore((s) => !isDefaultPlan(s.floorPlan))
  return (
    <Canvas
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
      {import.meta.env.DEV ? <DevCameraExpose /> : null}
      {showFps ? <Stats /> : null}
    </Canvas>
  )
}
