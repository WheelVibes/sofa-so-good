import { describe, expect, it, vi } from 'vitest'
import { canEditScene, dispatchWalkInteract, isWalkMode } from './editing'
import type { RootState } from './store'

const scene = (active: boolean, cameraMode: 'orbit' | 'firstPerson') =>
  ({
    roomEditor: { active, roomId: active ? 'mainBedroom' : null },
    cameraMode,
  }) as Pick<RootState, 'roomEditor' | 'cameraMode'>

describe('canEditScene', () => {
  it('is true only inside the room editor with the orbit camera', () => {
    expect(canEditScene(scene(true, 'orbit'))).toBe(true)
  })

  it('is false in the view-only overview (no room editor)', () => {
    expect(canEditScene(scene(false, 'orbit'))).toBe(false)
  })

  it('is false in walk mode, even inside the room editor', () => {
    expect(canEditScene(scene(true, 'firstPerson'))).toBe(false)
  })

  it('PLAN-FURNISH regression: stays false while the 2D plan editor is open', () => {
    // The 2D plan editor (`floorPlanEditing`) is a separate editing surface
    // that does NOT run through `canEditScene` — PLAN-FURNISH (click-to-place
    // furniture in the plan) must not relax this gate or reactivate the
    // canvas-bound 3D placement stack (`scene/PlacementGhost.tsx` / `ui/
    // catalog/usePlacementController.ts`) behind the plan overlay. Since
    // `canEditScene`'s signature doesn't even accept `floorPlanEditing`, this
    // pins the invariant so a future refactor can't quietly widen it.
    expect(canEditScene(scene(false, 'orbit'))).toBe(false)
  })
})

describe('isWalkMode', () => {
  it('is true in first-person (walk) mode', () => {
    expect(isWalkMode({ cameraMode: 'firstPerson' })).toBe(true)
  })

  it('is false in orbit mode — orbit never dispatches a door/fixture interact', () => {
    expect(isWalkMode({ cameraMode: 'orbit' })).toBe(false)
  })
})

describe('dispatchWalkInteract — the single door/fixture interact gate', () => {
  it('runs the toggle and returns true in walk mode', () => {
    const toggle = vi.fn()
    const fired = dispatchWalkInteract({ cameraMode: 'firstPerson' }, 'door-main', toggle)
    expect(fired).toBe(true)
    expect(toggle).toHaveBeenCalledWith('door-main')
  })

  it('is a no-op and returns false in orbit mode — a door click in orbit never toggles it', () => {
    // Store-level assertion for the reported bug: before this gate, Door.tsx's
    // onClick called `toggle(spec.id)` unconditionally, so clicking a door
    // mesh while orbiting the whole flat swung it open — orbit is meant to be
    // view-only (VIEW-EDIT-SPLIT). `toggle` here stands in for the real
    // `toggleDoor`/`toggleWindowFixture` store actions; asserting it's never
    // called is equivalent to asserting `doors[id].open` (or the item's
    // `props.drawAmount`/`lower`) is left untouched by an orbit click.
    const toggle = vi.fn()
    const fired = dispatchWalkInteract({ cameraMode: 'orbit' }, 'door-main', toggle)
    expect(fired).toBe(false)
    expect(toggle).not.toHaveBeenCalled()
  })

  it('is the same gate the screen interact shares (WALK-SCREEN-INTERACT) — orbit-inert', () => {
    // `cycleScreenContent` routes through this exact same function
    // (Furniture.tsx's onClick, App.tsx's E-key handler) rather than
    // re-deriving `cameraMode === 'firstPerson'` — this asserts the shared
    // gate itself stays orbit-inert regardless of which toggle it wraps.
    const cycleScreenContent = vi.fn()
    expect(dispatchWalkInteract({ cameraMode: 'orbit' }, 'monitor-1', cycleScreenContent)).toBe(
      false,
    )
    expect(cycleScreenContent).not.toHaveBeenCalled()
    expect(
      dispatchWalkInteract({ cameraMode: 'firstPerson' }, 'monitor-1', cycleScreenContent),
    ).toBe(true)
    expect(cycleScreenContent).toHaveBeenCalledWith('monitor-1')
  })

  it('is the same gate the light interact shares (WALK-LIGHT-INTERACT) — orbit-inert', () => {
    // `toggleLightPower` routes through this exact same function too.
    const toggleLightPower = vi.fn()
    expect(dispatchWalkInteract({ cameraMode: 'orbit' }, 'lamp-1', toggleLightPower)).toBe(false)
    expect(toggleLightPower).not.toHaveBeenCalled()
    expect(dispatchWalkInteract({ cameraMode: 'firstPerson' }, 'lamp-1', toggleLightPower)).toBe(
      true,
    )
    expect(toggleLightPower).toHaveBeenCalledWith('lamp-1')
  })
})
