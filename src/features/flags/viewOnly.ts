/**
 * Showroom (view-only) mode — which feature flags are withheld from a visitor.
 *
 * A `#/showroom/<code>` link (see `features/designShare.ts`) opens the design as
 * a **tour**, not a copy to edit. Rather than touching hundreds of components,
 * the gate is applied at the single place the app already decides what a session
 * may see: `resolveFlags`. `uiMode: 'simple'` already hides every `pro` flag the
 * same way; this adds an orthogonal `viewOnly` dimension.
 *
 * ## Deny, not allow — and why
 * This is a **denylist of authoring surfaces**, not an allowlist of viewing ones.
 * Roughly half of the registry gates *rendering fidelity* (baked GI, daylight
 * curves, weather, wall reveal, tone/exposure…), and a showroom visitor must get
 * the full HD render — so the safe failure mode is "a flag nobody classified
 * stays ON". An allowlist would silently degrade the render the day someone adds
 * a lighting flag and forgets this file; a denylist silently leaves one editing
 * button visible instead, which is cosmetic and caught by review.
 *
 * **Consequence, stated plainly:** the list is enumerated, not derived. A NEW
 * authoring/editing feature must be added here, or it will still be reachable in
 * showroom mode. `viewOnly.test.ts` pins sentinels on both sides so the
 * classification can't rot unnoticed in the directions that matter most.
 *
 * ## What is deliberately NOT withheld
 * Everything that makes the tour worth taking stays fully live: orbit / walk /
 * plan / dollhouse cameras, saved views, the presentation slideshow, 360°
 * panoramas and tours, quality tiers, tone mapping and colour grade, HQ render,
 * lights, lighting moods, time of day, weather, backdrops and HDRIs, the walk
 * HUD's interactive curtains / screens / lights / cabinets, the minimap, the
 * budget and shopping list, measure, and **sharing** (a visitor can pass the
 * showroom on, or take their own editable copy).
 */

import type { FeatureFlag } from './types'

/**
 * Feature flags forced **off** for a showroom visitor. Grouped by the surface
 * they belong to so a new flag is easy to file.
 */
export const VIEW_ONLY_BLOCKED_FLAGS: readonly FeatureFlag[] = [
  // — Plan authoring: the 2D editor and everything that reshapes the shell —
  'floorPlanEditor',
  'planReset',
  'planFurnish',
  'planGuides',
  'planGridSnap',
  'planMirrorRegion',
  'planPolyline',
  'planScale',
  'planTraceBackdrop',
  'planIntegrity',
  'wallNumericEntry',
  'wallThickness',
  'wallStructure',
  'curvedWalls',
  'slopingWalls',
  'cornerFillet',
  'roomInset',
  'roomReorder',
  'openingStyles',
  'elementColors',
  'mepEditor',
  'unroomedFlag',
  'hackabilityOverlay',

  // — Furnishing: the catalog, placement tools and everything that adds items —
  'catalogFilters',
  'catalogResize',
  'catalogFavourites',
  'catalogRecents',
  'catalogCompare',
  'catalogRoomAware',
  'catalogFits',
  'catalogFitsFilter',
  'catalogModelInfo',
  'roomStarters',
  'smartStart',
  'textBrief',
  'layoutReroll',
  'aiLayout',
  'aiWalls',
  'aiPlanGenerate',
  'aiDesignChat',
  'stampPlace',
  'scatterFill',
  'radialArray',
  'pathArray',
  'smartRotateSnap',
  'altDragDuplicate',
  'mirrorSelection',
  'replaceSimilar',
  'layerOrder',
  'furnitureGroups',
  'userSets',
  'contextMenu',
  'mountHeights',
  'tiltFurniture',
  'itemOpacity',
  'itemMeta',
  'itemDimensionReadout',
  'parametricFurniture',
  'kitchenCabinets',
  'productConfigurator',
  'parametricStairs',
  'parametricRoof',
  'ocsStarter',

  // — Finishes: anything that repaints, retextures or recolours the design —
  'finishDnd',
  'finishEyedropper',
  'finishRecolor',
  'materialComposer',
  'saveMaterials',
  'designerPicks',
  'masterPalette',
  'palettePresets',
  'paletteFromPhoto',
  'paintVisualizer',
  'styleTransfer',
  'styleQuiz',
  'wallAccentPicker',
  'copyAppearance',
  'bulkAppearance',
  'floorTexture',
  'wallTexture',
  'wallBaseboard',
  'crownMolding',
  'ceilingDesign',
  'ceilingFinish',
  'ceilingPlaster',
  'itemAsLight',
  'tileBreakup',

  // — Content acquisition: libraries, uploads and imports of new assets —
  'modelUpload',
  'importSh3d',
  'importSh3f',
  'packs',
  'remoteMaterials',
  'remoteFurniture',
  'ambientcgLibrary',
  'sharedLibrary',
  'showroomFinishes',
  'localAssets',
  'ikeaLive',
  'glbDesigner',
  'assetConfigurableExport',
  'assetSets',
  'petProfile',
  'petFittings',

  // — Document/session state a visitor has no business mutating —
  'history',
  'versions',
  'comments',
  'siteMeasurements',
  'variationRegister',
  'quoteTemplate',
  'priceRules',
  'drawingCallouts',

  // — First-run coaching for an owner, noise for a visitor —
  'onboardChecklist',
  'newBadges',
  'proUpsell',
  // Installing the generic app doesn't carry THIS shared design (the
  // manifest's start_url is the app root, not the current #/showroom/<code>
  // fragment) — a visitor who "installs" would reopen to their own empty
  // default flat, not the home they were just shown. Explicit product call
  // (R7-M / U2), not an inherited default: see docs/developer/pwa-install.md.
  'pwaInstallPrompt',
]

const BLOCKED = new Set<FeatureFlag>(VIEW_ONLY_BLOCKED_FLAGS)

/** Is this flag withheld from a showroom visitor? */
export function isBlockedInViewOnly(flag: FeatureFlag): boolean {
  return BLOCKED.has(flag)
}
