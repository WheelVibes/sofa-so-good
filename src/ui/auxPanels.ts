import type { useStore } from '../state/store'

type StoreState = ReturnType<typeof useStore.getState>

/**
 * Close every mutually-exclusive `.aux` slot panel (they all dock to the same
 * centred-top slot, so only one may be open). The single source of truth shared
 * by the desktop Tools menu, the mobile toolbar, and the ⌘K command palette — so
 * opening one panel from anywhere reliably dismisses the rest (no stacking).
 * Add new aux panels here once and every entry point stays correct.
 */
export function closeAllAuxPanels(s: StoreState): void {
  if (s.budgetOpen) s.toggleBudget()
  s.setClearancePanelOpen(false)
  s.setElevationsOpen(false)
  s.setDaylightOpen(false)
  s.setDesignScoreOpen(false)
  s.setAccessibilityOpen(false)
  s.setPetComplianceOpen(false)
  s.setVersionsOpen(false)
  s.setHistoryOpen(false)
  s.setCommentsOpen(false)
  s.setDrawingCalloutsOpen(false)
  s.setDesignChatOpen(false)
}
