/**
 * Tool-action registry — the single source of truth for the analytical "Tools"
 * cluster (the Analyse + Review panels). The three surfaces that used to
 * hand-build these rows in their own JSX — the desktop Tools menu
 * (`menus/ToolsMenu`), the mobile bottom-sheet (`MobileToolbar`), and the ⌘K
 * command palette (`CommandPalette`) — now all render from this list, so they
 * can't drift (see `toolActions.test.ts` for the per-surface parity guard).
 *
 * Each `ToolAction` is declarative: its gating `flag` (which already encodes
 * Simple/Pro via `resolveFlags`), its `docs` deep-link key, which `surfaces` it
 * appears on, its active-state predicate, and a `run(store)` that performs the
 * action (closing sibling aux panels + toggling, the exact behaviour the three
 * surfaces previously duplicated by hand).
 *
 * Scope note: the *export* cluster (BOQ / CSV / 3D / drawing-set + its bespoke
 * sub-controls) and the local-state Sun-study toggle stay hand-rendered — they
 * diverge per surface and aren't store-backed — so they're intentionally not in
 * this registry yet.
 */

import type { KeybindingId } from '../../controls/keybindings'
import type { FeatureFlag } from '../../features/featureFlags'
import { canRecord } from '../../scene/RecordController'
import type { useStore } from '../../state/store'
import { closeAllAuxPanels } from '../auxPanels'
import type { DocKey } from '../docsUrl'
import type { IconName } from '../toolbar/icons'

type StoreApi = typeof useStore
type StoreState = ReturnType<typeof useStore.getState>

export type ToolCategory = 'analyze' | 'review'
export type ToolSurface = 'desktop' | 'mobile' | 'palette'

export interface ToolAction {
  id: string
  /** Menu / sheet label — static, or derived from state (e.g. Walkthrough ↔ Stop tour). */
  label: string | ((s: StoreState) => string)
  /** A more descriptive label for the ⌘K palette row (falls back to `label`). */
  paletteLabel?: string
  /** Secondary description line (shown on desktop + mobile). */
  sub?: string
  icon: IconName
  category: ToolCategory
  /** The feature flag that gates this action (already encodes Simple/Pro tier). */
  flag: FeatureFlag
  /** Contextual user-guide deep-link key (DOCS-DEEPLINK). */
  docs?: DocKey
  /** Keybinding id whose combo renders as a right-aligned chip on desktop rows
   *  (TB-7) — an action with a real shortcut must surface it; the chip/tooltip
   *  is the primary shortcut-teaching surface (toolbar UX audit). */
  kbd?: KeybindingId
  /** Which surfaces render this action — the anti-drift parity guard checks each. */
  surfaces: readonly ToolSurface[]
  /** Mobile hides this while the per-room editor is active (matches the old sheet). */
  mobileOverviewOnly?: boolean
  /** Active-state highlight predicate (panel open / mode on). */
  isActive: (s: StoreState) => boolean
  /** Perform the action — closes sibling aux panels then toggles the target. */
  run: (store: StoreApi) => void
}

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  analyze: 'Analyse',
  review: 'Review & tour',
}

/** Display order of the category section headers. */
export const TOOL_CATEGORY_ORDER: readonly ToolCategory[] = ['analyze', 'review']

/** Resolve a (possibly state-derived) label against the current store snapshot. */
export function resolveToolLabel(a: ToolAction, s: StoreState): string {
  return typeof a.label === 'function' ? a.label(s) : a.label
}

/** Build the shared close-siblings-then-toggle behaviour for an aux panel: open
 *  when it was closed, leave closed when it was open (so the row toggles). */
function auxToggle(isOpen: (s: StoreState) => boolean, open: (store: StoreApi) => void) {
  return (store: StoreApi) => {
    const wasOpen = isOpen(store.getState())
    closeAllAuxPanels(store.getState())
    if (!wasOpen) open(store)
  }
}

