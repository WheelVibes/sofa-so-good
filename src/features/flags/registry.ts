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
    tier: 'simple',
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
    default: true,
    tier: 'simple',
  },
  panoTour: {
    label: '360° tour',
    description: 'Linked multi-room panorama tour with clickable room-to-room hotspots',
    default: true,
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
  // Multi-axis furniture tilt (SweetHome3DJS parity): pitch/roll an item off
  // vertical (angle a picture, recline a backrest, bank a decor piece). Pure
  // code, no external assets → prod-safe. An advanced placement control beyond
  // the core furnish loop → pro tier.
  tiltFurniture: {
    label: 'Tilt furniture',
    description: 'Pitch / roll an item off vertical (angle art, recline, bank) in the inspector',
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
}

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
