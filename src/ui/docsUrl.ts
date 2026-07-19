import type { FeatureFlag } from '../features/featureFlags'

// The deployed user guide lives at <app base>/docs/. import.meta.env.BASE_URL
// is '/sofa-so-good/' in production and '/' in dev, so this resolves to
// '/sofa-so-good/docs/' on Pages without hardcoding the host or project path.
export const DOCS_URL = `${import.meta.env.BASE_URL}docs/`

/** Open the user guide home in a new tab. */
export function openDocs() {
  window.open(DOCS_URL, '_blank', 'noopener,noreferrer')
}

/**
 * Contextual "open the docs for this tool" deep-linking (DOCS-DEEPLINK).
 *
 * A `DocKey` is usually a `FeatureFlag` (so it composes with the command-palette
 * flag map + the action registry), plus a few non-flag keys for tools that have
 * no flag (floor-plan drawing tools, camera modes, the catalog…). The guide is a
 * VitePress site with `cleanUrls: true`, so a page lives at `${DOCS_URL}<slug>`
 * and a section appends `#<anchor>`. Slugs + anchors below are the REAL generated
 * heading ids (grepped from the built `dist/docs/<slug>.html`), so they don't 404
 * — see `docsUrl.test.ts` for the page-slug guard.
 */
type NonFlagDocKey =
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'split'
  | 'dimension'
  | 'polyroom'
  | 'autoroom'
  | 'catalog'
  | 'walk'
  | 'orbit'
  | 'time'
  | 'theme'
  | 'glbDesigner'
  | 'importTextures'
  | 'renoRules'
  | 'handover'

export type DocKey = FeatureFlag | NonFlagDocKey

interface DocEntry {
  /** Page slug = the md filename without extension (one of the 19 guide pages). */
  page: string
  /** Heading anchor (the generated `id`), or omitted to link to the page top. */
  anchor?: string
}

/** The 19 user-guide page slugs (used by the test's integrity guard). */
export const DOC_PAGES = [
  'index',
  'getting-started',
  'navigating',
  'placing-furniture',
  'pet-fittings',
  'finishes-and-materials',
  'lighting-and-time',
  'themes-and-appearance',
  'importing-models',
  'importing-textures',
  'floor-plan-editor',
  'room-editor',
  'walkthrough-and-sun-study',
  'design-tools',
  'exporting',
  'style-and-ai',
  'accounts-and-sync',
  'keyboard-shortcuts',
  'tips-and-faq',
] as const

