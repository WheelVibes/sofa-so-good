import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetCameraGesture,
  beginCameraGesture,
  cameraGestureEndedAt,
  endAllCameraGestures,
  endCameraGesture,
  GESTURE_WATCHDOG_MS,
  isCameraGestureActive,
  pollCameraGestureWatchdog,
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
  /** WALK-GESTURE-LEASE (N1) — the last-resort watchdog for a leaked ref-count. */
  describe('pollCameraGestureWatchdog', () => {
    const POSE = '1.0000,1.6000,2.0000,0,0,0'

    it('never fires when no gesture is held', () => {
      for (let t = 0; t <= 4 * GESTURE_WATCHDOG_MS; t += 1000) {
        expect(pollCameraGestureWatchdog(t, POSE)).toBe(false)
      }
    })

    it('force-releases a gesture held past the window with the camera stock-still', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      beginCameraGesture()
      expect(pollCameraGestureWatchdog(0, POSE)).toBe(false)
      expect(pollCameraGestureWatchdog(GESTURE_WATCHDOG_MS - 1, POSE)).toBe(false)
      expect(isCameraGestureActive()).toBe(true)
      expect(pollCameraGestureWatchdog(GESTURE_WATCHDOG_MS, POSE)).toBe(true)
      expect(isCameraGestureActive()).toBe(false)
      expect(cameraGestureEndedAt()).toBeGreaterThan(0)
      warn.mockRestore()
    })

    it('clears the whole count, however many holders leaked', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      beginCameraGesture()
      beginCameraGesture()
      beginCameraGesture()
      pollCameraGestureWatchdog(0, POSE)
      expect(pollCameraGestureWatchdog(GESTURE_WATCHDOG_MS + 1, POSE)).toBe(true)
      expect(isCameraGestureActive()).toBe(false)
      warn.mockRestore()
    })

    it('a real drag is never interrupted — any pose change rearms the window', () => {
      beginCameraGesture()
      for (let t = 0; t <= 5 * GESTURE_WATCHDOG_MS; t += 16) {
        expect(pollCameraGestureWatchdog(t, `${t},0,0,0,0,0`)).toBe(false)
      }
      expect(isCameraGestureActive()).toBe(true)
    })

    it('a pose change mid-hold restarts the countdown rather than shortening it', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      beginCameraGesture()
      pollCameraGestureWatchdog(0, POSE)
      expect(pollCameraGestureWatchdog(GESTURE_WATCHDOG_MS - 1, 'moved')).toBe(false)
      expect(pollCameraGestureWatchdog(GESTURE_WATCHDOG_MS + 1, 'moved')).toBe(false)
      expect(pollCameraGestureWatchdog(2 * GESTURE_WATCHDOG_MS - 1, 'moved')).toBe(true)
      warn.mockRestore()
    })
  })
})
