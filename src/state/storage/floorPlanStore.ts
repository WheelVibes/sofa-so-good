/**
 * Persists the floor-plan library (saved apartments) and the active plan to
 * localStorage so authored apartments survive reloads. Separate from the
 * furniture layout autosave — the shell is a different concern from its
 * contents.
 */

import { isDefaultPlan } from '../../floorplan/planGeometry'
import type { FloorPlan } from '../../floorplan/types'
import { FloorPlanZ } from '../schema'
import { useStore } from '../store'

const KEY = 'sofa.floorplans.v1'

/** Validate one stored plan against the FloorPlan schema; `null` if malformed.
 * Mirrors the autosave/designFile import paths so a parseable-but-malformed plan
 * (e.g. missing `walls`) can't reach the renderer with bad geometry (BUG-014). */
function validPlan(value: unknown): FloorPlan | null {
  const res = FloorPlanZ.safeParse(value)
  return res.success ? (res.data as FloorPlan) : null
}

export function loadFloorPlans(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const p = JSON.parse(raw) as { saved?: unknown; active?: unknown }
    const patch: { savedPlans?: FloorPlan[]; floorPlan?: FloorPlan } = {}
    // Drop entries that fail schema validation rather than casting bad geometry in.
    if (Array.isArray(p.saved)) {
      const saved = p.saved.map(validPlan).filter((x): x is FloorPlan => x !== null)
      patch.savedPlans = saved
    }
    // Only restore a non-default active plan (the default is always rebuilt).
    const active = validPlan(p.active)
    if (active && !isDefaultPlan(active)) patch.floorPlan = active
    if (Object.keys(patch).length) useStore.setState(patch)
  } catch {
    /* ignore corrupt data */
  }
}

export function watchFloorPlans(): void {
  let last = ''
  useStore.subscribe((s) => {
    // Security review R7 S1: a showroom session holds the SENDER's plan. The
    // active plan persisted here is restored over the autosave's own plan at the
    // next boot (`loadFloorPlans` runs after `hydrate`), so writing it would leak
    // the sender's shell into the visitor's design even with the autosave gated.
    // `last` is left untouched, so the first change after the session ends
    // ("Make it mine") persists whatever the store then holds.
    if (s.viewOnly) return
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
