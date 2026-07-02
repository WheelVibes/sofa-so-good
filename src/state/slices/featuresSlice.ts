import type { RootState } from '../store'
import type { SliceCreator } from './types'

const TOUR_DONE_KEY = 'hdb_tour_done'

/** Whether the product tour has been completed/skipped on this device. */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1'
  } catch {
    return false
  }
}

function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1')
  } catch {
    /* ignore (private mode) */
  }
}

/** What the right-click landed on. The menu builds its action list from this +
 *  the current selection, so it adapts per screen (3D room editor furniture, the
 *  2D plan's walls/rooms/openings/dimensions/annotations, or empty canvas). */
export type ContextTarget =
  | { kind: 'item'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'dim'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'polyline'; id: string }
  | { kind: 'canvas' }

/** Position of the right-click context menu, in viewport px, + its target. */
export interface ContextMenuState {
  x: number
  y: number
  /** The right-clicked target. `itemId` is kept as a convenience alias for the
   *  furniture case (legacy callers / the 3D menu). */
  target: ContextTarget
  itemId?: string
  /** Active storey for plan-element actions (default ground when absent). */
  levelId?: string
}

/** UI state for the production-feature layer (command palette, layers mode,
 *  right-click context menu, onboarding). All ephemeral — not persisted in a
 *  saved design — except onboarding completion which lives in localStorage. */
