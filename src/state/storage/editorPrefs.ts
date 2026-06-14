/**
 * Persists editor preferences (snap-to-grid on/off + grid cell size +
 * measurement display units) to localStorage so they survive reloads. Like
 * qualityPrefs, these are per-device editing preferences, not part of a saved
 * design.
 */
import { clampWalkEyeHeight, clampWalkFov } from '../../scene/cameras/walkCameraSettings'
import type { PlanLabelMode } from '../../ui/floorplan/planLabels'
import type { BackdropKind } from '../slices/uiSlice'
import { useStore } from '../store'

const KEY = 'sofa.editor.v1'
const PLAN_LABEL_MODES: PlanLabelMode[] = ['off', 'name', 'price']

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
      walkFov?: number
      walkEyeHeight?: number
      planLabels?: string
    }
    const backdrops: BackdropKind[] = ['city', 'dusk', 'park', 'hills', 'custom', 'none']
    const cur = useStore.getState()
    useStore.setState({
      snapEnabled: !!p.snapEnabled,
      gridSize: typeof p.gridSize === 'number' && p.gridSize > 0 ? p.gridSize : 0.5,
      units: p.units === 'imperial' ? 'imperial' : 'metric',
      backdrop: backdrops.includes((p.backdrop ?? '') as BackdropKind)
        ? (p.backdrop as BackdropKind)
        : 'city',
      uiMode: p.uiMode === 'pro' ? 'pro' : 'simple',
      walkFov: typeof p.walkFov === 'number' ? clampWalkFov(p.walkFov) : cur.walkFov,
      walkEyeHeight:
        typeof p.walkEyeHeight === 'number'
          ? clampWalkEyeHeight(p.walkEyeHeight)
          : cur.walkEyeHeight,
      planLabels: PLAN_LABEL_MODES.includes((p.planLabels ?? '') as PlanLabelMode)
        ? (p.planLabels as PlanLabelMode)
        : 'off',
    })
    // Pro features are gated on uiMode, so re-resolve the flag map now that the
    // saved mode is applied (the boot seed assumed the Simple default).
    useStore.getState().reresolveFeatureFlags()
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
      walkFov: s.walkFov,
      walkEyeHeight: s.walkEyeHeight,
      planLabels: s.planLabels,
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
