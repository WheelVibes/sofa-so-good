/**
 * Central feature-flag registry — the single source of truth for what ships to
 * production. Every gateable feature has one entry here with a production
 * `default`. `devOnly` flags are forced **off** in a production build regardless
 * of any override (so dev/QA-only surfaces can never leak to prod).
 *
 * Pure data + dependency-free. The resolution logic lives in `./resolve`; the
 * type vocabulary in `./types`. Flip a flag here (and redeploy) to change prod.
 */

import type { FeatureFlag, FlagDef } from './types'

/** The registry. Order here is the display order in the dev panel.
 *  `tier` categorises each feature for Simple/Pro mode (see CLAUDE.md): Simple =
 *  the minimal core design loop (furnish, finish, view, share, budget); Pro =
 *  everything analytical/professional/advanced, hidden in Simple mode. */
export const FEATURE_FLAGS: Record<FeatureFlag, FlagDef> = {
  report: {
    label: 'Design report',
    description: 'Printable PDF report (Tools / Share)',
    default: true,
    tier: 'pro',
  },
  walkthrough: {
    label: 'Walkthrough',
    description: 'Auto camera tour + recording',
    default: true,
    tier: 'simple',
  },
  sunStudy: { label: 'Sun study', description: 'Time-lapse sun path', default: true, tier: 'pro' },
  measure: {
    label: 'Measure',
    description: 'Tape / area measure tool',
    default: true,
    tier: 'simple',
  },
  budget: {
    label: 'Budget',
    description: 'Shopping list + budget panel',
    // Price/shopping surface — off by default (not production-ready).
    default: false,
    tier: 'simple',
  },
  renoBudget: {
    label: 'Renovation budget',
    description: 'Whole-reno cost by trade/stage (BSJ-1)',
    // Core decision support for the blank-slate owner — pure client, prod-safe.
    default: true,
    tier: 'simple',
  },
  deliveryAccess: {
    label: 'Delivery access',
    description: 'Check furniture can reach the room via lift, corridor and doors',
    default: true,
    tier: 'pro',
  },
  siteMeasurements: {
    label: 'Site measurements',
    description: 'Reconcile tape-measured dimensions against the model',
    default: true,
    tier: 'pro',
  },
  schemeOptions: {
    label: 'Scheme options',
    description: 'Generate and compare alternative design schemes',
    default: true,
    tier: 'pro',
  },
  constructionDetails: {
    label: 'Construction details',
    description: 'Junction detail sheet (ceiling drops, upturns, thresholds, sills)',
    default: true,
    tier: 'pro',
  },
  specification: {
    label: 'Specification',
    description: 'Written workmanship/tolerance spec sheet in the drawing set',
    default: true,
    tier: 'pro',
  },
  coordinationChecks: {
    label: 'Coordination checks',
    description: 'Cross-discipline clashes (MEP vs furniture vs ceiling)',
    default: true,
    tier: 'pro',
  },
  clearanceChecks: {
    label: 'Clearance checks',
    description: 'Door-swing / fit checks',
    // Clearance warnings — off by default (not production-ready).
    default: false,
    tier: 'pro',
  },
  versions: {
    label: 'Versions',
    description: 'Save / restore / compare snapshots',
    default: true,
    // Snapshot save/restore/compare is an analytical/professional surface —
    // CLAUDE.md hard rule explicitly lists "versions" among the pro-tier
    // examples (alongside measure/checks/drawings/scores/AI), so it's hidden
    // in Simple mode.
    tier: 'pro',
  },
  // Live 3D split-view compare against a saved version (sibling of `versions`,
  // opened from a version row). Image-based (see versionCompare.ts docblock):
  // captures the current view, then temporarily swaps the saved version's
  // design into the live scene, captures it, and restores the exact prior
  // state — reusing the renderCompare/stagingReveal reveal-divider UI rather
  // than a live dual-scene render. Prod-safe pure code (same capture pipeline
  // as those two), but a version-management surface → pro tier, same as
  // `versions` itself.
  versionCompareView: {
    label: 'Compare version in 3D',
    description: 'Split-view a saved version against the current design on a draggable divider',
    default: true,
    tier: 'pro',
  },
  history: {
    label: 'Edit history',
    description: 'Undo timeline panel',
    default: true,
    tier: 'simple',
  },
  shareExport: {
    label: 'Share & export',
    description: 'Share modal (link / PNG / file)',
    default: true,
    tier: 'simple',
  },
  floorPlanEditor: {
    label: 'Floor-plan editor',
    description: '2D plan editor',
    default: true,
    tier: 'simple',
  },
  planReset: {
    label: 'New / reset apartment',
    description: 'Start a new plan, reset to the default flat, or clear furniture',
    default: true,
    tier: 'simple',
  },
  smartStart: {
    label: 'Smart Start',
    description: 'One-click furnish wizard',
    default: true,
    tier: 'simple',
  },
  layoutReroll: {
    label: 'Try another layout',
    description: 'Reroll a room into a different valid auto-arrangement',
    // Core arrange loop — a casual user exploring layout alternatives, so it
    // ships in Simple mode (prod-safe, pure code).
    default: true,
    tier: 'simple',
  },
  textBrief: {
    label: 'Describe-it brief',
    description: 'Free-text brief matched to a Smart Start style + budget',
    // Describe-it brief — off by default (not production-ready).
    default: false,
    tier: 'simple',
  },
  panorama: {
    label: '360° panorama',
    description: 'Equirect 360° capture with drag-to-look viewer + PNG export',
    // Off by default — an advanced capture surface, opt-in.
    default: false,
    tier: 'simple',
  },
  panoTour: {
    label: '360° tour',
    description: 'Linked multi-room panorama tour with clickable room-to-room hotspots',
    // Off by default — an advanced presentation surface, opt-in.
    default: false,
    tier: 'simple',
  },
  renderPresets: {
    label: 'Render presets',
    description: 'One-tap sun + tone + exposure photo modes in the Scene menu',
    default: true,
    tier: 'simple',
  },
  // Lighting mood presets (UX round-3 #3, Coohom parity): a one-tap chip row
  // (Reading / Movie night / Entertaining / Romantic + Normal reset) that
  // adjusts placed fixtures' brightness + colour temperature scene-wide, on
  // top of the existing `lightsMode` multiplier (`lighting/moodPresets.ts`,
  // pure). Pure client-side code, no external assets → prod-safe; a core
  // furnish/view delight like `renderPresets` above → simple tier.
  lightMoodPresets: {
    label: 'Lighting mood presets',
    description: 'One-tap Reading / Movie night / Entertaining / Romantic lighting moods',
    default: true,
    tier: 'simple',
  },
  hqRender: {
    label: 'HQ render',
    description: 'Progressive path-traced photoreal still (three-gpu-pathtracer)',
    default: true,
    tier: 'simple',
  },
  hqAiDenoise: {
    label: 'HQ render AI denoise',
    // PHOTO-DENOISE: OIDN U-Net over the finished HQ still (the `denoiser`
    // package — tfjs; WebGPU when available, else WebGL2), guided by cheap
    // albedo/normal AOV passes. Weights are Apache-2.0, self-hosted under
    // public/denoiser-tzas/ — prod-safe, no third-party CDN. Same tier as its
    // host feature `hqRender`; falls back to the edge-blur when off/failed.
    description: 'Neural (OIDN) denoise of the finished HQ render for near-offline quality',
    default: true,
    tier: 'simple',
  },
  vrWalkthrough: {
    label: 'VR walkthrough',
    description: 'WebXR immersive walkthrough on supported headsets',
    default: true,
    tier: 'pro',
  },
  savedViews: {
    label: 'Saved views',
    description: 'Camera bookmarks',
    default: true,
    tier: 'simple',
  },
  backdrops: {
    label: 'Backdrops',
    description: 'Selectable equirectangular photo view through windows in walk mode (city/dusk/…)',
    default: true,
    tier: 'simple',
  },
  packs: {
    label: 'Content packs',
    description: 'Downloadable furniture/material packs',
    default: true,
    tier: 'pro',
  },
  remoteMaterials: {
    label: 'Online materials',
    description: 'CC0 material browser',
    default: true,
    tier: 'pro',
  },
  showroomFinishes: {
    label: 'Showroom finishes',
    description: 'Curated photo-scanned PBR finishes (Poly Haven CC0)',
    // CORS-direct CC0 streaming → prod-safe. Unlike the full remoteMaterials
    // browser (pro), the curated one-tap strip is part of the core finish
    // loop, so it stays in Simple mode.
    default: true,
    tier: 'simple',
  },
  colorGrade: {
    label: 'Scene colour grade',
    description: 'Warmth (white balance) + saturation dials in Graphics',
    // Pure-code view knobs beside Exposure — prod-safe. Simple tier: undoing/
    // adjusting the overall colour cast is part of the core "view" loop (the
    // Exposure dial it sits beside is Simple too).
    default: true,
    tier: 'simple',
  },
  remoteFurniture: {
    label: 'Online models',
    description: 'CC0 3D-model browser (Poly Haven)',
    // CORS-direct CC0 (Poly Haven) → prod-safe, no proxy / licence risk.
    default: true,
    // External fetched-model browsing is an advanced surface (parity with
    // remoteMaterials / packs) → hidden in Simple mode, where the catalog keeps
    // only the curated builtin furnish loop.
    tier: 'pro',
  },
  modelUpload: {
    label: 'Model upload',
    description: 'Import GLB / OBJ / … models',
    default: true,
    tier: 'simple',
  },
  aiPhotoreal: {
    label: 'AI photoreal export',
    description: 'BYO-key image-to-image (experimental)',
    default: true,
    tier: 'pro',
  },
  aiWalls: {
    label: 'AI wall recognition',
    description: 'Vision-model plan tracing (experimental)',
    default: true,
    tier: 'pro',
  },
  aiPlanGenerate: {
    label: 'AI plan generation',
    description: 'Text brief → editable floor plan (experimental)',
    default: true,
    tier: 'pro',
  },
  // Read-only, BYO-key advisor chat grounded in the live design's own computed
  // numbers (design score / plan statistics) — mirrors aiWalls/aiPlanGenerate's
  // BYO-key precedent (prod-safe: pure code + graceful no-key error, no bundled
  // model/key). Pro tier — an analytical/advisory surface, not core-loop.
  aiDesignChat: {
    label: 'AI design chat',
    description: 'Ask an LLM about your design, grounded in its live numbers (BYO key)',
    default: true,
    tier: 'pro',
  },
  ikeaLive: {
    label: 'IKEA live scrape',
    description: 'Local scraper pack (needs a sidecar)',
    default: true,
    devOnly: true,
    tier: 'pro',
  },
  localAssets: {
    label: 'Local asset folder',
    description: 'Auto-load GLBs from local-assets/ (dev only, no upload)',
    default: true,
    devOnly: true,
    tier: 'simple',
  },
  livePrices: {
    label: 'Live SG retailer prices',
    description: 'Live price lookup — IKEA/Courts/HipVan/Castlery (needs a sidecar)',
    // Price feature — off by default (not production-ready).
    default: false,
    devOnly: true,
    tier: 'pro',
  },
  drawings: {
    label: 'Drawings',
    description: 'Wall elevations + lighting plan panel',
    default: true,
    tier: 'pro',
  },
  daylight: {
    label: 'Daylight check',
    description: 'Window glazing & ventilation per room',
    default: true,
    tier: 'pro',
  },
  designScore: {
    label: 'Design score',
    description: 'Aggregate layout-quality grade + fixes',
    default: true,
    tier: 'pro',
  },
  accessibility: {
    label: 'Accessibility check',
    description: 'Door widths + wheelchair turning space',
    default: true,
    tier: 'pro',
  },
  moodboard: {
    label: 'Moodboard',
    description: 'Shareable style-board export',
    default: true,
    tier: 'pro',
  },
  // One-tap "hero card": the current 3D snapshot framed with the design's palette
  // swatches + name + stat line + a "Sofa So Good" wordmark, as a single share-
  // ready PNG (4:5). Closes the "share" stage of the core loop with a delight
  // artifact → simple tier. Pure client-side canvas raster, no sidecar → prod-safe.
  shareCard: {
    label: 'Share card',
    description: 'One-tap branded hero image (3D snapshot + palette + stats)',
    default: true,
    tier: 'simple',
  },
  paletteFromPhoto: {
    label: 'Palette from photo',
    description: 'Extract a palette from an image → finishes',
    default: true,
    tier: 'pro',
  },
  dxfExport: {
    label: 'DXF export',
    description: '2D plan → DXF for CAD/contractor handoff',
    default: true,
    tier: 'pro',
  },
  boq: {
    label: 'Quote (BOQ)',
    description: 'Bill-of-quantities quote export',
    // Price/quote surface — off by default (not production-ready).
    default: false,
    tier: 'pro',
  },
  // Whole-scene 3D export (Q-3DEXPORT / SweetHome3DJS ObjWriter+glTF parity). The
  // furnished home → glTF/GLB (+ OBJ) for Blender / AR / Coohom hand-off. Pure
  // client-side three GLTFExporter/OBJExporter (dynamic-imported) → prod-safe, no
  // sidecar. Surfaced in the default experience (curated launch set) → simple tier.
  sceneExport3d: {
    label: 'Export 3D model',
    // Consumer-facing 3D formats only (UIUX-71): GLB is the portable/AR-ready
    // interchange file and USDZ is iOS AR Quick Look ("see it in your room").
    // The geometry-only professional formats moved to `sceneExportCad` (pro) —
    // Simple mode must not offer a casual HDB owner a Wavefront OBJ.
    description: 'Whole furnished scene → glTF/GLB + USDZ (AR-ready)',
    default: true,
    tier: 'simple',
  },
  sceneExportCad: {
    label: 'Export 3D model (CAD formats)',
    description: 'Geometry-only OBJ / STL for Blender, CAD and 3D printing',
    default: true,
    // Professional interchange formats — Pro alongside `dxfExport`, per the
    // Simple-tier rule (Simple = the minimal core loop only).
    tier: 'pro',
  },
  batchRender: {
    label: 'Render all views',
    description: 'Batch-export a PNG of every saved camera view in one click (SweetHome3D parity)',
    default: true,
    tier: 'pro',
  },
  shopExport: {
    label: 'Shopping list export',
    description: 'Shoppable buy-list HTML — items, prices, per-retailer totals',
    // Shopping-list/price surface — off by default (not production-ready).
    default: false,
    tier: 'simple',
  },
  suggestions: {
    label: 'Design suggestions',
    description: 'Contextual "what to add" hints in Design score',
    default: true,
    tier: 'pro',
  },
  electricalPlan: {
    label: 'Electrical plan',
    description: 'Power / data / switch layout in the drawing set',
    default: true,
    tier: 'pro',
  },
  mountHeights: {
    label: 'Mount-height presets',
    description: 'One-tap standard heights for wall/ceiling items',
    default: true,
    tier: 'simple',
  },
  copyAppearance: {
    label: 'Copy appearance',
    description: 'Copy/paste finish between items + recolour a category',
    default: true,
    tier: 'simple',
  },
  userSets: {
    label: 'My sets',
    description: 'Save a selection as a reusable furniture set',
    default: true,
    tier: 'pro',
  },
  furnitureGroups: {
    label: 'Furniture groups',
    description: 'Group items so they move / rotate / duplicate / delete as one',
    default: true,
    tier: 'pro',
  },
  designerPicks: {
    label: 'Designer picks',
    description: 'Curated one-tap floor/wall finishes in the picker',
    default: true,
    tier: 'simple',
  },
  // Compose a floor/wall finish from a texture/pattern + a colour (MAT-COMPOSE):
  // every procedural finish is a (pattern, colour) pair, so the composer exposes
  // that directly instead of only pre-baked catalog entries. Pure client-side
  // (synthesised on the fly, reuses the procedural pipeline) → prod-safe. A core
  // part of the finish loop a casual user benefits from → simple tier.
  materialComposer: {
    label: 'Compose finishes',
    description: 'Build a floor/wall finish from a texture/pattern combined with any colour',
    default: true,
    tier: 'simple',
  },
  // Custom colours repaint the CURRENT finish instead of replacing it with
  // flat plaster paint, and picking a new texture keeps the colour override
  // (FINISH-RECOLOR). Pure client-side (the `tint:…!r` id grammar + an
  // on-device canvas recolor of the albedo) → prod-safe. Part of the core
  // finishing loop a casual user hits on their first colour pick → simple tier.
  finishRecolor: {
    label: 'Recolour any finish',
    description: 'Custom colours repaint the current finish, keeping its texture and pattern',
    default: true,
    tier: 'simple',
  },
  ceilingDesign: {
    label: 'Ceiling design',
    description: 'Per-room tray / coffered / dropped ceilings',
    default: true,
    tier: 'pro',
  },
  // Per-room ceiling finish (CUSTOMIZE-CEILING): paint or texture a room's
  // ceiling (colour / wood / plaster / any CC0 material), mirroring the floor &
  // wall finish pickers. Pure render-side (resolves a catalog material like the
  // floor) → prod-safe. A basic surface customization in the core design loop,
  // so it lives in Simple tier alongside floor/wall finish.
  ceilingFinish: {
    label: 'Ceiling finish',
    description: "Paint or texture a room's ceiling (colour / wood / any material)",
    default: true,
    tier: 'simple',
  },
  // Save a composed/tinted finish as a named, reusable custom material
  // (CUSTOMIZE-SAVE-MATERIAL). Extends the composer: name the look you built and
  // it joins the picker under your own materials, reusable across rooms/projects.
  // Pure (a named bookmark of a self-describing finish id) → prod-safe; part of
  // the core finishing loop, so Simple tier.
  saveMaterials: {
    label: 'Save custom materials',
    description: 'Name a composed/tinted finish and save it as a reusable material',
    default: true,
    tier: 'simple',
  },
  // Apartment master colour palette + per-room overrides + harmony-blend
  // suggestions on every colour picker (CUSTOMIZE-MASTER-PALETTE). Pure UI/data
  // (a swatch row + a pure harmony engine) → prod-safe; a core design aid, so
  // Simple tier.
  masterPalette: {
    label: 'Apartment colour palette',
    description:
      'Set a master palette (+ per-room overrides); every picker shows it + harmony blends',
    default: true,
    tier: 'simple',
  },
  // Curated one-click colour-theme presets for the master/room palette
  // (R3-FEAT-2; Coohom/Planner 5D "themes"). Pure static data + the existing
  // setMasterPalette/setRoomPalette actions → prod-safe. Pro tier per the
  // round-3 audit ruling (a styling accelerator, not the core loop).
  palettePresets: {
    label: 'Palette presets',
    description: 'One-click curated colour themes for the apartment palette',
    default: true,
    tier: 'pro',
  },
  presentation: {
    label: 'Presentation mode',
    description: 'Full-screen saved-views slideshow with notes',
    default: true,
    tier: 'pro',
  },
  photographicFill: {
    label: 'Photographic light balance',
    description:
      'Offer a Photographic look toggle — deepens shadows by reducing the flat ambient fill, so surfaces show their texture',
    // The FLAG ships the control; the LOOK is `ui.photographicLook`, off by
    // default. Overrides are ignored in a production build (`resolve.ts`), so a
    // flag defaulting false would have made this unreachable for every real user.
    default: true,
    tier: 'simple',
  },
  pbrSurfaces: {
    label: 'Realistic surfaces',
    description: 'Higher-fidelity procedural furniture textures (wood/painted/fabric)',
    default: true,
    tier: 'simple',
  },
  comments: {
    label: 'Comments',
    description: 'Pinned design comments — notes anchored in the 3D scene',
    default: true,
    tier: 'pro',
  },
  finishDnd: {
    label: 'Drag-to-apply finishes',
    description: 'Drag a finish swatch onto the 3D scene or the Objects list to apply it',
    default: true,
    tier: 'simple',
  },
  // Eyedropper — sample a floor/wall's finish in the 3D scene, then paint it
  // onto other surfaces. Pure prod-safe code, part of the core finish loop →
  // simple tier (shown in both Simple and Pro).
  finishEyedropper: {
    label: 'Finish eyedropper',
    description: "Sample a surface's finish in the 3D scene, then apply it to other walls/floors",
    default: true,
    tier: 'simple',
  },
  // An authoring tool, prod-safe pure code. Surfaced in the default experience
  // (curated launch set) → simple tier.
  parametricFurniture: {
    label: 'Custom-size furniture',
    description: 'Generate shelving / wardrobes / sideboards to exact dimensions',
    default: true,
    tier: 'simple',
  },
  // Slot-based product configurator (SLOT). Pure procedural geometry → prod-safe;
  // a core "configure this product" furnishing surface like parametricFurniture →
  // simple tier (shown in both Simple and Pro).
  productConfigurator: {
    label: 'Configurable products',
    description: 'Build mattress-on-frame + modular sofas by picking options per slot',
    default: true,
    tier: 'simple',
  },
  // Parametric kitchen cabinet run (C270). Pure procedural geometry → prod-safe.
  // Surfaced in the default experience (curated launch set) → simple tier.
  kitchenCabinets: {
    label: 'Custom kitchen cabinets',
    description: 'Generate a parametric kitchen base-cabinet run with optional upper cabinets',
    default: true,
    tier: 'simple',
  },
  // Compare render presets. Prod-safe pure code. Surfaced in the default
  // experience (curated launch set) → simple tier.
  renderCompare: {
    label: 'Render preset compare',
    description: 'A/B compare two render presets with a draggable before/after divider',
    // Off by default — an advanced presentation surface, opt-in.
    default: false,
    tier: 'simple',
  },
  // Before/after staging reveal — empty room vs furnished design on a draggable
  // divider (consumer-staging parity). Prod-safe pure code (reuses the live
  // canvas capture), but a presentation flourish, not the core loop → pro tier.
  stagingReveal: {
    label: 'Before / after reveal',
    description: 'Compare the empty room with your furnished design on a draggable divider',
    default: true,
    tier: 'pro',
  },
  // Time-of-day comparison reveal — the SAME camera/scene at two chosen times
  // of day (e.g. midday vs night) on the same reveal-divider mechanism as
  // stagingReveal above, just driving the sun/time rig instead of visibility.
  // Prod-safe pure code (reuses the live canvas capture), but an analytical
  // "how does this room read across the day" view → pro tier.
  timeCompare: {
    label: 'Time-of-day compare',
    description: 'Compare your design at two times of day on a draggable divider',
    default: true,
    tier: 'pro',
  },
  // Day → night animated render clip — while recording the saved-views
  // walkthrough video, sweep the time-of-day slider across a chosen range so
  // the exported clip transitions through lighting conditions (Coohom
  // day-to-night video parity, see REFERENCES.md). Pure client code (drives the
  // existing sun rig from tour progress), prod-safe, but a presentation
  // flourish layered on the pro recording path → pro tier.
  dayNightClip: {
    label: 'Day → night clip',
    description: 'Sweep the time of day across the recorded walkthrough video',
    default: true,
    tier: 'pro',
  },
  // One-tap style transfer — restyle every room's floor/wall finish + palette to
  // a named look (Scandi/Japandi/Industrial/…). Pure data + builtin CC0 finishes,
  // prod-safe, but an advanced design shortcut → pro tier.
  styleTransfer: {
    label: 'Style transfer',
    description: 'One tap restyles every room’s floors, walls & palette to a curated look',
    default: true,
    tier: 'pro',
  },
  // Short personality quiz that recommends + applies a curated style. Pure data
  // + builtin finishes, prod-safe; a guided design extra → pro tier.
  styleQuiz: {
    label: 'Style quiz',
    description: 'Answer a few questions to find & apply your interior style',
    default: true,
    tier: 'pro',
  },
  shortcutsHelp: {
    label: 'Keyboard shortcuts',
    description: 'A "?" overlay listing every keyboard shortcut',
    default: true,
    tier: 'pro',
  },
  // Live width × depth pill while group-resizing a multi-selection (the resize
  // gizmo otherwise gives no size feedback). Pure DOM overlay off a signal, no
  // GPU/assets → prod-safe; a core sizing affordance → Simple tier.
  itemDimensionReadout: {
    label: 'Resize dimensions',
    description: 'Show live width × depth while resizing a group of items',
    default: true,
    tier: 'simple',
  },
  // Paint a single wall face a different finish (a feature/accent wall) by
  // clicking it in the room editor. Pure per-wall finish state, prod-safe; a
  // common casual design move → Simple tier, default on.
  wallAccentPicker: {
    label: 'Accent walls',
    description: 'Click a wall to paint it a different finish from the rest of the room',
    default: true,
    tier: 'simple',
  },
  // Recolour every selected piece at once from the multi-select panel (vs the
  // copy-one-then-paste-appearance path). Pure `props.tint` state, prod-safe;
  // a fast common re-skin → Simple tier, default on.
  bulkAppearance: {
    label: 'Bulk recolour',
    description: 'Tint every selected item at once from the multi-select panel',
    default: true,
    tier: 'simple',
  },
  // Consolidated asset-credits / attribution viewer (CC-BY assets that require
  // visible attribution + CC0 sources). Pure data, prod-safe; universal → simple.
  assetCredits: {
    label: 'Asset credits',
    description: 'View attribution & licenses for bundled and downloaded assets',
    default: true,
    tier: 'simple',
  },
  // Decorative wall–ceiling trim (T2). Pure procedural geometry, no external
  // assets → prod-safe. Crown molding is a core finish detail visible in casual
  // use, so it belongs in Simple tier.
  crownMolding: {
    label: 'Crown molding',
    description: 'Decorative trim strip at the wall–ceiling junction with miter-cut corners',
    default: true,
    tier: 'simple',
  },
  // Window-glass tint: colours the sun light (C275). Pure code, no external
  // assets → prod-safe, default on. Simple tier — a subtle realism layer visible
  // in casual use.
  windowGlassTint: {
    label: 'Window glass tint',
    description: 'Optionally tint the sun colour as it enters through window glass',
    default: true,
    tier: 'simple',
  },
  // Curtain light attenuation: drawn curtains dim sunlight (C275). Pure code →
  // prod-safe, default on. Simple tier — affects the core furnish experience.
  curtainLightEffect: {
    label: 'Curtain light attenuation',
    description: 'Drawn curtains dim the sun entering through windows',
    default: true,
    tier: 'simple',
  },
  // Walk-mode observer camera controls (Sweet Home 3D parity, PARITY-WALKCAM):
  // field-of-view + eye-height sliders in the walk HUD. Pure code, no external
  // assets → prod-safe. Surfaced in the default experience (curated launch set) → simple tier.
  walkCameraControls: {
    label: 'Walk camera controls',
    description: 'Adjust field-of-view + eye-height in first-person walk mode',
    default: true,
    tier: 'simple',
  },
  // Curtains/blinds toggle open-closed in walk mode (click/tap/E), mirroring the
  // existing door interact affordance (WINDOW-FIXTURE-INTERACT). Pure code, no
  // external assets → prod-safe; a core walk-mode "explore the space" delight
  // like the door swing → simple tier.
  walkWindowFixtures: {
    label: 'Interactive curtains & blinds',
    description: 'Click/tap or press E to open curtains and raise/lower blinds in walk mode',
    default: true,
    tier: 'simple',
  },
  // Screens (monitor/TV) cycle their wallpaper on click/tap/E in walk mode
  // (WALK-SCREEN-INTERACT) — a sibling flag to `walkWindowFixtures` rather
  // than widening it: each walk-mode interact affordance gets its own flag
  // (matching `remoteFurniture`/`remoteMaterials`'s precedent of granular,
  // independently-toggleable siblings over one umbrella flag), so this new,
  // unrelated furniture-capability interaction can't accidentally piggyback
  // on — or force a rename of — the already-shipped curtain/blind flag. Pure
  // code, no external assets → prod-safe; a core walk-mode "explore the
  // space" delight like the door swing/curtain toggle → simple tier.
  walkScreens: {
    label: 'Interactive screens',
    description: 'Click/tap or press E to cycle a monitor/TV’s wallpaper in walk mode',
    default: true,
    tier: 'simple',
  },
  // Light fixtures (+ any item flagged via `itemAsLight`) toggle on/off on
  // click/tap/E in walk mode (WALK-LIGHT-INTERACT) — same sibling-flag
  // rationale as `walkScreens` above. Pure code, no external assets →
  // prod-safe; simple tier for the same "explore the space" reason.
  walkLights: {
    label: 'Interactive lights',
    description: 'Click/tap or press E to turn a lamp/fixture on or off in walk mode',
    default: true,
    tier: 'simple',
  },
  // Walk-mode point-to-point measure (WALK-MEASURE) — aim at a surface, set two
  // points, read the live distance. This is the walk-mode counterpart to the
  // existing orbit-mode `measure` (tape/area) tool, which is `simple` tier (a
  // core "will this fit here?" HDB-sizing question, not an analytical extra) —
  // mirrored here rather than defaulting to `pro`, so the "explore the space"
  // measure affordance is available on the same footing in both view modes.
  // Pure code, no external assets → prod-safe.
  walkMeasure: {
    label: 'Walk-mode measure',
    description: 'Set two aimed points in walk mode and read the live distance between them',
    default: true,
    tier: 'simple',
  },
  // Open/close a cabinet's doors + drawers (CABINET-OPEN): the inspector gains an
  // Open/Close toggle for cabinet-family primitives (kitchen cabinets, wardrobes,
  // sideboards, dressers) whose fronts then swing/slide with an eased ~0.4 s
  // motion — mirroring the room-door swing + curtain/blind draw. The open state
  // lives on the item's own `props.open`, round-tripping via the existing `items`
  // persistence (no new schema field). Pure code, no external assets → prod-safe;
  // a core furnish/view delight (peek inside your storage), not an analytical
  // tool → simple tier, like the walk-mode interact siblings above.
  cabinetOpen: {
    label: 'Open cabinet doors & drawers',
    description: 'Open or close a cabinet, wardrobe, sideboard or dresser from the inspector',
    default: true,
    tier: 'simple',
  },
  // Minimap tap-to-teleport (MINIMAP-JUMP): click/tap a spot on the walk-mode
  // minimap to jump the walker there, clamped inside the tapped (or nearest)
  // room's walls. A navigation aid for the core walk loop, not an advanced
  // tool — biggest win on mobile where WASD/drag-walking across a whole flat
  // is slow (RoomSketcher/Coohom tour parity). Pure code, no external assets
  // → prod-safe; simple tier like its `walkScreens`/`walkLights` siblings.
  // Pet fittings & furniture catalog category (Pet program). Adds the `pets`
  // catalog tab — pet beds, safety window/balcony mesh screens, doorway pet
  // gates, pet-door inserts, playpens (procedural, real-metre, structurally
  // sound). Pure procedural geometry, no external assets → prod-safe. Placing
  // pet furniture is part of the core furnish loop (many SG homes have pets;
  // the window-mesh screen is a Cat-Management-Framework compliance fitting) →
  // simple tier. When off, the `pets` category is hidden from the catalog.
  petFittings: {
    label: 'Pet fittings',
    description: 'Pet beds, safety window mesh screens, doorway gates, pet doors & playpens',
    default: true,
    tier: 'simple',
  },
  // Pet profile (Pet program P6): the "Do you have pets?" per-design setting (a
  // multi-select of the 7 pet types) + the catalog "Essentials" surfacing for the
  // declared types. Declaring pets tailors the core furnish loop (essentials
  // surfaced first) → simple tier, present in both modes. Pure procedural, no
  // external assets → prod-safe. When off, the setting + essentials cue hide.
  petProfile: {
    label: 'Pet profile',
    description: 'Declare your household pets to surface the essentials they need',
    default: true,
    tier: 'simple',
  },
  // Pet compliance checklist (Pet program P6): the "Pet compliance" panel + ⌘K
  // command + design-report section — a data-driven checklist of the required /
  // recommended fittings each declared pet needs (Cat Management Framework window
  // meshing, litter, dog rest area, …) with have/need counts + citations. An
  // analytical/advisory review tool → pro tier (hidden in Simple, like the other
  // Analyse panels). Pure procedural, no external assets → prod-safe.
  petCompliance: {
    label: 'Pet compliance',
    description: 'Checklist of required & recommended fittings for your declared pets',
    default: true,
    tier: 'pro',
  },
  minimapTeleport: {
    label: 'Minimap tap-to-teleport',
    description: 'Click or tap a spot on the walk-mode minimap to move there instantly',
    default: true,
    tier: 'simple',
  },
  // Replace-with-similar (PARITY-REPLACE): swap a placed item for a nearest-size
  // catalog sibling in one click, keeping its position/rotation/level. Pure code,
  // no external assets → prod-safe. Surfaced in the default experience → simple tier.
  replaceSimilar: {
    label: 'Replace with similar',
    description: 'Swap a placed item for a nearest-size catalog alternative, keeping its place',
    default: true,
    tier: 'simple',
  },
  // Upload-your-own walk-mode backdrop photo (the `custom` backdrop). Pure
  // client-side — the user's own image, persisted in IDB; no licensing →
  // prod-safe. Simple tier — part of the core backdrop/view experience.
  customBackdrop: {
    label: 'Custom backdrop photo',
    description: 'Upload your own photo as the walk-mode window view',
    default: true,
    tier: 'simple',
  },
  // Real-photo paint visualizer: upload a wall photo, trace a polygon mask and
  // preview a paint swatch composited on with a luminance-preserving blend (Behr
  // /Dulux precedent). Pure client-side canvas maths — the photo never leaves the
  // device; no external assets/licensing → prod-safe. Simple tier — a casual
  // "will this colour work on my wall" convenience in the core finish loop.
  paintVisualizer: {
    label: 'Paint visualizer',
    description: 'Preview a paint colour on a photo of your real wall',
    default: true,
    tier: 'simple',
  },
  // 2D-plan furniture name/price labels (Sweet Home 3D parity). Pure code, no
  // external assets → prod-safe. Surfaced in the default experience → simple tier.
  planLabels: {
    label: 'Plan labels',
    description: 'Show furniture names / prices on the 2D floor plan',
    default: true,
    tier: 'simple',
  },
  // Plumbing plan sheet in the drawing set (mirrors electricalPlan). Pure code,
  // no external assets → prod-safe. A technical drawing → pro tier.
  plumbingPlan: {
    label: 'Plumbing plan',
    description: 'Water-supply / drainage layout sheet in the drawing set',
    default: true,
    tier: 'pro',
  },
  // Turn any placed item into a night light source (SH3D parity). Pure code,
  // feeds the existing FurnitureLights system → prod-safe. Surfaced in the
  // default experience (curated launch set) → simple tier.
  itemAsLight: {
    label: 'Item as light source',
    description: 'Make any placed item emit light at night',
    default: true,
    tier: 'simple',
  },
  // AI auto-furnish (PARITY-AILAYOUT): LLM proposes a layout from a brief. BYO
  // model key (no key bundled); experimental → pro tier, prod-safe (pure code +
  // graceful no-key error, like aiWalls/aiPhotoreal).
  aiLayout: {
    label: 'AI auto-furnish',
    description: 'Furnish rooms from a text brief via a BYO-key LLM (experimental)',
    default: true,
    tier: 'pro',
  },
  planPolyline: {
    label: 'Plan polyline markup',
    description: 'Free-form polyline annotations (open/closed, dashed, arrow) in the 2D editor',
    default: true,
    tier: 'simple',
  },
  // Trace backdrop (ghost stencil): upload a floor-plan photo/scan as a
  // translucent, calibratable underlay to trace walls over. Plan-authoring aid
  // beyond the Simple core loop → pro tier (matches planScale).
  planTraceBackdrop: {
    label: 'Plan trace image',
    description: 'Upload a floor-plan image as a translucent underlay to trace over',
    default: true,
    tier: 'pro',
  },
  // Multi-axis furniture tilt (SweetHome3DJS parity): pitch/roll an item off
  // vertical (angle a picture, recline a backrest, bank a decor piece), editable
  // via the inspector's TiltControls sliders AND the in-viewport TiltGizmo drag
  // handle (PARITY-TILT tail, scene/selection/TiltGizmo.tsx — same flag gates
  // both affordances, they're one capability, not two). Pure code, no external
  // assets → prod-safe. An advanced placement control beyond the core furnish
  // loop → pro tier.
  tiltFurniture: {
    label: 'Tilt furniture',
    description:
      'Pitch / roll an item off vertical (angle art, recline, bank) — slider + 3D handle',
    default: true,
    tier: 'pro',
  },
  // Catalog card model metadata tooltip (SweetHome3DJS FurnitureTablePanel
  // parity): model byte size + creator/licence on hover. Pure code → prod-safe.
  // An informational/pro detail → pro tier.
  catalogModelInfo: {
    label: 'Catalog model info',
    description: 'Show a model’s size + creator / licence in the catalog card tooltip',
    default: true,
    tier: 'pro',
  },
  // Curved/arc walls (SweetHome3DJS parity): drag a wall's midpoint handle to
  // bulge it into a curve. Pure geometry (chord sub-segments) → prod-safe.
  // Surfaced in the default experience (curated launch set) → simple tier.
  curvedWalls: {
    label: 'Curved walls',
    description: 'Bow a wall into a curve by dragging its midpoint handle (no openings on curves)',
    default: true,
    tier: 'simple',
  },
  // Sloping (variable-height) walls (SweetHome3DJS parity): a shed/mono-pitch
  // wall whose top ramps from a start to an end height, rendered as a prism.
  // Pure geometry → prod-safe. Surfaced in the default experience → simple tier.
  slopingWalls: {
    label: 'Sloping walls',
    description: 'Give a wall a sloped (shed) top — different heights at each end (no openings)',
    default: true,
    tier: 'simple',
  },
  // Per-wall baseboard / skirting params (SweetHome3DJS baseboard parity): height,
  // colour, and a hide toggle per wall. Pure geometry/colour → prod-safe.
  // Surfaced in the default experience (curated launch set) → simple tier.
  wallBaseboard: {
    label: 'Wall baseboards',
    description: 'Per-wall skirting board height, colour and a hide toggle',
    default: true,
    tier: 'simple',
  },
  // Persistent ruler guides (PARITY-PLAN-GUIDES): axis-aligned reference lines
  // points snap to in the 2D editor. Pure geometry → prod-safe; analytical
  // authoring aid → pro tier (hidden in Simple).
  planGuides: {
    label: 'Plan guides',
    description: 'Pin ruler guide lines that the 2D editor snaps to',
    default: true,
    tier: 'pro',
  },
  // Round/bevel a wall corner (PARITY-CORNER-FILLET): trims the two walls meeting
  // at a vertex to tangent points and inserts a curved connecting wall. Pro tier.
  cornerFillet: {
    label: 'Round corner',
    description: 'Fillet (round) or bevel a corner where two walls meet',
    default: true,
    tier: 'pro',
  },
  // Chained dimension strings (PARITY-DIM-CHAIN): a row of consecutive dimensions
  // along a room/wall baseline. Pro tier (analytical drawing aid).
  dimensionChain: {
    label: 'Chain dimensions',
    description: 'Generate a row of consecutive dimension strings along a room edge',
    default: true,
    tier: 'pro',
  },
  // Suggest/apply minimal nudges to clear narrow walkway gaps (GAP-SUGGEST). Pro.
  gapSuggest: {
    label: 'Fix narrow gaps',
    description: 'Nudge furniture to clear flagged narrow walkway gaps',
    default: true,
    tier: 'pro',
  },
  // Triplanar (dominant-axis world) UVs on sloped/curved wall geometry (MAT-006b)
  // so a tiled finish reads at a constant world scale with no stretch. Pure
  // geometry → prod-safe; advanced authoring concern → pro tier.
  triplanarWalls: {
    label: 'Triplanar walls',
    description: 'World-scaled, non-stretched texture mapping on sloped/curved walls',
    default: true,
    tier: 'pro',
  },
  // CC0 HDRI environment library for image-based lighting (F3/R-HDRI · PHOTO-HDRI).
  // Poly Haven CC0 .hdr (CORS-direct) → prod-safe; an advanced lighting control → pro.
  // Off by selection (default keeps the procedural probe), so no default-look change.
  hdriEnvironment: {
    label: 'HDRI lighting',
    description: 'Light the scene with a real captured CC0 HDRI environment',
    default: true,
    tier: 'pro',
  },
  // Configurable wall thickness: a plan-wide default (external/internal) plus
  // per-wall metre overrides, edited in the 2D plan inspector. Pure geometry →
  // prod-safe. Surfaced in the default experience (curated launch set) → simple tier.
  wallThickness: {
    label: 'Wall thickness',
    description: 'Set a plan-wide default wall thickness and per-wall overrides',
    default: true,
    tier: 'simple',
  },
  // Wall structural classification (TODO G7 — SG hacking-plan hardening): a
  // user-declared load-bearing / RC partition / brick partition / drywall /
  // unknown tag per wall, feeding the demolition sheet's classification
  // rendering + "NOT PERMITTED" hard-stop for a load-bearing wall marked for
  // demolition. Analytical/pro-only (like the `drawings` sheet it feeds) — a
  // casual Simple-mode user furnishing a move-in default has no hacking plan
  // to classify.
  wallStructure: {
    label: 'Wall structure',
    description: 'Classify a wall load-bearing / RC / brick / drywall for the demolition sheet',
    default: true,
    tier: 'pro',
  },
  // Wall-types 3D overlay: tints each wall by its `structure` classification
  // (`wallTypeColor.ts` — structural red, gable-end blue, permit-required
  // amber, unclassified untinted) in the whole-flat orbit view AND the
  // per-room editor, so the same classification `wallStructure` records is
  // visible outside the 2D plan editor. A view toggle (View menu, desktop +
  // mobile), not an edit surface; pure client-side render tint, no assets →
  // prod-safe. Analytical/pro-only (matches `wallStructure`, the flag it
  // visualises) — hidden in Simple mode.
  wallTypes3d: {
    label: 'Wall types overlay (3D)',
    description: 'Tint walls by structural type (structural / gable-end / permit) in 3D',
    default: true,
    tier: 'pro',
  },
  // Flags walled-in floor with no room (red) in the 2D plan editor so the gap is
  // obvious to fix. Shown in both modes (a casual user should see it too) → simple
  // tier. The 3D fallback ground that fills the void is unconditional (not this).
  unroomedFlag: {
    label: 'Un-roomed area flag',
    description: 'Highlight walled-in floor with no room assigned (red) in the 2D plan editor',
    default: true,
    tier: 'simple',
  },
  // Flags stray plan elements in the 2D editor (red): a wall joined to no other
  // wall, a room touching no other room, a door/window not on a wall — so the
  // apartment can be made whole. Analytical "check" surface → pro tier (hidden in
  // Simple); pure geometry, no deps → prod-safe (default on).
  planIntegrity: {
    label: 'Plan integrity flags',
    description: 'Flag stray walls / rooms / doors / windows (disconnected) in the 2D plan editor',
    default: true,
    tier: 'pro',
  },
  // Scale the whole plan by a factor, or to a known wall length, in one undoable
  // action (Sweet Home 3D / RoomSketcher parity) — fix a wrong-scale traced /
  // imported plan or resize to an exact dimension. Pure geometry, no external
  // deps → prod-safe (default on). An advanced authoring tool beyond the core
  // furnish loop → pro tier (hidden in Simple).
  planScale: {
    label: 'Scale plan',
    description: 'Rescale the whole plan by a factor or to a known wall length, in one action',
    default: true,
    tier: 'pro',
  },
  // "View in your room" AR: iOS AR Quick Look from a USDZ (blob), GLB download
  // elsewhere. Pure client-side (no backend/dep) → prod-safe. A high-wow viewing
  // surface beyond the core loop → pro tier.
  viewInAr: {
    label: 'View in AR',
    description: 'Place the design in your room — iOS AR Quick Look (USDZ) or an AR-ready GLB',
    default: true,
    tier: 'pro',
  },
  // Per-room floor-texture transform (SweetHome3DJS texture scale/angle parity):
  // scale the tile size + rotate the floor texture. Pure geometry-UV transform →
  // prod-safe. Surfaced in the default experience (curated launch set) → simple tier.
  floorTexture: {
    label: 'Floor texture transform',
    description: 'Scale + rotate a room’s floor texture (tile size / angle)',
    default: true,
    tier: 'simple',
  },
  // Per-room WALL-texture transform — the wall counterpart of `floorTexture`
  // (tile size + angle). A tiled wall finish (brick, subway, panelling,
  // wallpaper) needs its course size and run direction as much as a floor does.
  // Pure geometry-UV transform → prod-safe; part of the core finish loop the
  // floor dials already sit in → simple tier, same as `floorTexture`.
  wallTexture: {
    label: 'Wall texture transform',
    description: 'Scale + rotate a room’s wall texture (tile size / angle)',
    default: true,
    tier: 'simple',
  },
  // North/compass rose on the 2D plan (SweetHome3DJS compass parity). Pure
  // overlay reflecting the orientation. Surfaced in the default experience → simple tier.
  planCompass: {
    label: 'Plan compass',
    description: 'Show a North/compass rose on the 2D floor plan',
    default: true,
    tier: 'simple',
  },
  // Z-order / layer reordering (bring forward / send to back) for placed items
  // (PARITY-ZORDER). A core Canva-style editing op — pure array reorder, prod-safe
  // → simple tier, default on.
  layerOrder: {
    label: 'Layer order',
    description: 'Bring forward / send to back (z-order) for selected items',
    default: true,
    tier: 'simple',
  },
  // Dynamic right-click context menu that overrides the browser menu and adapts
  // its actions to the current selection/screen (furniture, walls, rooms,
  // openings, dimensions, multi-select) in both editors. Pure UI, prod-safe →
  // simple tier, default on.
  contextMenu: {
    label: 'Context menu',
    description: 'Right-click menu with selection-aware actions (group/lock/layer/flip/delete)',
    default: true,
    tier: 'simple',
  },
  // Persisted catalog favourites / star list (PC-CATALOG-FAVOURITES). A QOL
  // convenience matching Coohom/Planner5D — users star items for quick reuse
  // across sessions. Pure client-side (localStorage) → prod-safe. Part of the
  // core furnish loop (casual users benefit most) → simple tier.
  catalogFavourites: {
    label: 'Catalog favourites',
    description: 'Star catalog items to save them in a persistent Favourites tab',
    default: true,
    tier: 'simple',
  },
  // "Fits this room" size cue (CATALOG-FITS, 2026-07-03 core-loop parity audit).
  // Badges/dims a catalog card when the item's footprint can't reasonably fit
  // the room currently being edited — reuses `def.defaultFootprint` + the shared
  // `CLEARANCE` constants (`catalog/roomFit.ts`), no new geometry. Pure
  // client-side, no external assets → prod-safe. A passive read-only cue that
  // helps a casual user avoid an oversized pick in the core furnish loop
  // (the HDB small-space premise) → simple tier, present in both modes.
  catalogFits: {
    label: 'Room-fit cue',
    description: "Badge/dim catalog items that won't fit the room being edited",
    default: true,
    tier: 'simple',
  },
  // The "Fits only" browse filter that hides catalog items flagged `wont-fit`
  // by the same room-fit check. An analytical/filtering refinement over the
  // passive cue above (which stays visible without this flag) → pro tier,
  // hidden in Simple mode so the simple browse UI stays uncluttered.
  catalogFitsFilter: {
    label: 'Fits-only filter',
    description: "Catalog toggle to hide items that won't fit the room being edited",
    default: true,
    tier: 'pro',
  },
  // Room-aware catalog default (CATALOG-ROOMAWARE, 2026-07-03 core-loop parity
  // audit): on entering a room to edit, the catalog lands on the category
  // most relevant to that room's kind (bedroom→beds, kitchen→appliances,
  // bath→bathroom, living→seating) instead of always the same curated
  // default — pure client-side reordering of `FURNITURE_CATEGORIES`, no new
  // data. A passive, always-safe default-landing behaviour that helps a
  // casual shopper in the core furnish loop → simple tier, present in both
  // modes; never changes search/filter/favourites, only the initial tab.
  catalogRoomAware: {
    label: 'Room-aware catalog default',
    description: 'Land the catalog on the category most relevant to the room being edited',
    default: true,
    tier: 'simple',
  },
  // Recently-placed quick-add row (CATALOG-RECENTS, UX-research pick). Surfaces
  // the last handful of defs the user actually placed as a thin tap-to-place
  // strip atop the catalog grid PLUS the fuller "Recent" pseudo-category tab —
  // the far-more-frequent "the thing I just used" complement to the deliberate
  // Favourites star. Automatic + item-level: `recentSlice` records a defId on
  // every `addItem` commit, self-persisted per-device to localStorage (like
  // favourites, out of the save schema). Pure client-side, no external assets →
  // prod-safe. A core furnish-loop convenience a casual user leans on → simple
  // tier, present in both modes.
  catalogRecents: {
    label: 'Recently placed',
    description: 'Quick-add strip + tab of the catalog items you most recently placed',
    default: true,
    tier: 'simple',
  },
  // Side-by-side catalog item comparison tray (CATALOG-COMPARE, UX-research round
  // 2 pick #3). A "Compare" toggle in the catalog header arms select-for-compare:
  // tapping 2-3 same-category cards (a checkmark overlay, NOT a new per-card
  // button — the src/ui/CLAUDE.md no-card-buttons rule) opens a modal tray with
  // one column per item — thumbnail, W×D×H, footprint area, price (when the def
  // carries one), and a "fits this room" verdict via the existing
  // `itemFitsRoom`/`useActiveRoomFreeRects` machinery — each column's Place
  // button reuses `useCatalogPlacement` so placement matches everywhere. Pure
  // client-side (reuses existing footprint/price/fit data, no new geometry) →
  // prod-safe. An HDB-scale core "which sofa actually fits" furnish-loop
  // decision aid → simple tier, present in both modes.
  catalogCompare: {
    label: 'Compare items',
    description: 'Select 2-3 same-category catalog items to compare size, price & room fit',
    default: true,
    tier: 'simple',
  },
  // Room-starter "essentials" chips (roomStarters, UX-research pick #5). When a
  // user enters an EMPTY room, the empty-state offers a row of tap-to-add chips
  // for that room-kind's key anchor pieces (bedroom → bed/wardrobe/nightstand,
  // living → sofa/TV console/coffee table, …); each chip adds ONE sensibly
  // wall-anchored piece. Fixes a Simple-tier dead-end — the room-kind guidance
  // data exists but the analytical `suggestions` surface is Pro-only, so the
  // casual persona got no concrete starting help. Pure client-side, built-in
  // catalog only, no external assets → prod-safe. Core furnish-loop onboarding
  // help for a first-time user → simple tier, present in both modes.
  roomStarters: {
    label: 'Room starter chips',
    description: 'Tap-to-add starter pieces in the empty-room hint, tailored to the room',
    default: true,
    tier: 'simple',
  },
  // Soft contact-shadow blobs that ground every piece of furniture against the
  // floor (RZ1). One shared radial-gradient texture + a transparent plane per
  // item — cheap fill-rate overdraw, no shadow map — so it reads even on the
  // flat Performance tier and the software renderer. Pure code, no external
  // assets → prod-safe. A core realism cue everyone sees → simple tier.
  contactShadows: {
    label: 'Contact shadows',
    description: 'Soft grounding shadow blobs under furniture (all quality tiers)',
    default: true,
    tier: 'simple',
  },
  // GPU-STARVE-1: halves the render resolution while the camera is actively
  // driven at High/Maximum so no frame can approach the OS GPU watchdog (whose
  // driver reset drops the WebGL context — the "white flash while panning"
  // report). Pure code, prod-safe; part of the core view loop → simple tier.
  interactiveDegrade: {
    label: 'Smooth camera motion',
    description:
      'Temporarily lowers render resolution while the camera moves at High/Maximum quality (prevents GPU stalls)',
    default: true,
    tier: 'simple',
  },
  // Free-text callouts on drawing-set sheets (PARITY-LIGHTINGTEMPLATE-TEXT).
  // A designer adds a note ("Contractor to verify", "GL = 0.00") that renders
  // as crisp SVG text on the target sheet when the drawing set is exported.
  // Pure code, no external assets → prod-safe. An authoring/professional tool →
  // pro tier (hidden in Simple mode automatically).
  drawingCallouts: {
    label: 'Drawing-set callouts',
    description: 'Free-text annotations on construction drawing-set sheets',
    default: true,
    tier: 'pro',
  },
  // User-editable quote template (PARITY-QUOTE-XLSX tail): company branding,
  // header/footer notes, GST/markup/discount, section visibility. Pure code,
  // no external assets → prod-safe. A professional export-customisation tool →
  // pro tier (hidden in Simple mode automatically).
  quoteTemplate: {
    label: 'Quote template',
    description: 'Customise the quote with company branding, notes, GST & markup',
    default: true,
    tier: 'pro',
  },
  // Configurable price-rule library (PARITY-PRICE-RULES). Contractor-editable
  // $/m² floor + wall rates and the carpentry $/lin.m that drive the BOQ quote
  // and the renovation estimate. Pure code, no external assets → prod-safe; a
  // professional quoting tool → pro tier (hidden in Simple mode automatically).
  priceRules: {
    label: 'Price rules',
    description: 'Edit the per-m² finish + carpentry rates used in the quote & estimate',
    default: true,
    tier: 'pro',
  },
  // Live numeric length + angle entry while drawing walls (PC-WALL-NUMERIC).
  // Matches Sweet Home 3D / Arcadium 3D behaviour: type an exact length (and
  // optional angle) while dragging, press Enter to commit. Pure code, no
  // external assets → prod-safe. An authoring/pro tool in the 2D plan editor
  // → pro tier (hidden in Simple mode automatically).
  wallNumericEntry: {
    label: 'Numeric wall entry',
    description: 'Type an exact length + angle while drawing a wall (Enter to commit)',
    default: true,
    tier: 'pro',
  },
  // Radial/polar array: place N copies evenly around a circle (e.g. dining chairs
  // around a round table), each optionally rotated to face the centre. Pure code,
  // no external assets → prod-safe. An advanced placement/layout tool → pro tier.
  radialArray: {
    label: 'Radial array',
    description: 'Place N copies evenly around a circle (e.g. chairs around a round table)',
    default: true,
    tier: 'pro',
  },
  // Path/polyline array (PARITY-DUP-PATH, Coohom array tooling): place N copies of the
  // selected item along a drawn polyline by arc-length sampling, each optionally yawed to
  // face along the path tangent. Pure code, no external assets → prod-safe. An advanced
  // placement/layout tool → pro tier.
  pathArray: {
    label: 'Path array',
    description: 'Place N copies along a drawn polyline (e.g. chairs along an L-shaped counter)',
    default: true,
    tier: 'pro',
  },
  // IES photometric light profiles (PC-IES-LIGHT, Coohom parity): drive a real
  // luminaire beam shape (cone/penumbra/intensity from an LM-63 .ies candela
  // distribution) on a light fixture. Pure client-side code (parse + map), no
  // network/GPU dependency → prod-safe. An advanced lighting-design tool → pro
  // tier (hidden in Simple mode automatically).
  iesLights: {
    label: 'IES light profiles',
    description: 'Apply real luminaire photometric beam shapes (.ies) to light fixtures',
    default: true,
    tier: 'pro',
  },
  // Camera lens + depth-of-field controls (PC2-CAM-DOF-LENS): focal length,
  // aperture f-stop and focus distance for the render/snapshot camera — drives
  // the HQ path tracer's PhysicalCamera and the raster DoF pass on High/Maximum.
  // Pure client-side code (no external assets / sidecar) → prod-safe. An advanced
  // photographic control beyond the core view loop → pro tier (hidden in Simple
  // mode automatically).
  cameraDof: {
    label: 'Camera lens & depth of field',
    description: 'Focal length, aperture (f-stop) and focus controls for the render camera',
    default: true,
    tier: 'pro',
  },
  // Sun-driven procedural sky backdrop (RD-412, steps 1–5). An analytic Preetham
  // sky baked into the walk-mode `scene.background` equirect that tracks the sun
  // across the day (blue noon, warm low sun, dark night). Pure code, no external
  // assets → prod-safe (default on).
  // **Simple tier since WINDOW-SKY-DEFAULT (v0.31.5.92)**, and the tier change is
  // load-bearing rather than cosmetic: `backdrop` now DEFAULTS to `'sky'`, and a
  // pro-tier flag is forced off in Simple — which is the app default — so leaving
  // it pro would mean the default window view is a feature the default user can
  // never receive. That is the exact trap `src/scene/CLAUDE.md` records twice
  // (SKY-ANALYTIC-ORBIT's first attempt measured byte-identical for this reason):
  // anything that changes the DEFAULT look must not sit behind a pro-tier flag.
  // It is also not an analytical/professional tool — it is the view out of the
  // window, i.e. core realism, the same argument that keeps the orbit surround
  // dome ungated.
  proceduralSky: {
    label: 'Procedural sky',
    description: 'Sun-driven analytic sky as the walk-mode window view (tracks the time of day)',
    default: true,
    tier: 'simple',
  },
  // Import a Sweet Home 3D `.sh3d` plan (PARITY-SH3D). Pure client-side parse
  // (unzip + XML → our plan model), no sidecar / licensing → prod-safe (default
  // on). A plan-interop / authoring surface beyond the core furnish loop → pro
  // tier (hidden in Simple mode automatically).
  importSh3d: {
    label: 'Import Sweet Home 3D',
    description: 'Import a Sweet Home 3D (.sh3d) plan — walls, rooms and furniture',
    default: true,
    tier: 'pro',
  },
  // Import a Sweet Home 3D `.sh3f` furniture LIBRARY (PARITY-SH3F). Pure
  // client-side parse (unzip + Java-properties catalogs) + the existing upload
  // conversion path (OBJ/DAE/3DS/… → GLB via GLTFExporter), no sidecar /
  // licensing → prod-safe (default on). An import/interop surface beyond the
  // core furnish loop → pro tier (hidden in Simple mode automatically).
  importSh3f: {
    label: 'Import Sweet Home 3D library',
    description: 'Import a Sweet Home 3D (.sh3f) furniture library as user furniture',
    default: true,
    tier: 'pro',
  },
  // Smart rotation snap (PARITY-SNAP-ROTATE, Coohom parity): while rotating a
  // single item the gizmo also snaps to a nearby item's / wall's axis (parallel
  // or perpendicular) within a few degrees, else the existing 15° grid. Pure
  // angle math, no external assets → prod-safe (default on). An advanced
  // precision aid beyond the core furnish loop → pro tier (forced off in Simple,
  // where the familiar 15° snap is the only behaviour — so casual users are
  // unaffected). Shift still bypasses all snapping in both modes.
  smartRotateSnap: {
    label: 'Smart rotation snap',
    description: 'Snap a rotating item to a neighbouring item / wall axis (else the 15° grid)',
    default: true,
    tier: 'pro',
  },
  // Sticky "stamp" placement mode (PARITY-STAMP-PLACE, Floorplanner parity): arm a
  // catalog item, then click-place the same item over and over (chairs, downlights,
  // plants) without re-selecting it — each drop is one undo step and the mode stays
  // armed until Escape / Done / a different item. Pure client-side, reuses the
  // existing placement/ghost pipeline → prod-safe (default on). A power-user
  // productivity aid beyond the core single-add furnish loop → pro tier (hidden in
  // Simple mode, where each plain click commits once and disarms as before).
  stampPlace: {
    label: 'Stamp placement',
    description: 'Place the same catalog item repeatedly with one click each (no re-selecting)',
    default: true,
    tier: 'pro',
  },
  // Scatter-fill a room (PARITY-SCATTER-ROOM): evenly fill a room's free floor
  // with N collision-avoiding copies of the selected item on a packed grid
  // (deterministic, seeded). Pure code, no external assets → prod-safe (default
  // on). An advanced bulk-placement/layout tool beyond the core furnish loop →
  // pro tier (hidden in Simple mode automatically).
  scatterFill: {
    label: 'Scatter-fill room',
    description: 'Evenly fill a room with N collision-safe copies of the selected item',
    default: true,
    tier: 'pro',
  },
  // Mirror the whole plan region (walls + rooms + openings + furniture) about a
  // vertical axis — for mirror-image HDB stacks / condo pairs
  // (PARITY-PLAN-MIRROR-REGION). Pure geometry, no sidecar / licensing →
  // prod-safe (default on). An advanced authoring tool beyond the core furnish
  // loop → pro tier (hidden in Simple mode automatically).
  planMirrorRegion: {
    label: 'Mirror plan',
    description: 'Mirror the whole plan (walls, rooms, openings, furniture) about a vertical axis',
    default: true,
    tier: 'pro',
  },
  // Snap the whole plan to a grid (PARITY-GRID-SNAP, Sweet Home 3D / Coohom
  // parity): round every wall endpoint / room vertex / opening offset /
  // annotation coordinate to a chosen grid to clean up a traced or imported plan.
  // Pure geometry, no sidecar / licensing → prod-safe (default on). An advanced
  // authoring tool beyond the core furnish loop → pro tier (hidden in Simple mode
  // automatically).
  planGridSnap: {
    label: 'Snap plan to grid',
    description:
      'Round every wall / room / opening / annotation coordinate to a grid to tidy a plan',
    default: true,
    tier: 'pro',
  },
  // Inset / outset a room polygon by a signed distance (PARITY-ROOM-INSET, a
  // common Coohom / CAD "offset polygon" op): shrink for a dropped soffit / set-
  // down or grow for a setback. Pure geometry, no sidecar / licensing → prod-safe
  // (default on). An advanced authoring tool beyond the core furnish loop → pro
  // tier (hidden in Simple mode automatically).
  roomInset: {
    label: 'Inset room',
    description: 'Inset (shrink) or outset (grow) a room outline by a signed distance',
    default: true,
    tier: 'pro',
  },
  // Manual room ordering for the per-room editor switcher (the list is
  // alphabetical by default). A lightweight organisational convenience useful to
  // any user → simple tier (shown in both modes). Pure per-device preference
  // data (editorPrefs) → prod-safe.
  roomReorder: {
    label: 'Reorder rooms',
    description: 'Manually reorder the room list (defaults to A–Z)',
    default: true,
    tier: 'simple',
  },
  // Per-element colour overrides in the 2D plan inspector (CUSTOMIZE-COLOUR): a
  // per-wall paint colour (overriding the plan-wide wall colour), a door-leaf
  // colour, and a window glass tint. Pure colour data on the plan model, rendered
  // by PlanShell / PlanDoorLeaf → prod-safe. A core part of making every surface
  // customizable, useful to a casual user → simple tier (shown in both modes).
  elementColors: {
    label: 'Element colours',
    description: 'Recolour individual walls, doors and window glass in the plan editor',
    default: true,
    tier: 'simple',
  },
  // Door / window style picker (CUSTOMIZE-STYLE): panel/flush/glazed doors and
  // plain/grille/louvre windows, chosen per opening in the plan inspector. Pure
  // procedural geometry rendered by PlanDoorLeaf / PlanShell → prod-safe. Part of
  // making every fitting customizable, useful to a casual user → simple tier.
  openingStyles: {
    label: 'Door & window styles',
    description: 'Choose a door style (panel / flush / glazed) and window style (grille / louvre)',
    default: true,
    tier: 'simple',
  },
  // Per-item opacity / hide (CUSTOMIZE-OPACITY): make a placed piece
  // semi-transparent (ghost it to see behind) or hide it in 3D, from the
  // inspector. Pure render-side (per-item material clones) → prod-safe. An
  // advanced view aid beyond the core furnish loop → pro tier.
  itemOpacity: {
    label: 'Item opacity & hide',
    description: 'Make a placed item semi-transparent or hide it in the 3D view',
    default: true,
    tier: 'pro',
  },
  // Tiled-floor repetition break-up (RD-406 / MAT-006a): a large tiled floor
  // gets a pure per-tile-cell UV hash-rotation (90°/180°/270°) + sub-tile offset
  // so adjacent tiles stop aligning into the "obvious grid" tell — pure UV math,
  // no shader / extra texture / 2nd UV set. Prod-safe pure code (default on). An
  // advanced realism refinement beyond the core finish loop → pro tier (forced
  // off in Simple, where the plain world-UV plane is byte-identical to before).
  tileBreakup: {
    label: 'Tile repetition break-up',
    description: 'Rotate / offset each floor tile so a large tiled floor stops visibly repeating',
    default: true,
    tier: 'pro',
  },
  // Object-space box projection for parametric furniture UVs (MAT-006c). The
  // default BoxGeometry UVs run 0..1 per face whatever the face measures, so a
  // tiled finish scaled with the PART (a tabletop and a leg showing the same
  // number of tiles) and its grain followed each face's own axes rather than the
  // part's length. `materials/boxUv.ts` re-projects each slab from its own
  // geometry in metres, U on the longer face axis. Pure geometry, prod-safe, no
  // GPU cost — and a CORRECTNESS fix rather than an advanced dial, so it is
  // simple tier: Simple mode must not be left with mis-scaled grain.
  furnitureBoxUv: {
    label: 'Furniture texture alignment',
    description: 'Scale and orient furniture wood grain from the part, not the face',
    default: true,
    tier: 'simple',
  },
  // Parallax-occlusion mapping on hero grout-relief floors (PHOTO-POM): the
  // procedural tile / hexagon / subway / checker / brick / parquet / herringbone
  // patterns already bake a height field to derive their normals; POM ray-marches
  // that same height in the fragment shader so grout/joints genuinely RECESS and
  // occlude as the camera moves (a step up from the flat normal-map fake). The
  // ray-march costs GPU, so it is additionally gated to High/Max tiers at runtime
  // (`pomStepsForTier` → Performance/Medium are byte-identical, no POM). Pure
  // procedural height, no licensed art → prod-safe (default on). Advanced GPU
  // realism beyond the core loop → pro tier (forced off in Simple).
  pomFloors: {
    label: 'Parallax floor relief',
    description: 'Ray-marched recessed grout/joints on tile, brick and parquet floors (High/Max)',
    default: true,
    tier: 'pro',
  },
  // Dismissible, localStorage-persisted first-run hint banners for the room
  // editor / floor-plan editor / walk mode (P25). Pure UI, prod-safe. Aids
  // beginners in the default experience → simple tier (shown in both modes).
  infoCallouts: {
    label: 'Info callouts',
    description: 'Dismissible hint banners in the room, floor-plan and walk screens',
    default: true,
    tier: 'simple',
  },
  // Getting-started checklist card (UIUX-28, Watermelon onboarding-checklist
  // pattern): the five core-loop actions (furnish, finish, light, walk, share)
  // with goal-gradient progress, auto-checked as the user does each for the
  // first time; dismissible, per-device persisted. Beginner aid in the default
  // experience → simple tier, prod-safe pure UI.
  onboardChecklist: {
    label: 'Getting-started checklist',
    description: 'First-session checklist of the core design loop with progress',
    default: true,
    tier: 'simple',
  },
  // Pulsing "New" dot on recently-shipped toolbar/menu entries, dismissed on
  // first use, persisted per-flag (P27). Pure UI, prod-safe. Discoverability
  // polish for all users (badges both simple- and pro-tier entries) → simple tier.
  newBadges: {
    label: 'New feature badges',
    description: 'Pulsing dot marking newly-shipped features until first use',
    default: true,
    tier: 'simple',
  },
  // Comfortable/compact row density via [data-density] over --row-pad-*
  // tokens (P38). Advanced layout control → pro tier (hidden in Simple).
  // Prod-safe, pure CSS + a persisted per-device pref.
  densityMode: {
    label: 'Density mode',
    description: 'Comfortable/compact row spacing',
    default: true,
    tier: 'pro',
  },
  // A single Simple-mode hint (in the ⌘K footer) that Pro tools exist, pointing
  // to the Simple↔Pro toggle (P26). Must show IN Simple → simple tier; the
  // component itself renders null in Pro. Prod-safe, pure UI.
  proUpsell: {
    label: 'Pro upsell hint',
    description: 'A ⌘K hint (Simple mode) that Pro tools exist',
    default: true,
    tier: 'simple',
  },
  // Decorative, GPU-tier- + reduced-motion-gated ambient effects: a border-beam
  // on the in-progress HQ-render card + a mouse-follow radial gradient on
  // catalog/preset cards (P7). simple tier (polish for all users); the real GPU
  // guard is runtime — useAmbientFx() renders nothing under the default
  // Performance tier or reduced-motion, so it's dormant by default. Prod-safe.
  ambientFx: {
    label: 'Ambient effects',
    description: 'Subtle motion accents on higher render tiers',
    default: true,
    tier: 'simple',
  },
  // Motion toggle for animated furniture (ceiling / standing fan blades). A
  // scene-viewing convenience (pause the spinning for a still look, or to save
  // battery), so simple tier + on by default; drives the `motionEnabled` store
  // pref, gated in each fan primitive.
  furnitureMotion: {
    label: 'Furniture motion',
    description: 'Animate moving furniture like ceiling-fan blades',
    default: true,
    tier: 'simple',
  },
  // User accounts + cloud sync (Cloudflare backend). Sign in with an email +
  // password (accounts are admin-created — there is no public signup) to save
  // designs and favourites to the cloud and sync them across devices. Gated by
  // the backend being present (`hasBackend()`): the GitHub Pages / offline build
  // leaves it inert. A casual-user convenience that belongs in the core loop →
  // simple tier (shown in both modes). Default on; the flag is harmless without a
  // backend (the login UI checks `authIsBackend`).
  accounts: {
    label: 'Accounts & cloud sync',
    description: 'Sign in to save designs + favourites to the cloud (accounts are admin-created)',
    default: true,
    tier: 'simple',
  },
  // Shared, read-only asset library served from R2 through the auth-gated API.
  // Lets a signed-in **admin** browse the curated furniture library in production
  // (the prod counterpart to the dev-only IKEA scrape). Simple tier so it shows in
  // both modes — the real gate is the admin role (checked at the bootstrap/merge
  // call sites via `isAdminUser`), not the Simple/Pro toggle.
  sharedLibrary: {
    label: 'Shared asset library',
    description: 'Browse the cloud furniture library (admin accounts, served from R2)',
    default: true,
    tier: 'simple',
  },
  // ambientCG CC0 material library mirrored into our own R2 bucket (`acg/`)
  // and served over the same-origin `/api/assets` proxy. Since v0.29.4.0 this
  // is the ONLY ambientCG transport (the live ambientcg.com provider is gone),
  // so the flag now decides whether ambientCG appears at all rather than which
  // transport serves it. Prod-safe (CC0, same-origin, no proxy to operate) and
  // NOT `devOnly`. `pro` because a 1000-plus scan grid is pack-browser
  // territory — Simple keeps the curated finish strip.
  ambientcgLibrary: {
    label: 'ambientCG material library',
    description: 'Browse the CC0 ambientCG PBR material library (served from R2)',
    default: true,
    tier: 'pro',
  },
  // Click-to-place furniture straight onto the 2D floor plan (PLAN-FURNISH
  // Phase 1): arm a catalog def, an SVG ghost previews the drop with
  // green/red `canPlace` validity, a click commits via the existing
  // `addItem`/`beginDrop`/`pendingEdit` path. Reuses the same placement
  // pipeline as the 3D catalog (no new collision/commit code, no relaxation
  // of `canEditScene`) — pure client-side, prod-safe. An advanced
  // plan-authoring surface beyond the core furnish-in-3D loop → pro tier
  // (hidden in Simple, where furnishing stays the 3D catalog-drag flow).
  planFurnish: {
    label: 'Furnish in plan',
    description: 'Add furniture directly on the 2D floor plan',
    default: true,
    tier: 'pro',
  },
  // Frame / zoom-to-selection camera (FEAT-A) — dolly + retarget the orbit
  // camera so the current selection's bounds fill the view, keyed to Z (bare
  // "F" is already `flip` in the same orbit+selection context — see
  // `controls/keybindings.ts`) + a NavCluster button. Pure camera-only math,
  // no mutation, no licensed asset — a universal 3D-tool navigation
  // convenience (SketchUp/Blender/Figma "zoom to selection") that belongs in
  // the core design loop → simple tier, present in both modes.
  frameSelection: {
    label: 'Frame selection',
    description: 'Dolly the camera to fit the selected item(s) (Z)',
    default: true,
    tier: 'simple',
  },
  // Alt/Option-drag duplicate (FEAT-B, SketchUp/Figma/Coohom parity): starting a
  // drag on an already-selected item while holding Alt/Option clones it and
  // drags the copy, leaving the original in place — the fastest way to lay out
  // repeated pieces (dining chairs, a row of cabinets) short of the array tools.
  // Pure code, no external assets → prod-safe. A power-user shortcut on top of
  // the existing Duplicate button/⌘D → pro tier (hidden in Simple mode, where
  // the core loop's own catalog-drag + Duplicate action stay the only ways in).
  altDragDuplicate: {
    label: 'Alt-drag duplicate',
    description: 'Alt/Option-drag a selected item to duplicate it and drag the copy',
    default: true,
    tier: 'pro',
  },
  // Isolate / solo the selection (FEAT-C): one-tap focus mode that dims every
  // OTHER placed item so the selected piece(s) stand out in a dense furnished
  // HDB (Blender local-view / SketchUp isolate parity). Session-only state
  // (`isolateSlice.isolateActive`, not persisted) — purely a render-time
  // opacity override, no item props are touched. Auto-clears on any selection
  // change (including the room-editor exit, which itself clears selection).
  // An advanced 3D-editor viewing aid beyond the core furnish loop → pro tier.
  isolateSelection: {
    label: 'Isolate selection',
    description: 'Dim everything except the selected item(s) to focus on one piece',
    default: true,
    tier: 'pro',
  },
  // Mirror the selection across a chosen room axis (X = left↔right, Z =
  // front↔back), reflecting position + heading and toggling flipX/flipZ so an
  // asymmetric group (an L-sofa + chaise) reads as its true mirror image — a
  // rigid group reflection about the selection's own centroid, all-or-nothing
  // collision-checked (FEAT-2). The pre-existing left↔right-only "Mirror"
  // action (X axis) stays ungated as a core align/distribute op; this flag
  // gates the newer explicit axis picker (adds the Z option) as the more
  // advanced control. An arrange-tool refinement, not core-loop → pro tier.
  mirrorSelection: {
    label: 'Mirror across axis',
    description: 'Mirror the selection across a chosen room axis (X or Z)',
    default: true,
    tier: 'pro',
  },
  // Two-point-perspective / vertical-line-lock orbit camera (FEAT-D): levels
  // the camera's pitch + applies a vertical projection-matrix lens-shift
  // (`scene/cameras/verticalLock.ts`, pure + unit-tested) so wall corners and
  // door frames stay parallel instead of converging when the view is pitched
  // — the D5 Render/Enscape "keep verticals vertical" toggle (REFERENCES.md),
  // an architectural-photo quality lever for shareable HDB hero shots. Pure
  // client-side camera/projection math, no external assets → prod-safe. An
  // advanced photographic control beyond the core view loop → pro tier
  // (hidden in Simple mode automatically).
  twoPointPerspective: {
    label: 'Two-point perspective',
    description: 'Keep vertical building lines parallel when the camera is pitched',
    default: true,
    tier: 'pro',
  },
  // Parallel-projection / orthographic "dollhouse" view (R3-FEAT-3): swaps the
  // whole-flat orbit camera between a perspective and an orthographic
  // (isometric-style) projection so parallel building lines stay parallel and
  // there is no foreshortening — the SketchUp / Sweet Home 3D / Planner 5D
  // "Parallel projection" toggle (REFERENCES.md). The camera swap
  // (`scene/cameras/OrbitCamera.tsx` + the pure `orthoProjection.ts` scale
  // bridge) preserves the live viewpoint on toggle, and OrbitControls drives the
  // ortho `zoom` so pinch/wheel zoom still work. Pure client-side camera math, no
  // external assets → prod-safe. A pro-tier viewing lever beyond the core loop
  // (hidden in Simple mode automatically).
  parallelProjection: {
    label: 'Parallel projection',
    description: 'Orthographic (isometric) dollhouse view — parallel lines stay parallel',
    default: true,
    tier: 'pro',
  },
  // Drag-to-resize the docked catalog rail on desktop/wide screens (a col-resize
  // handle on its right edge; width persisted per-device). A core-loop UX
  // convenience available to everyone → simple tier. Mobile keeps the bottom
  // sheet (the handle isn't rendered there).
  catalogResize: {
    label: 'Resizable catalog',
    description: 'Drag the catalog panel edge to resize it (desktop)',
    default: true,
    tier: 'simple',
  },
  // Catalog filter control (availability / source / favourites) over the
  // furniture grid. Pure client-side filtering of the already-merged grid items
  // → prod-safe, no network / assets. A browse convenience in the core furnish
  // loop that helps a casual user narrow a large catalog → simple tier (shown in
  // both modes). Filter state is component-local + ephemeral (not persisted).
  catalogFilters: {
    label: 'Catalog filters',
    description: 'Filter the catalog by availability, source and favourites',
    default: true,
    tier: 'simple',
  },
  // 3D asset designer (GLB designer / Asset Studio). Compose a custom furniture
  // asset from primitive shapes (+ CSG combine, per-part finishes) and/or start
  // from an uploaded GLB, then save it into the catalog through the same
  // export/persist pipeline as an upload. Pure client-side geometry + the
  // existing GLB export path (no sidecar / licensing) → prod-safe, default on.
  // A power authoring tool that needs the full-screen canvas → pro tier
  // (forced off in Simple mode, keeping the casual UI minimal — the ⌘K command,
  // the catalog "Design" button and the dialog itself all gate on it).
  glbDesigner: {
    label: '3D asset designer',
    description: 'Compose or edit a custom 3D furniture asset from shapes and/or an uploaded GLB',
    default: true,
    tier: 'pro',
  },
  // Asset Studio Stage 3d — export a designed piece as a configurable product
  // family (mark part groups as variant slots → a slot-based product). Rides the
  // existing pure-code configurator (baked GLB options), prod-safe, but a power
  // authoring surface inside the designer → pro tier (forced off in Simple).
  assetConfigurableExport: {
    label: 'Save as configurable product',
    description: 'Turn a designed asset into a customizable product family (variant slots)',
    default: true,
    tier: 'pro',
  },
  // Asset Studio Stage 3d — save a multi-piece design as a "set" (each top-level
  // group becomes its own catalog asset, plus the whole as one). Pure code,
  // prod-safe; a designer authoring convenience → pro tier.
  assetSets: {
    label: 'Save groups as separate assets',
    description: 'Split a multi-piece design so each group also saves as its own asset',
    default: true,
    tier: 'pro',
  },
  // "Suggest views" (SAVED-VIEWS-SUGGEST) — auto-computes a starter set of saved
  // camera views (a corner three-quarter angle per major furnished room + one
  // whole-flat overview) so the saved-views-consuming presentation family
  // (Present…, Cinematic tour, Record walkthrough, Render all views, Day→night
  // clip) has content without the user hand-authoring every bookmark. Pure
  // client-side geometry over the existing plan/items state (`scene/cameras/
  // suggestViews.ts`), prod-safe. Feeds the pro presentation family → pro tier,
  // matching `presentation`/`batchRender` above.
  suggestedViews: {
    label: 'Suggest views',
    description: 'Auto-generate a starter set of saved camera views (per room + an overview)',
    default: true,
    tier: 'pro',
  },
  profiler: {
    label: 'Profiler',
    description: 'Dev-only detached-window performance profiler (live metrics + cost breakdown)',
    default: true,
    devOnly: true,
    tier: 'pro',
  },
  // Native share sheet for the hero card (UX round-3 #1): on devices supporting
  // the Web Share API Level 2 file-sharing (`navigator.canShare({ files })`),
  // sharing the rendered hero-card PNG goes through `navigator.share({ files })`
  // so mobile users get the OS share sheet (WhatsApp/Telegram/IG) instead of only
  // a silent download. Pure client-side API, no sidecar → prod-safe; extends the
  // core "share" stage of the loop → simple tier. The existing download stays as
  // the fallback (unsupported/failed) and remains available alongside it.
  shareCardNative: {
    label: 'Native share sheet',
    description: 'Share the hero card via the OS share sheet on supported devices',
    default: true,
    tier: 'simple',
  },
  // Per-instance notes & link (ITEM-META, 2026-07-18): an optional custom URL
  // (product page/spec sheet), description, and special remarks ("existing —
  // retain", "client to purchase", install notes) on EVERY placed item. Feeds
  // personal annotation + the contractor handover FF&E schedule/spec book — a
  // documentation/handover surface, not part of the core furnish/finish/view/
  // share loop → pro tier (forced off in Simple). Pure text fields, no
  // sidecar/licensing dependency → prod-safe.
  itemMeta: {
    label: 'Item notes & link',
    description: 'Custom URL, description and remarks per placed item (for handover docs)',
    default: true,
    tier: 'pro',
  },
  // First-class MEP layer (G1): persisted, editable electrical/plumbing points
  // (the 'mep' Tool, MepLayer, PlanInspector case and Suggest land in later
  // PRs — this flag is the single gate for all of it). Pure geometry + no
  // sidecar/licensing → prod-safe; an analytical contractor-handover authoring
  // surface beyond the core furnish loop → pro tier (hidden in Simple).
  mepEditor: {
    label: 'MEP point editor',
    description: 'Place and edit persisted electrical/plumbing points on the 2D plan',
    default: true,
    tier: 'pro',
  },
  // Lighting & switching schematic (BSJ-3): link each switch point to the light
  // fixtures it controls (one/two-way) and emit the circuit tags + legend an
  // electrician wires from, on the electrical plan sheet + DXF. Analytical
  // handover content → pro tier, like the MEP editor it builds on.
  switchCircuits: {
    label: 'Switching schematic',
    description:
      'Link switches to the lights they control; circuit tags + legend on the electrical plan',
    default: true,
    tier: 'pro',
  },
  // Setting-out & datum dimensioning (TODO G3 — SG contractor handover): a
  // datum marker + running face dimensions from it on the dimensioned-plan
  // sheet, plus tile setting-out start-point crosses on the floor-plan sheet.
  // Analytical drawing-set content → pro tier, like the sheet it extends.
  settingOutDims: {
    label: 'Setting-out dimensions',
    description: 'Datum-referenced setting-out dimensions + tile start points on the drawing set',
    default: true,
    tier: 'pro',
  },
  // Lamp-specification checks (v0.31.5.297): a wet-room ingress-protection
  // advisory (bathroom zones 1-2 need IP44; every shipped emitter is IP20) and
  // a colour-temperature-vs-room-use advisory (3000 K warm in a task space).
  // The first is a COMPLIANCE matter, not a style preference, which is why it
  // belongs in the Checks panel rather than a report footnote. Pure code over
  // the emitter registry's newly authored `cct`/`ip` — no asset dependency.
  // Analytical → pro tier, like the other Checks groups.
  lampSpecChecks: {
    label: 'Lamp specification checks',
    description: 'Wet-room IP rating + colour-temperature advisories for placed light fixtures',
    default: true,
    tier: 'pro',
  },
  // Tiling layout plan (G5 follow-up): the tile grid DRAWN in position per
  // room, with the setting-out origin marked and the perimeter cuts tinted.
  // `tileCoursing.ts` already computed all of it and the set printed it as a
  // table — but transferring "origin 137/212 mm, 9x6 full tiles" from a column
  // onto a slab is the step where tiling rework happens, and a drawing removes
  // it. Analytical drawing-set content → pro tier, like the sheet flags around
  // it. Pure code over existing data, no asset dependency → prod-safe.
  tileLayoutSheet: {
    label: 'Tiling layout plan',
    description:
      'Per-room tile grid, setting-out origin and perimeter cuts drawn on the drawing set',
    default: true,
    tier: 'pro',
  },
  // Carpentry/joinery elevations + sections (TODO G8 — the single most-cited
  // DIY handover gap): a dimensioned front elevation + one section per
  // distinct placed parametric piece, at a finer locked scale. Analytical
  // drawing-set content → pro tier, like the sheet flags above it.
  carpentrySheets: {
    label: 'Carpentry sheets',
    description: 'Dimensioned elevation + section per placed custom-size piece on the drawing set',
    default: true,
    tier: 'pro',
  },
  // Reflected ceiling plan (TODO H4 — SG contractor handover, canonical
  // drawing #4): per-room false-ceiling/bulkhead zones with drop heights,
  // ceiling-fixture positions dimensioned off the nearest walls, aircon
  // points marked. Pure code, reuses the existing ceiling-geometry engine +
  // lighting/electrical data — no new asset dependency, prod-safe. Analytical
  // drawing-set content → pro tier, matching `settingOutDims`/`carpentrySheets`
  // (the other sheet-level flags added for this same handover goal).
  rcpSheet: {
    label: 'Reflected ceiling plan',
    description:
      'False-ceiling zones, ceiling-fixture dimensions, and aircon points on the drawing set',
    default: true,
    tier: 'pro',
  },
  // Per-trade handover packs (blank-slate BSJ-5, the designed→ordered bridge):
  // re-bundles the EXISTING drawing-set sheets/schedules into per-recipient
  // packs (Tiler / Electrician / Plumber / Carpenter / Aircon / Curtains /
  // Painter) — each a pack cover + the master sheets that recipient needs,
  // reusing the master set's sheet numbering. Pure client-side composition over
  // sheets the app already builds → prod-safe; an analytical handover surface
  // → pro tier, matching the drawing-set sheet flags above it.
  tradePacks: {
    label: 'Trade handover packs',
    description:
      'Per-recipient bundles (tiler / electrician / carpenter / aircon / …) of the drawing set',
    default: true,
    tier: 'pro',
  },
  // Waterproofing-zone model (blank-slate BSJ-7): turns the wet-area
  // waterproofing ADVISORY into a modeled zone per wet room (floor extent + wall
  // upturn heights — 300 mm general, 1800 mm at shower walls) that feeds a
  // diagonal wet-area hatch + a per-room zone table on the dimensioned plan, the
  // tiler handover pack, and a waterproofing budget sub-line. Pure client-side
  // over data the app already holds → prod-safe; an analytical/contractor
  // surface → pro tier, matching the drawing-set sheet flags above it.
  waterproofing: {
    label: 'Waterproofing zones',
    description: 'Wet-area membrane extent + wall upturn on the plan, tiler pack, and budget',
    default: true,
    tier: 'pro',
  },
  // Floor build-up / levels & transitions (blank-slate BSJ-8): a per-room
  // finished-floor-level offset (`PlanRoom.floorLevelMm`) surfaced as FFL tags +
  // doorway step/transition markers on the dimensioned/setting-out plan + tiler
  // pack, a kerb/step advisory, and a floor-level field in the room inspector.
  // Also gates the real 3D representation (v0.24.0.2, `floorLevels3d.ts`: floor +
  // skirting + plinth offset, furniture re-seat, doorway risers, walk-mode
  // height). Pure client → prod-safe; an analytical/contractor surface → pro.
  floorLevels: {
    label: 'Floor levels & transitions',
    description: 'Per-room FFL offsets, doorway step markers, and a kerb/step advisory',
    default: true,
    tier: 'pro',
  },
  // Parametric staircase generator (TODO — UX research round 3, Homestyler v6
  // precedent): the adjustable `staircase` catalog item (straight / L / U /
  // spiral, width/rise-run/landing/handrail) that also feeds the multi-storey
  // stair-connectivity advisory. A structural authoring tool for multi-level
  // plans (Maisonette / loft / terrace) rather than the casual furnish loop →
  // pro tier, hidden in Simple mode. Pure procedural geometry, no external
  // asset → prod-safe. When off, the Staircase card is hidden from the catalog.
  parametricStairs: {
    label: 'Parametric staircase',
    description: 'Adjustable staircase (straight / L / U / spiral) for multi-level plans',
    default: true,
    tier: 'pro',
  },
  // Parametric roof (TODO — UX research round 3, Homestyler v6 / Live Home 3D
  // precedent): a roof slab derived from the top storey's footprint + a pitch
  // (gable / hip / flat-parapet) with optional gable dormers, offered on
  // landed / multi-storey plans (Maisonette / Terrace) + opt-in user plans. A
  // structural authoring tool for whole-home shells rather than the casual
  // furnish loop → pro tier, hidden in Simple mode. Pure procedural geometry,
  // no external asset → prod-safe. When off, the Roof editor section + the 3D
  // roof are hidden.
  parametricRoof: {
    label: 'Parametric roof',
    description:
      'Pitched roof (gable / hip / flat-parapet) + dormers over landed / multi-storey plans',
    default: true,
    tier: 'pro',
  },
  // Per-room aircon cooling-load (BTU) advisory (UX research round 4 R4-1): a
  // per-room recommended cooling capacity from floor area × the SG rule-of-thumb
  // BTU/m², with west/east-facing, high-ceiling and open-kitchen modifiers, plus
  // a whole-flat total. Pure formula over existing area + orientation state,
  // shaped like the daylight check → an analytical advisory, pro tier (alongside
  // `daylight`/`designScore`/`accessibility`). Pure client code → prod-safe.
  airconSizing: {
    label: 'Aircon BTU sizing',
    description: 'Per-room cooling-load (BTU) recommendation + whole-flat total',
    default: true,
    tier: 'pro',
  },
  // Aircon SYSTEM planner (blank-slate BSJ-2): groups the per-room BTU sizing
  // into System-2/3/4 condenser proposals (which rooms share a condenser, load
  // %, over-provisioning cap, HDB ledge-weight check) and places FCUs + the
  // condenser(s) on the ledge. Pure client-side over data the app already
  // computes → prod-safe; an analytical/professional planning surface → pro
  // tier (rides alongside `airconSizing` in the Cooling-load section).
  airconSystem: {
    label: 'Aircon system planner',
    description: 'Group rooms into System-2/3/4 condensers + place FCUs and the outdoor unit',
    default: true,
    tier: 'pro',
  },
  // 3D refrigerant-trunking route visualization (BSJ-2 follow-up): routes an
  // orthogonal polyline from each FCU to its condenser through door openings
  // at ceiling height (`analysis/airconTrunking.ts`), rendered as a thin
  // ducted-trunking run in the orbit scene, marked on the RCP sheet, and
  // feeding a real pipe-length quantity into the aircon budget line. Rides
  // alongside `airconSystem` in the same Cooling-load section — same
  // pure-client-over-existing-data shape → prod-safe; an analytical/
  // professional planning surface → pro tier.
  airconTrunking: {
    label: 'Aircon trunking route',
    description: 'Modeled refrigerant-trunking route from each FCU to its condenser',
    default: true,
    tier: 'pro',
  },
  // False-ceiling clearance validator (UX research round 4 R4-2): warns when a
  // dropped/cove ceiling zone leaves under the SG comfort/statutory finished
  // clearance (≥2.4 m under a dropped ceiling; 2.6 m standard slab), and reports
  // remaining headroom per zone. Pure rule over the existing ceiling model → an
  // analytical check, pro tier (alongside the other checks). Prod-safe pure code.
  ceilingClearance: {
    label: 'Ceiling clearance check',
    description: 'Warns when a false-ceiling zone leaves under 2.4 m finished headroom',
    default: true,
    tier: 'pro',
  },
  // Live hackability overlay in the 2D plan editor (UX research round 4 R4-7):
  // tints walls by their user-declared `PlanWall.structure` classification —
  // red (never hackable: load-bearing / RC), amber (permit required: brick /
  // partition), neutral (unclassified) — with a legend, plus an inline "NOT
  // PERMITTED" warning when deleting a load-bearing/RC wall. Surfaces the hack
  // rules at edit time (they previously reached only the demolition sheet). Pure
  // UX layer over existing data → prod-safe; pro tier (matches `wallStructure`).
  hackabilityOverlay: {
    label: 'Hackability overlay',
    description: 'Tint walls by demolition permit status live in the 2D plan editor',
    default: true,
    tier: 'pro',
  },
  // BTO Optional Component Scheme (OCS) starter state (UX research round 4 R4-3):
  // a "New BTO (with OCS)" starting point that pre-seeds the finishes + fittings
  // HDB actually hands a BTO owner who opted into OCS — internal door leaves,
  // vinyl (bedrooms) + polished-porcelain (living/dining) floor finishes, and
  // wall-mounted basin + mixer / shower set sanitary fittings in the baths — so
  // the owner designs from what they'll receive, not a blank shell. Pure data
  // manifest over existing finish + furnish state; a core onboarding/default-
  // state choice → SIMPLE tier, default on. Prod-safe pure code.
  // Refs: qanvast.com/sg/articles/hdb-optional-component-scheme-ocs-is-it-worth-opting-in-1873
  //       dollarsandsense.sg/complete-guide-hdbs-optional-components-scheme-ocs/
  // BSJ-4: gates the whole "Starting state" group in Smart Start — bare BTO,
  // BTO with OCS, resale as-is, and resale after strip-out. Keeps the historical
  // `ocsStarter` flag id (back-compat: existing overrides / saved flag maps still
  // resolve; no rename to migrate) now that it gates the broader intake family.
  ocsStarter: {
    label: 'Starting states',
    description:
      'Seed a real HDB/condo handover state: bare BTO, BTO+OCS, resale as-is, or strip-out',
    default: true,
    tier: 'simple',
  },
  // Floor-loading / raised-platform advisory (UX research round 4 R4-5): flags
  // placed heavy items (bathtub, aquarium, marble/stone tables, piano, loaded
  // bookcases) whose static weight density plausibly exceeds the HDB 150 kg/m²
  // imposed-load guideline, plus a raised-platform reminder (concrete raises
  // >50 mm need permits; use lightweight timber-joist platforms). A cited
  // advisory group in the Checks panel → analytical, pro tier. Prod-safe pure code.
  // Refs: homeanddecor.com.sg/design/renovation-guidelines-hdb-singapore/
  //       floorrich.com/an-easy-to-understand-guide-to-hdb-flooring-guidelines/
  floorLoading: {
    label: 'Floor-loading advisory',
    description: 'Flags heavy items vs the HDB 150 kg/m² slab-loading guideline',
    default: true,
    tier: 'pro',
  },
  // SG renovation-rules reference pack (UX research round 4 R4-6): one cited
  // reference panel bundling the wet-area 3-year tile-hacking rule, window &
  // grille compliance points, reno working-hours / noise limits, and the HDB
  // DRC permit / paperwork checklist. A static reference surface → pro tier.
  // Prod-safe pure code (rules as of 2026).
  // Refs: elementsid.com.sg/can-you-hack-hdb-walls/
  //       degrille.com.sg/article/are-invisible-grilles-approved-by-the-hdb/
  //       renovationcontractorsingapore.com/blogs/news/hdb-renovation-noise-rules-working-hours-2026
  //       propertyguru.com.sg/property-guides/hdb-renovation-permits-in-singapore-16702
  renoRulesPack: {
    label: 'SG renovation rules',
    description: 'Cited reference pack: tile rule, grilles, working hours, permits',
    default: true,
    tier: 'pro',
  },
}

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
