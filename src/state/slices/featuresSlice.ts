import type { RootState } from '../store'
import type { SliceCreator } from './types'

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
  /** Help & shortcuts modal visibility. */
  helpOpen: boolean
  /** Swap-with-similar modal — the item id being replaced, or null. */
  swapItemId: string | null
  /** Share & export modal visibility. */
  shareOpen: boolean
  /** Clearance & fit checks panel visibility. */
  clearancePanelOpen: boolean
  /** Versions (save / restore / compare) panel visibility. */
  versionsOpen: boolean
  /** Shopping panel tab. */
  shopTab: 'list' | 'saved'
  /** Saved-to-collection catalog def ids (the heart on catalog cards). */
  collections: string[]

  setCmdkOpen: (open: boolean) => void
  toggleCmdk: () => void
  setLeftMode: (mode: 'catalog' | 'layers') => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  setOnboardingOpen: (open: boolean) => void
  setOnboardingStep: (step: number) => void
  setHelpOpen: (open: boolean) => void
  setSwapItemId: (id: string | null) => void
  setShareOpen: (open: boolean) => void
  setClearancePanelOpen: (open: boolean) => void
  setVersionsOpen: (open: boolean) => void
  setShopTab: (tab: 'list' | 'saved') => void
  toggleCollection: (defId: string) => void
}

export const FEATURES_INITIAL = {
  cmdkOpen: false,
  leftMode: 'catalog' as const,
  contextMenu: null as ContextMenuState | null,
  onboardingOpen: false,
  onboardingStep: 0,
  helpOpen: false,
  swapItemId: null as string | null,
  shareOpen: false,
  clearancePanelOpen: false,
  versionsOpen: false,
  shopTab: 'list' as 'list' | 'saved',
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
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setSwapItemId: (swapItemId) => set({ swapItemId }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setClearancePanelOpen: (clearancePanelOpen) => set({ clearancePanelOpen }),
  setVersionsOpen: (versionsOpen) => set({ versionsOpen }),
  setShopTab: (shopTab) => set({ shopTab }),
  toggleCollection: (defId) =>
    set((s) => ({
      collections: s.collections.includes(defId)
        ? s.collections.filter((d) => d !== defId)
        : [...s.collections, defId],
    })),
})
