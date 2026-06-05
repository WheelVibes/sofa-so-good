/**
 * Persists user-saved finish styles to localStorage so they survive reloads.
 * Like qualityPrefs/editorPrefs these are per-device, not part of a saved
 * design (the autosave/schema doesn't carry them).
 */
import type { UserStyle } from '../slices/userStylesSlice'
import { useStore } from '../store'

const KEY = 'hdb_user_styles'

/** Light shape check so a corrupt/legacy entry can't crash the boot. */
function isUserStyle(v: unknown): v is UserStyle {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.floor === 'object' &&
    typeof o.walls === 'object'
  )
}

export function loadUserStyles(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    const styles = parsed
      .filter(isUserStyle)
      .map((s) => ({ ...s, wallAccents: s.wallAccents ?? {} }))
    if (styles.length) useStore.getState().setUserStyles(styles)
  } catch {
    /* ignore corrupt prefs */
  }
}

export function watchUserStyles(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify(s.userStyles)
    if (snap === last) return
    last = snap
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })
}
