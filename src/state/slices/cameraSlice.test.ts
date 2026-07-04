import { beforeEach, describe, expect, it } from 'vitest'
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
