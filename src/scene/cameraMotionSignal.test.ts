import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetCameraGesture,
  beginCameraGesture,
  cameraGestureEndedAt,
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
})
