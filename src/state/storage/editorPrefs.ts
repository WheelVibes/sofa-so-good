/**
 * Persists editor preferences (snap-to-grid on/off + grid cell size +
 * measurement display units + backdrop/HDRI + walk camera + plan labels + the
 * left-dock tab, collapsed layer groups and desktop catalog-open state) to
 * localStorage so they survive reloads. Like qualityPrefs, these are per-device
 * editing preferences, not part of a saved design. `catalogOpen` is restored
 * only on desktop (`matchMedia('(min-width:641px)')`) — on mobile the catalog is
 * a bottom-sheet that shouldn't auto-reopen.
 */
import { clampWalkEyeHeight, clampWalkFov } from '../../scene/cameras/walkCameraSettings'
import type { PlanLabelMode } from '../../ui/floorplan/planLabels'
import type { BackdropKind, Density } from '../slices/uiSlice'
import { useStore } from '../store'

const KEY = 'sofa.editor.v1'
const PLAN_LABEL_MODES: PlanLabelMode[] = ['off', 'name', 'price']

/** Write the row density onto <html> as `[data-density]`, driving the
 *  `--row-pad-*` token overrides (P38). jsdom-safe: no-op without `document`. */
export function applyDensity(density: Density): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-density', density)
}

export function loadEditorPrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      applyDensity(useStore.getState().density)
      return
    }
    const p = JSON.parse(raw) as {
      snapEnabled?: boolean
      gridSize?: number
      units?: 'metric' | 'imperial'
      backdrop?: string
      hdriId?: string | null
      uiMode?: string
      walkFov?: number
      walkEyeHeight?: number
      planLabels?: string
      leftMode?: string
      layersCollapsed?: unknown
      catalogOpen?: boolean
      density?: string
    }
    const backdrops: BackdropKind[] = ['city', 'dusk', 'park', 'hills', 'custom', 'none']
    // Restore the collapsed-layer map defensively — only string→boolean entries.
    const layersCollapsed: Record<string, boolean> = {}
    if (p.layersCollapsed && typeof p.layersCollapsed === 'object') {
      for (const [k, v] of Object.entries(p.layersCollapsed as Record<string, unknown>)) {
        if (typeof v === 'boolean') layersCollapsed[k] = v
      }
    }
    // The catalog is a bottom-sheet on mobile — auto-reopening it there is
    // intrusive, so only restore an open catalog on desktop. SSR/jsdom-safe.
    const isDesktop = globalThis.matchMedia?.('(min-width:641px)')?.matches ?? false
    const cur = useStore.getState()
    useStore.setState({
      snapEnabled: !!p.snapEnabled,
      gridSize: typeof p.gridSize === 'number' && p.gridSize > 0 ? p.gridSize : 0.5,
      units: p.units === 'imperial' ? 'imperial' : 'metric',
      backdrop: backdrops.includes((p.backdrop ?? '') as BackdropKind)
        ? (p.backdrop as BackdropKind)
        : 'city',
      hdriId: typeof p.hdriId === 'string' ? p.hdriId : null,
      uiMode: p.uiMode === 'pro' ? 'pro' : 'simple',
      walkFov: typeof p.walkFov === 'number' ? clampWalkFov(p.walkFov) : cur.walkFov,
      walkEyeHeight:
        typeof p.walkEyeHeight === 'number'
          ? clampWalkEyeHeight(p.walkEyeHeight)
          : cur.walkEyeHeight,
      planLabels: PLAN_LABEL_MODES.includes((p.planLabels ?? '') as PlanLabelMode)
        ? (p.planLabels as PlanLabelMode)
        : 'off',
      leftMode: p.leftMode === 'layers' ? 'layers' : 'catalog',
      layersCollapsed,
      catalogOpen: isDesktop ? !!p.catalogOpen : false,
      density: p.density === 'compact' ? 'compact' : 'comfortable',
    })
    // Pro features are gated on uiMode, so re-resolve the flag map now that the
    // saved mode is applied (the boot seed assumed the Simple default).
    useStore.getState().reresolveFeatureFlags()
  } catch {
    /* ignore corrupt prefs */
  }
  applyDensity(useStore.getState().density)
}

export function watchEditorPrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      snapEnabled: s.snapEnabled,
      gridSize: s.gridSize,
      units: s.units,
      backdrop: s.backdrop,
      hdriId: s.hdriId,
      uiMode: s.uiMode,
      walkFov: s.walkFov,
      walkEyeHeight: s.walkEyeHeight,
      planLabels: s.planLabels,
      leftMode: s.leftMode,
      layersCollapsed: s.layersCollapsed,
      catalogOpen: s.catalogOpen,
      density: s.density,
    })
    if (snap === last) return
    last = snap
    applyDensity(s.density)
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })
}
