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

/** Position of the right-click context menu, in viewport px. */
export interface ContextMenuState {
  x: number
  y: number
  itemId: string
}

/** UI state for the production-feature layer (command palette, layers mode,
 *  right-click context menu, onboarding). All ephemeral — not persisted in a
 *  saved design — except onboarding completion which lives in localStorage. */
export interface FeaturesSlice {
  /** Command palette (⌘K) visibility. */
  cmdkOpen: boolean
  /** Left dock mode — the catalog drawer toggles between the catalog grid and
   *  the Objects/Layers tree. */
  leftMode: 'catalog' | 'layers'
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
  /** Swap-with-similar modal — the item id being replaced, or null. */
  swapItemId: string | null
  /** Share & export modal visibility. */
  shareOpen: boolean
  /** Clearance & fit checks panel visibility. */
  clearancePanelOpen: boolean
  /** Wall-elevations panel visibility. */
  elevationsOpen: boolean
  /** Daylight & ventilation check panel visibility. */
  daylightOpen: boolean
  /** Versions (save / restore / compare) panel visibility. */
  versionsOpen: boolean
  /** Undo/redo history (timeline + jump-to-step) panel visibility. */
  historyOpen: boolean
  /** Smart Start wizard (pick a style → furnished flat) visibility. */
  smartStartOpen: boolean
  /** GLB Asset Designer (compose/edit a custom asset → catalog) visibility. */
  glbDesignerOpen: boolean
  /** Login screen (admin sign-in) visibility. */
  loginOpen: boolean
  /** Feature-flags panel (dev/admin) visibility. */
  flagsPanelOpen: boolean
  /** Shopping panel tab. */
  shopTab: 'list' | 'saved'
  /** Optional shopping budget target (SGD); drives the over/under indicator in
   *  the Budget panel. Persisted per-device. `null` = no target set. */
  budgetTarget: number | null
  /** Saved-to-collection catalog def ids (the heart on catalog cards). */
  collections: string[]

  setCmdkOpen: (open: boolean) => void
  toggleCmdk: () => void
  setLeftMode: (mode: 'catalog' | 'layers') => void
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
  setSwapItemId: (id: string | null) => void
  setShareOpen: (open: boolean) => void
  setClearancePanelOpen: (open: boolean) => void
  setElevationsOpen: (open: boolean) => void
  setDaylightOpen: (open: boolean) => void
  setVersionsOpen: (open: boolean) => void
  setHistoryOpen: (open: boolean) => void
  setSmartStartOpen: (open: boolean) => void
  setGlbDesignerOpen: (open: boolean) => void
  setLoginOpen: (open: boolean) => void
  setFlagsPanelOpen: (open: boolean) => void
  setShopTab: (tab: 'list' | 'saved') => void
  setBudgetTarget: (target: number | null) => void
  toggleCollection: (defId: string) => void
}

export const FEATURES_INITIAL = {
  cmdkOpen: false,
  leftMode: 'catalog' as const,
  contextMenu: null as ContextMenuState | null,
  onboardingOpen: false,
  onboardingStep: 0,
  tourOpen: false,
  tourStep: 0,
  helpOpen: false,
  swapItemId: null as string | null,
  shareOpen: false,
  clearancePanelOpen: false,
  elevationsOpen: false,
  daylightOpen: false,
  versionsOpen: false,
  historyOpen: false,
  smartStartOpen: false,
  glbDesignerOpen: false,
  loginOpen: false,
  flagsPanelOpen: false,
  shopTab: 'list' as 'list' | 'saved',
  budgetTarget: null as number | null,
  collections: [] as string[],
}

export const createFeaturesSlice: SliceCreator<FeaturesSlice, RootState> = (set) => ({
  ...FEATURES_INITIAL,
  setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),
  toggleCmdk: () => set((s) => ({ cmdkOpen: !s.cmdkOpen })),
  setLeftMode: (leftMode) => set({ leftMode }),
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
  setSwapItemId: (swapItemId) => set({ swapItemId }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setClearancePanelOpen: (clearancePanelOpen) => set({ clearancePanelOpen }),
  setElevationsOpen: (elevationsOpen) => set({ elevationsOpen }),
  setDaylightOpen: (daylightOpen) => set({ daylightOpen }),
  setVersionsOpen: (versionsOpen) => set({ versionsOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setSmartStartOpen: (smartStartOpen) => set({ smartStartOpen }),
  setGlbDesignerOpen: (glbDesignerOpen) => set({ glbDesignerOpen }),
  setLoginOpen: (loginOpen) => set({ loginOpen }),
  setFlagsPanelOpen: (flagsPanelOpen) => set({ flagsPanelOpen }),
  setShopTab: (shopTab) => set({ shopTab }),
  setBudgetTarget: (budgetTarget) =>
    set({ budgetTarget: budgetTarget != null && budgetTarget > 0 ? budgetTarget : null }),
  toggleCollection: (defId) =>
    set((s) => ({
      collections: s.collections.includes(defId)
        ? s.collections.filter((d) => d !== defId)
        : [...s.collections, defId],
    })),
})
