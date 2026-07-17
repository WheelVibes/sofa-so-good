/**
 * GLB Asset Designer — Stage 4 grid-snap preference (per-device UI pref, like the
 * catalog width — NOT part of the design save schema). Persists whether snapping
 * is on and the length step to localStorage so it survives reloads.
 *
 * The step drives BOTH the gizmo write-back snapping (`gizmoWriteBack.ts`) and the
 * numeric-input stepping in the part inspector. When snapping is OFF a very fine
 * step (`FREE_STEP`) is used so a drag moves freely.
 */

const ENABLED_KEY = 'hdb_designer_grid_snap'
const STEP_KEY = 'hdb_designer_snap_step'

/** The offered snap steps (metres), in ascending order. 5 mm is the default
 *  (matches the pre-Stage-4 hardcoded gizmo snap). */
export const SNAP_STEPS = [0.001, 0.005, 0.01, 0.05] as const
export type SnapStepM = (typeof SNAP_STEPS)[number]
const DEFAULT_SNAP_STEP: SnapStepM = 0.005

/** Fine step used when snapping is OFF (imperceptible → effectively free drag +
 *  a 1 mm numeric nudge). */
export const FREE_STEP = 0.001

export const SNAP_STEP_LABEL: Record<SnapStepM, string> = {
  0.001: '1 mm',
  0.005: '5 mm',
  0.01: '1 cm',
  0.05: '5 cm',
}

export interface GridSnapPref {
  enabled: boolean
  step: SnapStepM
}

export const DEFAULT_GRID_SNAP: GridSnapPref = { enabled: true, step: DEFAULT_SNAP_STEP }

function isSnapStep(n: number): n is SnapStepM {
  return (SNAP_STEPS as readonly number[]).includes(n)
}

/** Load the persisted preference (defaults on load failure / absent). */
export function loadGridSnap(): GridSnapPref {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_GRID_SNAP }
  try {
    const rawEnabled = localStorage.getItem(ENABLED_KEY)
    const rawStep = localStorage.getItem(STEP_KEY)
    const step = rawStep ? Number.parseFloat(rawStep) : DEFAULT_SNAP_STEP
    return {
      enabled: rawEnabled === null ? DEFAULT_GRID_SNAP.enabled : rawEnabled === '1',
      step: isSnapStep(step) ? step : DEFAULT_SNAP_STEP,
    }
  } catch {
    return { ...DEFAULT_GRID_SNAP }
  }
}

/** Persist the preference (best-effort — private mode / quota is non-fatal). */
export function saveGridSnap(pref: GridSnapPref): void {
  try {
    localStorage.setItem(ENABLED_KEY, pref.enabled ? '1' : '0')
    localStorage.setItem(STEP_KEY, String(pref.step))
  } catch {
    /* private mode / quota — the pref still applies for this session */
  }
}

/** The effective length step for the gizmo + numeric inputs given the pref: the
 *  chosen step when snapping is on, else the fine free step. */
export function effectiveSnapStep(pref: GridSnapPref): number {
  return pref.enabled ? pref.step : FREE_STEP
}