export const TOOL_ACTIONS: readonly ToolAction[] = [
  // ── Analyse ───────────────────────────────────────────────────────────────
  {
    id: 'budget',
    label: 'Budget',
    paletteLabel: 'Budget / shopping list',
    sub: 'Estimate furniture cost (SGD)',
    icon: 'Budget',
    category: 'analyze',
    flag: 'budget',
    docs: 'budget',
    kbd: 'toggleBudget',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.budgetOpen,
    run: auxToggle(
      (s) => s.budgetOpen,
      (store) => store.getState().toggleBudget(),
    ),
  },
  {
    id: 'clearance',
    label: 'Checks',
    paletteLabel: 'Clearance & fit checks',
    sub: 'Door-swing + walkway clearance',
    icon: 'Checks',
    category: 'analyze',
    flag: 'clearanceChecks',
    docs: 'clearanceChecks',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.clearancePanelOpen,
    run: (store) => {
      const next = !store.getState().clearancePanelOpen
      closeAllAuxPanels(store.getState())
      store.getState().setClearancePanelOpen(next)
      if (next && !store.getState().clearanceOn) store.getState().toggleClearance()
    },
  },
  {
    id: 'drawings',
    label: 'Drawings',
    sub: 'Wall elevations + lighting plan',
    icon: 'FloorPlan',
    category: 'analyze',
    flag: 'drawings',
    docs: 'drawings',
    surfaces: ['desktop', 'mobile'],
    isActive: (s) => s.elevationsOpen,
    run: auxToggle(
      (s) => s.elevationsOpen,
      (store) => store.getState().setElevationsOpen(true),
    ),
  },
  {
    id: 'daylight',
    label: 'Daylight',
    sub: 'Window glazing & ventilation per room',
    icon: 'Daylight',
    category: 'analyze',
    flag: 'daylight',
    docs: 'daylight',
    surfaces: ['desktop', 'mobile'],
    isActive: (s) => s.daylightOpen,
    run: auxToggle(
      (s) => s.daylightOpen,
      (store) => store.getState().setDaylightOpen(true),
    ),
  },
  {
    id: 'design-score',
    label: 'Design score',
    paletteLabel: 'Design score — layout quality',
    sub: 'Overall layout quality + fixes',
    icon: 'Star',
    category: 'analyze',
    flag: 'designScore',
    docs: 'designScore',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.designScoreOpen,
    run: auxToggle(
      (s) => s.designScoreOpen,
      (store) => store.getState().setDesignScoreOpen(true),
    ),
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    paletteLabel: 'Accessibility check',
    sub: 'Door widths + wheelchair turning space',
    icon: 'Accessibility',
    category: 'analyze',
    flag: 'accessibility',
    docs: 'accessibility',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.accessibilityOpen,
    run: auxToggle(
      (s) => s.accessibilityOpen,
      (store) => store.getState().setAccessibilityOpen(true),
    ),
  },
  {
    id: 'measure',
    // 'Measure distance' (not plain 'Measure') — the toolbar's 'Dimensions'
    // overlay toggle used to be called 'Measurements', and the two near-identical
    // names shared one icon (TB-8 in the toolbar UX audit).
    label: (s) => (s.tapeMode ? 'Measuring…' : 'Measure distance'),
    sub: 'Tap two points for a distance',
    icon: 'Measure',
    category: 'analyze',
    flag: 'measure',
    docs: 'measure',
    surfaces: ['desktop', 'mobile'],
    isActive: (s) => s.tapeMode,
    run: (store) => {
      closeAllAuxPanels(store.getState())
      store.getState().toggleTapeMode()
    },
  },
  {
    id: 'comments',
    label: 'Comments',
    paletteLabel: 'Comments — pinned notes',
    sub: 'Pinned notes — travel with saves & links',
    icon: 'Pin',
    category: 'analyze',
    flag: 'comments',
    docs: 'comments',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.commentsOpen || s.commentMode,
    run: auxToggle(
      (s) => s.commentsOpen,
      (store) => store.getState().setCommentsOpen(true),
    ),
  },
  // ── Review & tour ───────────────────────────────────────────────────────────
  {
    id: 'history',
    label: 'History',
    paletteLabel: 'Edit history — jump to any step',
    sub: 'Timeline of edits — jump to any step',
    icon: 'Undo',
    category: 'review',
    flag: 'history',
    docs: 'history',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.historyOpen,
    run: auxToggle(
      (s) => s.historyOpen,
      (store) => store.getState().setHistoryOpen(true),
    ),
  },
  {
    id: 'versions',
    label: 'Versions',
    paletteLabel: 'Versions — save / restore',
    sub: 'Save, restore, compare & export layouts',
    icon: 'Versions',
    category: 'review',
    flag: 'versions',
    docs: 'versions',
    surfaces: ['desktop', 'mobile', 'palette'],
    isActive: (s) => s.versionsOpen,
    run: auxToggle(
      (s) => s.versionsOpen,
      (store) => store.getState().setVersionsOpen(true),
    ),
  },
  {
    id: 'walkthrough',
    label: (s) => (s.touring ? 'Stop tour' : 'Walkthrough'),
    sub: 'Fly a tour through every room',
    icon: 'Walkthrough',
    category: 'review',
    flag: 'walkthrough',
    docs: 'walkthrough',
    surfaces: ['desktop', 'mobile'],
    mobileOverviewOnly: true,
    isActive: (s) => Boolean(s.touring),
    run: (store) => {
      const s = store.getState()
      if (s.touring) {
        s.setTouring(false)
        if (s.recording) s.setRecording(false)
        return
      }
      s.setCameraMode('orbit')
      if (canRecord()) s.setRecording(true)
      s.setTouring(true)
    },
  },
]

/** All actions that render on a given surface (independent of feature flags). */
export function toolActionsForSurface(surface: ToolSurface): ToolAction[] {
  return TOOL_ACTIONS.filter((a) => a.surfaces.includes(surface))
}

/** Visible actions for a surface given the effective flag map (+ mobile's
 *  room-editor gate). A flag that's off — including a pro-tier flag forced off in
 *  Simple mode by `resolveFlags` — drops its action everywhere. */
export function visibleToolActions(
  surface: ToolSurface,
  flags: Record<FeatureFlag, boolean>,
  opts: { roomEditorActive?: boolean } = {},
): ToolAction[] {
  return toolActionsForSurface(surface).filter((a) => {
    if (!flags[a.flag]) return false
    if (surface === 'mobile' && a.mobileOverviewOnly && opts.roomEditorActive) return false
    return true
  })
}

/** Group a list of actions by category, preserving category + action order and
 *  dropping empty groups (so a section header never shows over nothing). */
export function groupToolActions(
  actions: ToolAction[],
): { category: ToolCategory; label: string; actions: ToolAction[] }[] {
  return TOOL_CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    actions: actions.filter((a) => a.category === category),
  })).filter((g) => g.actions.length > 0)
}
