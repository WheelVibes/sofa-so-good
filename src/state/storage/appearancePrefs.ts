/**
 * Persists the appearance preference (theme + light/dark/auto mode) to
 * localStorage so it survives reloads, and applies it to the <html> element's
 * `[data-theme]` / `[data-mode]` attributes (which drive the design-token
 * palette). The key + shape mirror the pre-paint bootstrap script in
 * index.html so there is never a flash of the wrong theme.
 */
import type { ModePref, ThemeName } from '../slices/appearanceSlice'
import { resolveMode } from '../slices/appearanceSlice'
import { useStore } from '../store'

const KEY = 'hdb_appearance'

/** Write the resolved theme + mode onto <html>. */
function applyAppearance(theme: ThemeName, modePref: ModePref): void {
  const mode = resolveMode(modePref)
  const el = document.documentElement
  el.setAttribute('data-theme', theme)
  el.setAttribute('data-mode', mode)
  el.style.colorScheme = mode
}

export function loadAppearancePrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as { theme?: ThemeName; modePref?: ModePref }
      useStore.setState({
        theme: p.theme ?? 'clay',
        modePref: p.modePref ?? 'light',
      })
    }
  } catch {
    /* ignore corrupt prefs */
  }
  const { theme, modePref } = useStore.getState()
  applyAppearance(theme, modePref)
}

export function watchAppearancePrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({ theme: s.theme, modePref: s.modePref })
    if (snap === last) return
    last = snap
    applyAppearance(s.theme, s.modePref)
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })

  // When the OS theme changes and the user is on Auto, re-resolve live.
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const { theme, modePref } = useStore.getState()
      if (modePref === 'auto') applyAppearance(theme, modePref)
    }
    mq.addEventListener?.('change', onChange)
  }
}
