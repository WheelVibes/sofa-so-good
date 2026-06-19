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
  designerPicks: {
    label: 'Designer picks',
    description: 'Curated one-tap floor/wall finishes in the picker',
    default: true,
    tier: 'simple',
  },
  ceilingDesign: {
    label: 'Ceiling design',
    description: 'Per-room tray / coffered / dropped ceilings',
    default: true,
    tier: 'pro',
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
}

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
