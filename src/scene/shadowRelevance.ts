/**
 * PERF-MAX-5: decide whether a discrete store change can alter the sun shadow map.
 *
 * The sun shadow map is a **depth-only** render of the shadow-casting geometry from
 * the sun's direction — so it changes ONLY when (a) shadow-casting geometry world
 * transforms change (furniture placed/moved/rotated/scaled/removed, walls/rooms
 * edited, layer/level visibility) or (b) the sun direction changes (orientation /
 * time / location — already caught by `Lighting`'s `!settled` tween check). It is
 * independent of materials, finishes, colours, opacity, selection, hover, and all
 * UI/panel/persistence state.
 *
 * `RenderPump.markDirty` re-arms the (otherwise frozen, PERF-MAX-1) shadow map on
 * every store change. Most changes — clicking to select, hovering, opening a panel,
 * swapping a finish/colour, dev asset-index churn — can't affect the map, yet each
 * triggered a full (up to 4096² at Maximum) depth re-render for the settle tail.
 * This gate skips that pulse for provably-irrelevant changes.
 *
 * **FAIL-OPEN by design:** a change pulses UNLESS *every* changed top-level store
 * key is in {@link SHADOW_IRRELEVANT_KEYS}. Any key not listed here forces a pulse,
 * so a forgotten or newly-added key can only cost an extra (correct) refresh — it
 * can NEVER produce a stale shadow. Only add keys that are pure UI / selection /
 * material-metadata / persistence with zero geometry-or-sun effect. When in doubt,
 * leave a key OUT (it will pulse — the safe default).
 */

/** Top-level store keys whose mutation provably cannot change the sun shadow map. */
export const SHADOW_IRRELEVANT_KEYS: ReadonlySet<string> = new Set<string>([
  // — Selection / hover (highlight only; never moves geometry) —
  'selectedItemId',
  'selectedItemIds',
  'selectedRoomId',
  'selectedWall',
  'selectedWallIds',
  'hoveredItemId',
  'hoveredRoomId',
  'planSelection',
  'activeGroupId',
  // — UI panel open/close, steps, tabs, collapse (DOM chrome, not the 3D scene) —
  'accessibilityOpen',
  'appearanceOpen',
  'budgetOpen',
  'catalogOpen',
  'clearancePanelOpen',
  'cmdkOpen',
  'commentsOpen',
  'configuratorOpen',
  'creditsOpen',
  'daylightOpen',
  'designScoreOpen',
  'drawingCalloutsOpen',
  'elevationsOpen',
  'flagsPanelOpen',
  'glbDesignerOpen',
  'historyOpen',
  'hqRenderOpen',
  'loginOpen',
  'onboardingOpen',
  'onboardingStep',
  'panoTourOpen',
  'panoramaOpen',
  'parametricOpen',
  'quoteTemplateOpen',
  'renderCompareOpen',
  'shareOpen',
  'shortcutsHelpOpen',
  'smartStartOpen',
  'stagingRevealOpen',
  'styleQuizOpen',
  'styleTransferOpen',
  'timeCompareOpen',
  'tourOpen',
  'tourStep',
  'versionsOpen',
  'layersCollapsed',
  'shopTab',
  // — Materials / finishes / colours (depth-only shadow map is material-independent) —
  'finishes',
  'masterPalette',
  'roomPalettes',
  'recentColors',
  'recentFinishes',
  'favouriteFinishIds',
  'favouriteDefIds',
  'recentDefIds',
  'glassTint',
  // — Dev asset-index / network / auth / persistence metadata (catalog + bookkeeping,
  //   not placed scene geometry). These were the measured dev-only churn source. —
  'localAssetsStatus',
  'remoteIndexes',
  'remoteFetches',
  'remoteCacheBytes',
  'authError',
  'authIsBackend',
  'authProviderLabel',
  'currentUser',
  'lastSavedAt',
  '_lastPushAt',
  '_lastPushKey',
  'notifications',
  'notify',
  'dismissedCallouts',
  'seenBadges',
])

/**
 * True when a store transition CAN affect the sun shadow map (→ pulse the refresh).
 * Fail-open: returns true unless every changed top-level key is shadow-irrelevant.
 */
export function changeAffectsShadow(
  next: Record<string, unknown>,
  prev: Record<string, unknown>,
): boolean {
  for (const k in next) {
    if (next[k] !== prev[k] && !SHADOW_IRRELEVANT_KEYS.has(k)) return true
  }
  // Defensive: a key present in prev but dropped in next (shouldn't happen for a
  // slice-based store, but treat an unlisted removal as relevant).
  for (const k in prev) {
    if (!(k in next) && !SHADOW_IRRELEVANT_KEYS.has(k)) return true
  }
  return false
}
