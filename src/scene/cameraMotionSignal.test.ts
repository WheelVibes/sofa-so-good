import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetCameraGesture,
  beginCameraGesture,
  cameraGestureEndedAt,
  endAllCameraGestures,
  endCameraGesture,
  isCameraGestureActive,
} from './cameraMotionSignal'

/** GPU-STARVE-1 — the camera-gesture module signal (OrbitControls start/end). */
describe('cameraMotionSignal', () => {
  beforeEach(() => __resetCameraGesture())

  it('tracks a begin/end pair', () => {
    expect(isCameraGestureActive()).toBe(false)
    beginCameraGesture()
    expect(isCameraGestureActive()).toBe(true)
    endCameraGesture()
    expect(isCameraGestureActive()).toBe(false)
    expect(cameraGestureEndedAt()).toBeGreaterThan(0)
  })

  it('overlapping gestures stay active until the last releases', () => {
    beginCameraGesture()
    beginCameraGesture()
    endCameraGesture()
    expect(isCameraGestureActive()).toBe(true)
    endCameraGesture()
    expect(isCameraGestureActive()).toBe(false)
  })

  it('a stray end without a begin is a no-op', () => {
    endCameraGesture()
    expect(isCameraGestureActive()).toBe(false)
    expect(cameraGestureEndedAt()).toBe(0)
  })

  /** TIER-GESTURE-END (S2) — a mid-drag `setQualityTier` call. */
  describe('endAllCameraGestures', () => {
    it('clears an overlapping gesture in one call, unlike endCameraGesture', () => {
      beginCameraGesture()
      beginCameraGesture()
      expect(isCameraGestureActive()).toBe(true)
      endAllCameraGestures()
      expect(isCameraGestureActive()).toBe(false)
    })

    it('stamps endedAt as a real release (not 0), so the release debounce still holds', () => {
      beginCameraGesture()
      endAllCameraGestures()
      expect(cameraGestureEndedAt()).toBeGreaterThan(0)
    })

    it('is a no-op when nothing is held', () => {
      expect(isCameraGestureActive()).toBe(false)
      endAllCameraGestures()
      expect(isCameraGestureActive()).toBe(false)
      expect(cameraGestureEndedAt()).toBe(0)
    })

    it('a later paired endCameraGesture is a safe no-op after a force-end', () => {
      beginCameraGesture()
      endAllCameraGestures()
      expect(() => endCameraGesture()).not.toThrow()
      expect(isCameraGestureActive()).toBe(false)
    })
  })
})
