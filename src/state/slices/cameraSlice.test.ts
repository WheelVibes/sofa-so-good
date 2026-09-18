import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOCAL_DEFAULT_MM,
  FOCAL_MAX_MM,
  FOCAL_MIN_MM,
  FOCUS_DEFAULT_M,
  FOCUS_MAX_M,
  FOCUS_MIN_M,
  FSTOP_DEFAULT,
  FSTOP_MAX,
} from '../../scene/cameras/cameraLensSettings'
import { useStore } from '../store'
import { CAMERA_MODES } from './cameraSlice'

describe('cameraSlice — lens + DoF (PC2-CAM-DOF-LENS)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('initialises to the lens/DoF defaults', () => {
    const s = useStore.getState()
    expect(s.lensFocalMm).toBe(FOCAL_DEFAULT_MM)
    expect(s.dofFStop).toBe(FSTOP_DEFAULT)
    expect(s.dofFocusDistance).toBe(FOCUS_DEFAULT_M)
    expect(s.dofAuto).toBe(true)
  })

  it('setLensFocalMm clamps to the sane range', () => {
    useStore.getState().setLensFocalMm(35)
    expect(useStore.getState().lensFocalMm).toBe(35)
    useStore.getState().setLensFocalMm(5)
    expect(useStore.getState().lensFocalMm).toBe(FOCAL_MIN_MM)
    useStore.getState().setLensFocalMm(9999)
    expect(useStore.getState().lensFocalMm).toBe(FOCAL_MAX_MM)
    useStore.getState().setLensFocalMm(Number.NaN)
    expect(useStore.getState().lensFocalMm).toBe(FOCAL_DEFAULT_MM)
  })

  it('setDofFStop clamps (0/negative → off, else range)', () => {
    useStore.getState().setDofFStop(2.8)
    expect(useStore.getState().dofFStop).toBe(2.8)
    useStore.getState().setDofFStop(0)
    expect(useStore.getState().dofFStop).toBe(0)
    useStore.getState().setDofFStop(-1)
    expect(useStore.getState().dofFStop).toBe(0)
    useStore.getState().setDofFStop(100)
    expect(useStore.getState().dofFStop).toBe(FSTOP_MAX)
  })

  it('setDofFocusDistance clamps to metres range', () => {
    useStore.getState().setDofFocusDistance(2)
    expect(useStore.getState().dofFocusDistance).toBe(2)
    useStore.getState().setDofFocusDistance(0.01)
    expect(useStore.getState().dofFocusDistance).toBe(FOCUS_MIN_M)
    useStore.getState().setDofFocusDistance(9999)
    expect(useStore.getState().dofFocusDistance).toBe(FOCUS_MAX_M)
  })

  it('setDofAuto coerces to a boolean', () => {
    useStore.getState().setDofAuto(false)
    expect(useStore.getState().dofAuto).toBe(false)
    // biome-ignore lint/suspicious/noExplicitAny: testing truthy coercion
    useStore.getState().setDofAuto(1 as any)
    expect(useStore.getState().dofAuto).toBe(true)
  })
})

describe('cameraSlice — requestFrameSelection (FEAT-A)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('initialises with no pending frame request', () => {
    const s = useStore.getState()
    expect(s.frameNonce).toBe(0)
    expect(s.frameBounds).toBeNull()
  })

  it('bumps the nonce + stores the bounds when given a real bounds', () => {
    useStore.getState().requestFrameSelection({ center: [1, 0.5, 2], radius: 1.2 })
    const s = useStore.getState()
    expect(s.frameNonce).toBe(1)
    expect(s.frameBounds).toEqual({ center: [1, 0.5, 2], radius: 1.2 })
    // A second request bumps again so OrbitCamera's effect re-fires even if
    // the target/radius happen to repeat (nonce is the trigger, not a value
    // diff — mirrors focusOn/requestHomeView/requestTopView).
    useStore.getState().requestFrameSelection({ center: [1, 0.5, 2], radius: 1.2 })
    expect(useStore.getState().frameNonce).toBe(2)
  })

  it('is a no-op with a null bounds (nothing selected)', () => {
    useStore.getState().requestFrameSelection({ center: [1, 0.5, 2], radius: 1.2 })
    expect(useStore.getState().frameNonce).toBe(1)
    useStore.getState().requestFrameSelection(null)
    const s = useStore.getState()
    expect(s.frameNonce).toBe(1) // unchanged
    expect(s.frameBounds).toEqual({ center: [1, 0.5, 2], radius: 1.2 }) // unchanged
  })
})

