import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** The five core-design-loop steps the getting-started checklist tracks. */
export const CHECKLIST_STEPS = ['furnish', 'finish', 'light', 'walk', 'share'] as const
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number]

const LS_KEY = 'hdb_checklist'

/**
 * Getting-started checklist state (UIUX-28): which core-loop actions the user
 * has performed at least once, plus the card's dismissal. Persisted per-device
 * to localStorage and kept OUT of the save schema/autosave (like favourites and
 * recents) — it describes the person, not the design. Steps are marked by the
 * `OnboardingChecklist` card's store watchers; marking is monotonic (a step
 * never un-checks).
 */
export interface ChecklistSlice {
  checklistDone: ChecklistStep[]
  checklistDismissed: boolean
  markChecklistStep: (step: ChecklistStep) => void
  dismissChecklist: () => void
}

interface PersistedChecklist {
  done: ChecklistStep[]
  dismissed: boolean
}

function loadChecklist(): PersistedChecklist {
  try {
    if (typeof localStorage === 'undefined') return { done: [], dismissed: false }
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return { done: [], dismissed: false }
    const done = Array.isArray(parsed.done)
      ? parsed.done.filter((s: unknown): s is ChecklistStep =>
          (CHECKLIST_STEPS as readonly string[]).includes(s as string),
        )
      : []
    return { done, dismissed: parsed.dismissed === true }
  } catch {
    return { done: [], dismissed: false }
  }
}

function persistChecklist(done: ChecklistStep[], dismissed: boolean): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ done, dismissed }))
  } catch {
    // private mode / quota — the checklist is non-critical, ignore.
  }
}

const initial = loadChecklist()
export const CHECKLIST_INITIAL: Pick<ChecklistSlice, 'checklistDone' | 'checklistDismissed'> = {
  checklistDone: initial.done,
  checklistDismissed: initial.dismissed,
}

export const createChecklistSlice: SliceCreator<ChecklistSlice, RootState> = (set, get) => ({
  ...CHECKLIST_INITIAL,
  markChecklistStep: (step) => {
    const done = get().checklistDone
    if (done.includes(step)) return
    const next = [...done, step]
    persistChecklist(next, get().checklistDismissed)
    set({ checklistDone: next })
  },
  dismissChecklist: () => {
    persistChecklist(get().checklistDone, true)
    set({ checklistDismissed: true })
  },
})
