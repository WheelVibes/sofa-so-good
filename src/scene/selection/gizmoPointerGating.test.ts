import { describe, expect, it } from 'vitest'
import { isActiveDragPointer } from '../dragHelpers'

/**
 * TEST-6: pointerId-gating coverage for the Rotate/Resize/Tilt gizmos (MOBILE-1).
 *
 * `RotateGizmo.tsx`, `ResizeGizmo.tsx` and `TiltGizmo.tsx` each record the
 * initiating pointer's id into a per-gesture ref at grab —
 *   `gesture.current = { ..., pointerId: e.nativeEvent.pointerId }`
 * — and gate every window `pointermove`/`pointerup`/`pointercancel` through
 *   `if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return`
 * before touching the gesture (see each file's `onMove`/`onUp`). This is the
 * same BUG-1 class fix `DragController`/`dragHelpers.test.ts` already cover
 * for a plain furniture drag, extended to the three in-viewport gizmos.
 *
 * The grab itself is an in-Canvas mesh `onPointerDown` (a `ThreeEvent`, needs
 * `e.point`/a real camera+raycast for Rotate/Resize) — this repo has no
 * `@react-three/test-renderer`, and the existing R3F-component test in this
 * codebase (`src/ui/glbEditor/GlbDesignerDialog.test.tsx`) mocks `Canvas` out
 * entirely rather than rendering into it, confirming that's the established
 * pattern here: in-Canvas gesture start isn't driven headlessly (see
 * `docs/visual-verification-playbook.md`). The full grab→drag→release path is
 * covered end-to-end by `scripts/scenarios/gizmo-rotate-multitouch.json`.
 *
 * So — per the task's option (b) — these tests exercise the exact seam each
 * gizmo is wired to: `isActiveDragPointer(recordedPointerId, eventPointerId)`.
 * "no-op" / "doesn't end the gesture" means the gate returns `false` (the
 * `onMove`/`onUp` body's early `return` fires, so the event is ignored);
 * "drives it" / "ends it" means the gate returns `true` (the body proceeds to
 * apply the transform / commit-or-revert and clear the gesture). Pointer ids
 * mirror `gizmo-rotate-multitouch.json`: 9 = the finger that grabbed the
 * handle, 202 = a second, independent finger's own pointer stream.
 */

const INITIATOR = 9
const SECOND_FINGER = 202

describe.each([
  [
    'RotateGizmo',
    'grabs the ring/knob; onGrab records `pointerId: e.nativeEvent.pointerId` into `gesture.current`; onMove/onUp gate on `isActiveDragPointer(g.pointerId, ev.pointerId)`',
  ],
  [
    'ResizeGizmo',
    'grabs a corner handle; onGrab records `pointerId: e.nativeEvent.pointerId` into `gesture.current`; onMove/onUp gate on `isActiveDragPointer(g.pointerId, ev.pointerId)`',
  ],
  [
    'TiltGizmo',
    'grabs the tilt ball; onGrab records `pointerId: e.nativeEvent.pointerId` into `gesture.current`; onMove/onUp gate on `isActiveDragPointer(g.pointerId, ev.pointerId)`',
  ],
])('%s pointerId gating (MOBILE-1) — %s', (_name) => {
  it('grab -> a second finger moving is a no-op (gate rejects the foreign pointerId)', () => {
    const g = { pointerId: INITIATOR }
    // onMove: `if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return`
    expect(isActiveDragPointer(g.pointerId, SECOND_FINGER)).toBe(false)
  })

  it('grab -> a second finger releasing does not end the gesture (gate rejects the foreign pointerId)', () => {
    const g = { pointerId: INITIATOR }
    // onUp: `if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return`
    expect(isActiveDragPointer(g.pointerId, SECOND_FINGER)).toBe(false)
  })

  it('grab -> the initiating pointer moving drives the gesture (gate accepts the recorded pointerId)', () => {
    const g = { pointerId: INITIATOR }
    expect(isActiveDragPointer(g.pointerId, INITIATOR)).toBe(true)
  })

  it('grab -> the initiating pointer releasing ends the gesture (gate accepts the recorded pointerId)', () => {
    const g = { pointerId: INITIATOR }
    expect(isActiveDragPointer(g.pointerId, INITIATOR)).toBe(true)
  })
})
