/**
 * Persists editor preferences (snap-to-grid on/off + grid cell size +
 * measurement display units) to localStorage so they survive reloads. Like
 * qualityPrefs, these are per-device editing preferences, not part of a saved
 * design.
 */
import { useStore } from '../store'

const KEY = 'sofa.editor.v1'

export function loadEditorPrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const p = JSON.parse(raw) as {
      snapEnabled?: boolean
      gridSize?: number
      units?: 'metric' | 'imperial'
      backdrop?: string
      uiMode?: string
    }
    const backdrops = ['city', 'park', 'hills', 'none']
    useStore.setState({
      snapEnabled: !!p.snapEnabled,
      gridSize: typeof p.gridSize === 'number' && p.gridSize > 0 ? p.gridSize : 0.5,
      units: p.units === 'imperial' ? 'imperial' : 'metric',
      backdrop: backdrops.includes(p.backdrop ?? '')
        ? (p.backdrop as 'city' | 'park' | 'hills' | 'none')
        : 'city',
      uiMode: p.uiMode === 'simple' ? 'simple' : 'pro',
    })
  } catch {
    /* ignore corrupt prefs */
  }
}

export function watchEditorPrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      snapEnabled: s.snapEnabled,
      gridSize: s.gridSize,
      units: s.units,
      backdrop: s.backdrop,
      uiMode: s.uiMode,
    })
    if (snap === last) return
    last = snap
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })
}
