/**
 * Persists the shopping budget target (SGD) to localStorage so it survives
 * reloads. Like the other prefs, this is a per-device preference, not part of
 * a saved design.
 */
import { useStore } from '../store'

const KEY = 'sofa.budget.v1'

export function loadBudgetPrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const p = JSON.parse(raw) as { budgetTarget?: number | null }
    if (typeof p.budgetTarget === 'number' && p.budgetTarget > 0) {
      useStore.setState({ budgetTarget: p.budgetTarget })
    }
  } catch {
    /* ignore corrupt prefs */
  }
}

export function watchBudgetPrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({ budgetTarget: s.budgetTarget })
    if (snap === last) return
    last = snap
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })
}
