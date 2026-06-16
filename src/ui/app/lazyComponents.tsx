import { lazy } from 'react'

// Lazy-loaded panels/modals/tools — each stays out of the initial bundle and
// loads only when opened (PERF5). Gated on their open flag at the mount site.
export const FloorPlanEditor = lazy(() =>
  import('../floorplan/FloorPlanEditor').then((m) => ({ default: m.FloorPlanEditor })),
)
// The GLB designer is a large, Pro-only, fullscreen tool that few sessions open —
// lazy-load it so its editor + GLTF exporter stay out of the initial bundle.
export const GlbDesignerDialog = lazy(() =>
  import('../glbEditor/GlbDesignerDialog').then((m) => ({ default: m.GlbDesignerDialog })),
)
// Parametric furniture generator (PF1) — rarely-open dialog with its own R3F
// preview + GLTF exporter; lazy so it stays out of the boot bundle.
export const ParametricDialog = lazy(() =>
  import('../parametric/ParametricDialog').then((m) => ({ default: m.ParametricDialog })),
)
// Rarely-opened, dependency-heavy panels/modals — lazy-loaded + gated on their
// open flag so their code (AI client, GLTF/design-file IO, elevation projection,
// SVG builders, tour) stays out of the initial bundle (PERF5).
export const ShareModal = lazy(() =>
  import('../ShareModal').then((m) => ({ default: m.ShareModal })),
)
export const PanoramaModal = lazy(() =>
  import('../PanoramaModal').then((m) => ({ default: m.PanoramaModal })),
)
export const PanoTourModal = lazy(() =>
  import('../panorama/PanoTourModal').then((m) => ({ default: m.PanoTourModal })),
)
export const HqRenderModal = lazy(() =>
  import('../HqRenderModal').then((m) => ({ default: m.HqRenderModal })),
)
export const RenderCompareModal = lazy(() =>
  import('../RenderCompareModal').then((m) => ({ default: m.RenderCompareModal })),
)
export const VersionsPanel = lazy(() =>
  import('../VersionsPanel').then((m) => ({ default: m.VersionsPanel })),
)
export const ElevationPanel = lazy(() =>
  import('../ElevationPanel').then((m) => ({ default: m.ElevationPanel })),
)
export const HistoryPanel = lazy(() =>
  import('../HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
)
export const ProductTour = lazy(() =>
  import('../tour/ProductTour').then((m) => ({ default: m.ProductTour })),
)
export const SmartStartWizard = lazy(() =>
  import('../wizard/SmartStartWizard').then((m) => ({ default: m.SmartStartWizard })),
)
