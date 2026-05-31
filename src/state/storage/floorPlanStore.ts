/**
 * Persists the floor-plan library (saved apartments) and the active plan to
 * localStorage so authored apartments survive reloads. Separate from the
 * furniture layout autosave — the shell is a different concern from its
 * contents.
 */

import { isDefaultPlan } from '../../floorplan/planGeometry'
import type { FloorPlan } from '../../floorplan/types'
import { useStore } from '../store'

const KEY = 'sofa.floorplans.v1'

export function loadFloorPlans(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const p = JSON.parse(raw) as { saved?: FloorPlan[]; active?: FloorPlan }
    const patch: { savedPlans?: FloorPlan[]; floorPlan?: FloorPlan } = {}
    if (Array.isArray(p.saved)) patch.savedPlans = p.saved
    // Only restore a non-default active plan (the default is always rebuilt).
    if (p.active && !isDefaultPlan(p.active)) patch.floorPlan = p.active
    if (Object.keys(patch).length) useStore.setState(patch)
  } catch {
    /* ignore corrupt data */
  }
}

export function watchFloorPlans(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      saved: s.savedPlans,
      active: isDefaultPlan(s.floorPlan) ? undefined : s.floorPlan,
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