export interface FeaturesSlice {
  /** Command palette (⌘K) visibility. */
  cmdkOpen: boolean
  /** Left dock mode — the catalog drawer toggles between the catalog grid and
   *  the Objects/Layers tree. Persisted per-device (editorPrefs). */
  leftMode: 'catalog' | 'layers'
  /** Per-room collapsed state of the Objects/Layers tree groups (room id →
   *  collapsed). Lifted out of the panel so it persists per-device (editorPrefs). */
  layersCollapsed: Record<string, boolean>
  /** Right-click context menu, or null when closed. */
  contextMenu: ContextMenuState | null
  /** Onboarding carousel visibility + step. */
  onboardingOpen: boolean
  onboardingStep: number
  /** Guided product tour (spotlight walkthrough): open + current step index. */
  tourOpen: boolean
  tourStep: number
  /** Help & shortcuts modal visibility. */
  helpOpen: boolean
  /** Asset-credits (attribution) modal visibility. */
  creditsOpen: boolean
  /** Swap-with-similar modal — the item id being replaced, or null. */
  swapItemId: string | null
  /** Share & export modal visibility. */
  shareOpen: boolean
  /** 360° panorama capture/viewer modal visibility. */
  panoramaOpen: boolean
  /** Path-traced HQ render modal visibility. */
  hqRenderOpen: boolean
  /** Render preset A/B compare modal visibility (F4 tail). */
  renderCompareOpen: boolean
  /** Before/after staging-reveal modal visibility (empty room vs furnished). */
  stagingRevealOpen: boolean
  /** One-tap style-transfer modal visibility. */
  styleTransferOpen: boolean
  /** Style-quiz modal visibility. */
  styleQuizOpen: boolean
  /** Keyboard-shortcuts help overlay visibility. */
  shortcutsHelpOpen: boolean
  /** An immersive-VR session is active/requested (mounts the XR provider). */
  vrActive: boolean
  /** Clearance & fit checks panel visibility. */
  clearancePanelOpen: boolean
  /** Wall-elevations panel visibility. */
  elevationsOpen: boolean
  /** 3D lux-coverage heatmap on the floor (LP5 tail) — toggled from the
   *  Drawings panel's Lighting tab; rides the same `drawings` flag. */
  luxOverlayOn: boolean
  /** Per-fixture exclusion for the lux overlay (LP6): item IDs of fixtures
   *  whose contribution is suppressed in the heatmap computation, so the user
   *  can isolate each fixture's contribution. Cleared on overlay off. */
  luxExcludedIds: string[]
  /** Whether the lux overlay time-of-day auto-play is active (LP6). */
  luxPlaying: boolean
  /** Daylight & ventilation check panel visibility. */
  daylightOpen: boolean
  /** Design Score (aggregate layout-quality feedback) panel visibility. */
  designScoreOpen: boolean
  /** Accessibility / universal-design check panel visibility. */
  accessibilityOpen: boolean
  /** Versions (save / restore / compare) panel visibility. */
  versionsOpen: boolean
  /** Undo/redo history (timeline + jump-to-step) panel visibility. */
  historyOpen: boolean
  /** Pinned design comments (F24) panel visibility. */
  commentsOpen: boolean
  /** Smart Start wizard (pick a style → furnished flat) visibility. */
  smartStartOpen: boolean
  /** GLB Asset Designer (compose/edit a custom asset → catalog) visibility. */
  glbDesignerOpen: boolean
  /** Parametric furniture generator (custom-size shelving/wardrobe/sideboard,
   *  PF1) dialog visibility. */
  parametricOpen: boolean
  /** Slot-based product configurator dialog visibility (SLOT-105). */
  configuratorOpen: boolean
  /** When set, the configurator opens seeded with this recipe (JSON
   *  `ConfiguredSpec`) for re-editing a placed product (SLOT-204); null = fresh. */
  configuratorEditSpec: string | null
  /** Login screen (admin sign-in) visibility. */
  loginOpen: boolean
  /** Feature-flags panel (dev/admin) visibility. */
  flagsPanelOpen: boolean
  /** Quote template settings dialog visibility. */
  quoteTemplateOpen: boolean
  /** Shopping panel tab. */
  shopTab: 'list' | 'saved'
  /** Optional shopping budget target (SGD); drives the over/under indicator in
   *  the Budget panel. Persisted per-device. `null` = no target set. */
  budgetTarget: number | null
  setCmdkOpen: (open: boolean) => void
  toggleCmdk: () => void
  setLeftMode: (mode: 'catalog' | 'layers') => void
  setLayersCollapsed: (collapsed: Record<string, boolean>) => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  setOnboardingOpen: (open: boolean) => void
  setOnboardingStep: (step: number) => void
  /** Start the product tour at step 0. */
  startTour: () => void
  /** Advance / go back; advancing past the last step (count) ends + marks done. */
  tourNext: (count: number) => void
  tourPrev: () => void
  /** End the tour (Skip / Done) and mark it completed in localStorage. */
  endTour: () => void
  setHelpOpen: (open: boolean) => void
  setCreditsOpen: (open: boolean) => void
  setSwapItemId: (id: string | null) => void
  setShareOpen: (open: boolean) => void
  setPanoramaOpen: (open: boolean) => void
  setHqRenderOpen: (open: boolean) => void
  setRenderCompareOpen: (open: boolean) => void
  setStagingRevealOpen: (open: boolean) => void
  setStyleTransferOpen: (open: boolean) => void
  setStyleQuizOpen: (open: boolean) => void
  setShortcutsHelpOpen: (open: boolean) => void
  setVrActive: (active: boolean) => void
  setClearancePanelOpen: (open: boolean) => void
  setElevationsOpen: (open: boolean) => void
  setLuxOverlayOn: (on: boolean) => void
  /** Toggle one fixture's exclusion from the lux overlay computation. */
  toggleLuxExcluded: (id: string) => void
  /** Replace the full exclusion set. */
  setLuxExcludedIds: (ids: string[]) => void
  /** Start/stop the lux overlay time auto-play. */
  setLuxPlaying: (playing: boolean) => void
  setDaylightOpen: (open: boolean) => void
  setDesignScoreOpen: (open: boolean) => void
  setAccessibilityOpen: (open: boolean) => void
  setVersionsOpen: (open: boolean) => void
  setHistoryOpen: (open: boolean) => void
  setCommentsOpen: (open: boolean) => void
  setSmartStartOpen: (open: boolean) => void
  setGlbDesignerOpen: (open: boolean) => void
  setParametricOpen: (open: boolean) => void
  setConfiguratorOpen: (open: boolean) => void
  setConfiguratorEditSpec: (spec: string | null) => void
  setLoginOpen: (open: boolean) => void
  setFlagsPanelOpen: (open: boolean) => void
  setQuoteTemplateOpen: (open: boolean) => void
  setShopTab: (tab: 'list' | 'saved') => void
  setBudgetTarget: (target: number | null) => void
}

export const FEATURES_INITIAL = {
  cmdkOpen: false,
  leftMode: 'catalog' as const,
  layersCollapsed: {} as Record<string, boolean>,
  contextMenu: null as ContextMenuState | null,
  onboardingOpen: false,
  onboardingStep: 0,
  tourOpen: false,
  tourStep: 0,
  helpOpen: false,
  creditsOpen: false,
  swapItemId: null as string | null,
  shareOpen: false,
  panoramaOpen: false,
  hqRenderOpen: false,
  renderCompareOpen: false,
  stagingRevealOpen: false,
  styleTransferOpen: false,
  styleQuizOpen: false,
  shortcutsHelpOpen: false,
  vrActive: false,
  clearancePanelOpen: false,
  elevationsOpen: false,
  luxOverlayOn: false,
  luxExcludedIds: [] as string[],
  luxPlaying: false,
  daylightOpen: false,
  designScoreOpen: false,
  accessibilityOpen: false,
  versionsOpen: false,
  historyOpen: false,
  commentsOpen: false,
  smartStartOpen: false,
  glbDesignerOpen: false,
  parametricOpen: false,
  configuratorOpen: false,
  configuratorEditSpec: null,
  loginOpen: false,
  flagsPanelOpen: false,
  quoteTemplateOpen: false,
  shopTab: 'list' as 'list' | 'saved',
  budgetTarget: null as number | null,
}