export const FEATURE_DOCS: Partial<Record<DocKey, DocEntry>> = {
  // ── design-tools page ───────────────────────────────────────────────────
  smartStart: { page: 'design-tools', anchor: 'smart-start' },
  budget: { page: 'design-tools', anchor: 'budget-shopping-list' },
  shopExport: { page: 'design-tools', anchor: 'budget-shopping-list' },
  boq: { page: 'design-tools', anchor: 'budget-shopping-list' },
  clearanceChecks: { page: 'design-tools', anchor: 'clearance-fit-checks' },
  designScore: { page: 'design-tools', anchor: 'design-score' },
  suggestions: { page: 'design-tools', anchor: 'design-score' },
  accessibility: { page: 'design-tools', anchor: 'accessibility' },
  drawings: { page: 'design-tools', anchor: 'drawings-—-elevations-lighting-plan' },
  electricalPlan: { page: 'design-tools', anchor: 'drawings-—-elevations-lighting-plan' },
  plumbingPlan: { page: 'design-tools', anchor: 'drawings-—-elevations-lighting-plan' },
  drawingCallouts: { page: 'design-tools', anchor: 'drawings-—-elevations-lighting-plan' },
  measure: { page: 'design-tools', anchor: 'measure' },
  daylight: { page: 'design-tools', anchor: 'design-score' },
  renoRules: { page: 'design-tools', anchor: 'sg-renovation-rules' },
  handover: { page: 'design-tools', anchor: 'handover-dlp-dates' },
  comments: { page: 'design-tools', anchor: 'comments-pro' },
  history: { page: 'design-tools', anchor: 'history' },
  versions: { page: 'design-tools', anchor: 'versions-share-report' },
  shareExport: { page: 'design-tools', anchor: 'versions-share-report' },
  report: { page: 'design-tools', anchor: 'versions-share-report' },
  panorama: { page: 'design-tools', anchor: '_360°-panorama-pro' },
  panoTour: { page: 'design-tools', anchor: '_360°-tour-pro' },
  renderCompare: { page: 'design-tools', anchor: 'render-compare-pro' },
  timeCompare: { page: 'design-tools', anchor: 'time-of-day-compare-pro' },

  // ── floor-plan-editor page ──────────────────────────────────────────────
  floorPlanEditor: { page: 'floor-plan-editor' },
  planScale: { page: 'floor-plan-editor', anchor: 'scale-the-whole-plan-pro' },
  planGridSnap: { page: 'floor-plan-editor', anchor: 'snap-the-plan-to-a-grid-pro' },
  planPolyline: { page: 'floor-plan-editor', anchor: 'annotations-markup' },
  wall: { page: 'floor-plan-editor', anchor: 'drawing' },
  room: { page: 'floor-plan-editor', anchor: 'drawing' },
  door: { page: 'floor-plan-editor', anchor: 'drawing' },
  window: { page: 'floor-plan-editor', anchor: 'drawing' },
  split: { page: 'floor-plan-editor', anchor: 'drawing' },
  dimension: { page: 'floor-plan-editor', anchor: 'annotations-markup' },
  polyroom: { page: 'floor-plan-editor', anchor: 'non‐rectangular-rooms-l‐shapes-angles' },
  autoroom: { page: 'floor-plan-editor', anchor: 'non‐rectangular-rooms-l‐shapes-angles' },

  // ── navigating / walkthrough ────────────────────────────────────────────
  savedViews: { page: 'navigating', anchor: 'saved-views-presentation-pro' },
  presentation: { page: 'navigating', anchor: 'saved-views-presentation-pro' },
  orbit: { page: 'navigating', anchor: 'orbit-view' },
  walk: { page: 'walkthrough-and-sun-study', anchor: 'walk-mode' },
  walkthrough: { page: 'walkthrough-and-sun-study', anchor: 'auto-walkthrough-tour' },
  sunStudy: { page: 'walkthrough-and-sun-study', anchor: 'sun-study' },

  // ── finishes & materials ────────────────────────────────────────────────
  materialComposer: {
    page: 'finishes-and-materials',
    anchor: 'repaint-a-wall-or-refinish-the-floor',
  },
  finishDnd: { page: 'finishes-and-materials', anchor: 'drag-a-swatch-to-apply-desktop' },
  remoteMaterials: { page: 'finishes-and-materials', anchor: 'browse-the-online-library' },
  designerPicks: { page: 'finishes-and-materials', anchor: 'repaint-a-wall-or-refinish-the-floor' },

  // ── lighting / themes ───────────────────────────────────────────────────
  renderPresets: { page: 'lighting-and-time', anchor: 'render-presets' },
  time: { page: 'lighting-and-time', anchor: 'changing-the-time' },
  theme: { page: 'themes-and-appearance', anchor: 'themes' },

  // ── placing furniture ───────────────────────────────────────────────────
  catalog: { page: 'placing-furniture', anchor: 'the-catalog' },
  replaceSimilar: { page: 'placing-furniture', anchor: 'replace-with-similar' },
  kitchenCabinets: { page: 'placing-furniture', anchor: 'modular-kitchen-cabinets' },
  furnitureGroups: { page: 'placing-furniture', anchor: 'multi‐select-align-group' },

  // ── importing ───────────────────────────────────────────────────────────
  modelUpload: { page: 'importing-models', anchor: 'importing' },
  parametricFurniture: { page: 'importing-models', anchor: 'design-your-own-asset' },
  glbDesigner: { page: 'importing-models', anchor: 'design-your-own-asset' },
  importSh3d: { page: 'floor-plan-editor', anchor: 'templates-saving' },
  importSh3f: { page: 'importing-models', anchor: 'importing' },
  importTextures: { page: 'importing-textures', anchor: 'importing-using' },

  // ── exporting (3D / CAD / AR / moodboard) ───────────────────────────────
  sceneExport3d: { page: 'exporting', anchor: 'export-a-3d-model' },
  viewInAr: { page: 'exporting', anchor: 'view-in-your-room-ar' },
  dxfExport: { page: 'exporting', anchor: 'export-the-2d-plan-dxf-svg' },
  moodboard: { page: 'exporting', anchor: 'moodboard' },

  // ── style helpers & AI ──────────────────────────────────────────────────
  styleQuiz: { page: 'style-and-ai', anchor: 'style-quiz' },
  styleTransfer: { page: 'style-and-ai', anchor: 'style-transfer' },
  aiLayout: { page: 'style-and-ai', anchor: 'ai-auto-furnish' },
  paletteFromPhoto: { page: 'style-and-ai', anchor: 'palette-from-photo' },

  // ── accounts & cloud sync ───────────────────────────────────────────────
  accounts: { page: 'accounts-and-sync', anchor: 'signing-in' },
  sharedLibrary: { page: 'accounts-and-sync', anchor: 'admin-accounts' },
}

/** Build the absolute docs URL for a tool/feature key, or the guide home if the
 *  key has no mapping. `encodeURI` percent-encodes the few unicode anchors
 *  (`°`, `—`, the non-breaking hyphen) so the fragment is a valid URL that the
 *  VitePress router still matches against the raw heading id. */
export function docsUrlFor(key: DocKey): string {
  const entry = FEATURE_DOCS[key]
  if (!entry) return DOCS_URL
  const base = `${DOCS_URL}${entry.page}`
  return encodeURI(entry.anchor ? `${base}#${entry.anchor}` : base)
}

/** Open the docs page/section for a tool/feature key in a new tab (falls back to
 *  the guide home when the key isn't mapped). */
export function openToolDocs(key: DocKey): void {
  window.open(docsUrlFor(key), '_blank', 'noopener,noreferrer')
}
