import { lazyWithRetry } from './lazyWithRetry'

// Lazy-loaded panels/modals/tools — each stays out of the initial bundle and
// loads only when opened (PERF5). Gated on their open flag at the mount site.
// `lazyWithRetry` keeps the dynamic import resilient to stale post-deploy chunks
// and transient offline misses (otherwise the import error crash-lands the whole
// app on the top-level ErrorBoundary — e.g. "Importing a module script failed").
export const FloorPlanEditor = lazyWithRetry(() =>
  import('../floorplan/FloorPlanEditor').then((m) => ({ default: m.FloorPlanEditor })),
)
// The GLB designer is a large, Pro-only, fullscreen tool that few sessions open —
// lazy-load it so its editor + GLTF exporter stay out of the initial bundle.
export const GlbDesignerDialog = lazyWithRetry(() =>
  import('../glbEditor/GlbDesignerDialog').then((m) => ({ default: m.GlbDesignerDialog })),
)
// Parametric furniture generator (PF1) — rarely-open dialog with its own R3F
// preview + GLTF exporter; lazy so it stays out of the boot bundle.
export const ParametricDialog = lazyWithRetry(() =>
  import('../parametric/ParametricDialog').then((m) => ({ default: m.ParametricDialog })),
)
// Rarely-opened, dependency-heavy panels/modals — lazy-loaded + gated on their
// open flag so their code (AI client, GLTF/design-file IO, elevation projection,
// SVG builders, tour) stays out of the initial bundle (PERF5).
export const ShareModal = lazyWithRetry(() =>
  import('../ShareModal').then((m) => ({ default: m.ShareModal })),
)
export const PanoramaModal = lazyWithRetry(() =>
  import('../PanoramaModal').then((m) => ({ default: m.PanoramaModal })),
)
export const PanoTourModal = lazyWithRetry(() =>
  import('../panorama/PanoTourModal').then((m) => ({ default: m.PanoTourModal })),
)
export const HqRenderModal = lazyWithRetry(() =>
  import('../HqRenderModal').then((m) => ({ default: m.HqRenderModal })),
)
export const RenderCompareModal = lazyWithRetry(() =>
  import('../RenderCompareModal').then((m) => ({ default: m.RenderCompareModal })),
)
export const VersionsPanel = lazyWithRetry(() =>
  import('../VersionsPanel').then((m) => ({ default: m.VersionsPanel })),
)
export const ElevationPanel = lazyWithRetry(() =>
  import('../ElevationPanel').then((m) => ({ default: m.ElevationPanel })),
)
export const HistoryPanel = lazyWithRetry(() =>
  import('../HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
)
export const ProductTour = lazyWithRetry(() =>
  import('../tour/ProductTour').then((m) => ({ default: m.ProductTour })),
)
export const SmartStartWizard = lazyWithRetry(() =>
  import('../wizard/SmartStartWizard').then((m) => ({ default: m.SmartStartWizard })),
)
