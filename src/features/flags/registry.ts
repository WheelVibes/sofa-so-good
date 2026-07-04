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
  smartStart: {
    label: 'Smart Start',
    description: 'One-click furnish wizard',
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
  hqRender: {
    label: 'HQ render',
    description: 'Progressive path-traced photoreal still (three-gpu-pathtracer)',
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
    description: 'Whole furnished scene → glTF/GLB (+ OBJ) for Blender / AR / Coohom',
    default: true,
    tier: 'simple',
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
  presentation: {
    label: 'Presentation mode',
    description: 'Full-screen saved-views slideshow with notes',
    default: true,
    tier: 'pro',
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
  // Minimap tap-to-teleport (MINIMAP-JUMP): click/tap a spot on the walk-mode
  // minimap to jump the walker there, clamped inside the tapped (or nearest)
  // room's walls. A navigation aid for the core walk loop, not an advanced
  // tool — biggest win on mobile where WASD/drag-walking across a whole flat
  // is slow (RoomSketcher/Coohom tour parity). Pure code, no external assets
  // → prod-safe; simple tier like its `walkScreens`/`walkLights` siblings.
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
  // Pick a colour/finish/variant on the browse card BEFORE placing it
  // (CATALOG-VARIANT, 2026-07-03 core-loop parity audit) — a compact quick-look
  // swatch popover (`ui/catalog/CatalogVariantPopover.tsx`), not inline card
  // swatches (mobile clutter). Reuses the existing variant/tint vocabulary
  // (IKEA `variants`, parametric colour fields) so the picked finish is carried
  // straight into placement as the item's initial props — no new persisted
  // schema. Pure client-side, no external assets → prod-safe. Matches IKEA
  // Kreativ/Coohom/Roomstyler's basic browse behaviour, not an analytical
  // refinement → simple tier, present in both modes.
  catalogVariantPick: {
    label: 'Pick finish before placing',
    description: 'Choose a colour/variant on the catalog card before it lands in the room',
    default: true,
    tier: 'simple',
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
  // Cheap baked wall/floor corner ambient-occlusion strips (RD-403). A shared
  // gradient texture + one transparent floor quad along each interior wall base —
  // pure fill-rate overdraw, no shadow map / SSAO — so corners read grounded on
  // the flat Performance tier (and Medium) where no post-processing AO exists.
  // The per-tier quality setting suppresses it on High+ (the post stack's SSAO
  // already darkens corners) to avoid double-darkening. Pure code, no external
  // assets → prod-safe. A core realism cue everyone sees → simple tier.
  cornerAo: {
    label: 'Corner shading',
    description: 'Soft baked ambient-occlusion darkening where walls meet the floor',
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
  // assets → prod-safe (default on). An advanced realism/atmosphere option beyond
  // the curated static photo backdrops → pro tier (hidden in Simple mode). The
  // IBL/lighting integration is deliberately out of scope here.
  proceduralSky: {
    label: 'Procedural sky',
    description: 'Sun-driven analytic sky as the walk-mode window view (tracks the time of day)',
    default: true,
    tier: 'pro',
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
  // Dismissible, localStorage-persisted first-run hint banners for the room
  // editor / floor-plan editor / walk mode (P25). Pure UI, prod-safe. Aids
  // beginners in the default experience → simple tier (shown in both modes).
  infoCallouts: {
    label: 'Info callouts',
    description: 'Dismissible hint banners in the room, floor-plan and walk screens',
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
}

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
