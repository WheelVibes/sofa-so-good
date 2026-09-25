import type { RootState } from './store'

/**
 * The single rule for whether scene editing is enabled. After the view/edit
 * split, all selection, picking, dragging, rotating, placement and finish
 * editing happen **only inside the per-room editor with the orbit camera**.
 * Orbit-over-the-whole-flat and walk mode are view-only (camera + navigation).
 *
 * Room-editor walk mode (the room-bounded first-person view) is also view-only,
 * so editing requires the orbit camera even there.
 *
 * A session opened from a `#/showroom/<code>` view-only link (`viewOnly`) never
 * edits — this is the single highest-leverage showroom chokepoint, because every
 * selection, drag, gizmo, context menu, placement ghost and editor hotkey
 * already routes through here (`src/state/CLAUDE.md`: "the single gate for all
 * scene editing — don't bypass it"). It is ANDed in rather than checked at each
 * call site for exactly that reason.
 */
export function canEditScene(
  s: Pick<RootState, 'roomEditor' | 'cameraMode'> & { viewOnly?: boolean },
): boolean {
  return !s.viewOnly && s.roomEditor.active && s.cameraMode === 'orbit'
}

/**
 * The single gate for walk-mode "interact" affordances (door swing, curtain
 * draw, blind raise/lower — click, tap, or the E key). Toggling a door/
 * fixture is a walk-mode-only action; orbit mode never toggles anything on
 * click/E, it keeps its existing selection/editing semantics (`canEditScene`
 * above). Every interaction entry point (E-key dispatch in `App.tsx`, the
 * door mesh's `onClick`, the window-fixture toggle in `Furniture.tsx`) must
 * route through this single check rather than re-deriving it.
 */
export function isWalkMode(s: Pick<RootState, 'cameraMode'>): boolean {
  return s.cameraMode === 'firstPerson'
}

/**
 * Single dispatch point for a walk-mode toggle (a door swing, a curtain
 * draw, a blind raise/lower) triggered by click, tap, or the E key — a
 * thin wrapper over {@link isWalkMode} so every call site (`Door.tsx`,
 * `PlanDoorLeaf.tsx`, the window-fixture click branch in `Furniture.tsx`,
 * and the `interact` key handler in `App.tsx`) shares one gate instead of
 * re-deriving `cameraMode === 'firstPerson'` inline. No-ops (and returns
 * `false`) outside walk mode — orbit clicks fall through to their existing
 * selection/editing semantics unchanged. Any def-specific eligibility check
 * (e.g. "is this a curtain") stays the caller's job; this only decides
 * *when* a toggle may fire, never *which* items may be toggled.
 */
export function dispatchWalkInteract(
  s: Pick<RootState, 'cameraMode'>,
  id: string,
  toggle: (id: string) => void,
): boolean {
  if (!isWalkMode(s)) return false
  toggle(id)
  return true
}