describe('cameraSlice — two-point perspective / vertical lock (FEAT-D)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('initialises off (normal perspective)', () => {
    expect(useStore.getState().verticalLock).toBe(false)
  })

  it('setVerticalLock coerces to a boolean', () => {
    useStore.getState().setVerticalLock(true)
    expect(useStore.getState().verticalLock).toBe(true)
    // biome-ignore lint/suspicious/noExplicitAny: testing truthy coercion
    useStore.getState().setVerticalLock(0 as any)
    expect(useStore.getState().verticalLock).toBe(false)
  })

  it('toggleVerticalLock flips the current value', () => {
    expect(useStore.getState().verticalLock).toBe(false)
    useStore.getState().toggleVerticalLock()
    expect(useStore.getState().verticalLock).toBe(true)
    useStore.getState().toggleVerticalLock()
    expect(useStore.getState().verticalLock).toBe(false)
  })
})

/**
 * WALK-MODE-STRING. `'walk'` is what every surface OUTSIDE the store calls this mode, and
 * `CameraRig` is `mode === 'orbit' ? Orbit : FirstPerson` — so the invalid string still walks
 * while every positive `=== 'firstPerson'` gate (the estate's mount condition,
 * `exteriorDayBoost`'s `inside`, `isWalkMode`) silently turns off. That is how the recorded
 * interaction sweep produced ~5 000 walk frames with the estate not mounted.
 */
describe('cameraSlice — setCameraMode rejects an unknown mode', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes exactly the two modes the type allows', () => {
    expect(CAMERA_MODES).toEqual(['orbit', 'firstPerson'])
  })

  it("leaves the state UNCHANGED and logs on 'walk' — the real regression", () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    // @ts-expect-error — the whole point is a caller with no types (a `page.evaluate` probe).
    useStore.getState().setCameraMode('walk')
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0][0])).toContain('walk')
  })

  it('rejects every other shape a caller might pass', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const bad of [undefined, null, '', 'Orbit', 'FIRSTPERSON', 0, {}]) {
      // @ts-expect-error — deliberately invalid.
      useStore.getState().setCameraMode(bad)
      expect(useStore.getState().cameraMode).toBe('orbit')
    }
  })

  it('still accepts both valid modes, and only fires the overlay on a real change', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const m of CAMERA_MODES) useStore.getState().setCameraMode(m)
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    expect(err).not.toHaveBeenCalled()
  })
})

/**
 * MODE-SWITCH-CROSSFADE (N3, `docs/audit/interaction-sweep-2026-09-18.md`): a real orbit<->walk
 * switch used to always raise the branded boot-splash via `showLoading`. Default now raises the
 * lightweight `modeTransition` cross-fade veil instead; the flag OFF restores the old splash for
 * A/B, and the room-editor exemption + no-op-mode-change exemption are unchanged either way.
 */
describe('cameraSlice — setCameraMode / modeSwitchCrossfade gating', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.getState().resetFeatureFlags()
  })

  it('flag ON (default): bumps modeTransition instead of raising the splash overlay', () => {
    expect(useStore.getState().featureFlags.modeSwitchCrossfade).toBe(true)
    const before = useStore.getState().modeTransition.nonce
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    expect(useStore.getState().modeTransition.active).toBe(true)
    expect(useStore.getState().modeTransition.nonce).toBe(before + 1)
    expect(useStore.getState().loading.active).toBe(false)
  })

  it('endModeTransition clears active without touching the nonce', () => {
    useStore.getState().setCameraMode('firstPerson')
    const nonce = useStore.getState().modeTransition.nonce
    useStore.getState().endModeTransition()
    expect(useStore.getState().modeTransition.active).toBe(false)
    expect(useStore.getState().modeTransition.nonce).toBe(nonce)
  })

  it('flag OFF: falls back to the old branded splash and never touches modeTransition', () => {
    useStore.getState().setFeatureFlag('modeSwitchCrossfade', false)
    const before = useStore.getState().modeTransition.nonce
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    expect(useStore.getState().loading.active).toBe(true)
    expect(useStore.getState().loading.label).toBe('Entering walkthrough…')
    expect(useStore.getState().modeTransition.nonce).toBe(before)
  })

  it('a no-op mode change (already in that mode) raises neither transition', () => {
    useStore.getState().setCameraMode('orbit') // already orbit — no-op
    expect(useStore.getState().modeTransition.active).toBe(false)
    expect(useStore.getState().modeTransition.nonce).toBe(0)
    expect(useStore.getState().loading.active).toBe(false)
  })

  it('the room editor owns the overlay — a mode change while it is active raises neither', () => {
    useStore.getState().enterRoomEditor('living')
    const before = useStore.getState().modeTransition.nonce
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().cameraMode).toBe('firstPerson')
    expect(useStore.getState().modeTransition.nonce).toBe(before)
  })
})