export const createFeaturesSlice: SliceCreator<FeaturesSlice, RootState> = (set) => ({
  ...FEATURES_INITIAL,
  setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),
  toggleCmdk: () => set((s) => ({ cmdkOpen: !s.cmdkOpen })),
  setLeftMode: (leftMode) => set({ leftMode }),
  setLayersCollapsed: (layersCollapsed) => set({ layersCollapsed }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
  startTour: () => set({ tourOpen: true, tourStep: 0, onboardingOpen: false }),
  tourNext: (count) =>
    set((s) => {
      const next = s.tourStep + 1
      if (next >= count) {
        markTourDone()
        return { tourOpen: false, tourStep: 0 }
      }
      return { tourStep: next }
    }),
  tourPrev: () => set((s) => ({ tourStep: Math.max(0, s.tourStep - 1) })),
  endTour: () => {
    markTourDone()
    set({ tourOpen: false, tourStep: 0 })
  },
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
  setSwapItemId: (swapItemId) => set({ swapItemId }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setPanoramaOpen: (panoramaOpen) => set({ panoramaOpen }),
  setHqRenderOpen: (hqRenderOpen) => set({ hqRenderOpen }),
  setRenderCompareOpen: (renderCompareOpen) => set({ renderCompareOpen }),
  setStagingRevealOpen: (stagingRevealOpen) => set({ stagingRevealOpen }),
  setStyleTransferOpen: (styleTransferOpen) => set({ styleTransferOpen }),
  setStyleQuizOpen: (styleQuizOpen) => set({ styleQuizOpen }),
  setShortcutsHelpOpen: (shortcutsHelpOpen) => set({ shortcutsHelpOpen }),
  setVrActive: (vrActive) => set({ vrActive }),
  setClearancePanelOpen: (clearancePanelOpen) => set({ clearancePanelOpen }),
  setElevationsOpen: (elevationsOpen) => set({ elevationsOpen }),
  setLuxOverlayOn: (luxOverlayOn) =>
    set({ luxOverlayOn, ...(luxOverlayOn ? {} : { luxExcludedIds: [], luxPlaying: false }) }),
  toggleLuxExcluded: (id) =>
    set((s) => ({
      luxExcludedIds: s.luxExcludedIds.includes(id)
        ? s.luxExcludedIds.filter((x) => x !== id)
        : [...s.luxExcludedIds, id],
    })),
  setLuxExcludedIds: (luxExcludedIds) => set({ luxExcludedIds }),
  setLuxPlaying: (luxPlaying) => set({ luxPlaying }),
  setDaylightOpen: (daylightOpen) => set({ daylightOpen }),
  setDesignScoreOpen: (designScoreOpen) => set({ designScoreOpen }),
  setAccessibilityOpen: (accessibilityOpen) => set({ accessibilityOpen }),
  setVersionsOpen: (versionsOpen) => set({ versionsOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),
  setSmartStartOpen: (smartStartOpen) => set({ smartStartOpen }),
  setGlbDesignerOpen: (glbDesignerOpen) => set({ glbDesignerOpen }),
  setParametricOpen: (parametricOpen) => set({ parametricOpen }),
  setConfiguratorOpen: (configuratorOpen) => set({ configuratorOpen }),
  setConfiguratorEditSpec: (configuratorEditSpec) => set({ configuratorEditSpec }),
  setLoginOpen: (loginOpen) => set({ loginOpen }),
  setFlagsPanelOpen: (flagsPanelOpen) => set({ flagsPanelOpen }),
  setQuoteTemplateOpen: (quoteTemplateOpen) => set({ quoteTemplateOpen }),
  setShopTab: (shopTab) => set({ shopTab }),
  setBudgetTarget: (budgetTarget) =>
    set({ budgetTarget: budgetTarget != null && budgetTarget > 0 ? budgetTarget : null }),
})
