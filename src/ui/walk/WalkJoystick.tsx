import { useEffect, useRef, useState } from 'react'
import { beginCameraGesture, endCameraGesture } from '../../scene/cameraMotionSignal'
import { normalizeJoystick, resetWalkMove, setWalkMove } from '../../scene/walkInput'
import { useStore } from '../../state/store'

const RADIUS = 36 // px, max thumb travel from centre
const DEAD_ZONE = 0.18 // fraction of RADIUS

const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Translucent analog movement joystick for walk mode on touch devices. Writes a
 * normalized move vector to the walkInput singleton (read by FirstPersonCamera).
 * Stops pointer/touch propagation so its gestures never reach the canvas
 * drag-to-look. Bottom-left, with safe-area insets.
 *
 * WALK-GESTURE-DEGRADE (S7): engaging the thumb is its own camera gesture
 * (the walker moves every frame it's held, same as a drag) — pointerdown/up
 * are already the discrete pair `beginCameraGesture`/`endCameraGesture` want,
 * shared with the look-drag and held-key sources via that module's ref-count.
 */
export function WalkJoystick() {
  const cameraMode = useStore((s) => s.cameraMode)
  const baseRef = useRef<HTMLDivElement>(null)
  const activeId = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ x: 0, y: 0 })

  // Release a still-engaged thumb on unmount, or when walk mode is left mid-
  // drag (this component renders `null` rather than unmounting in that case,
  // see the guard below) — otherwise the gesture signal is stuck active and
  // GPU-STARVE-1's degrade never releases.
  useEffect(() => {
    if (cameraMode !== 'firstPerson' && activeId.current !== null) {
      activeId.current = null
      resetWalkMove()
      setThumb({ x: 0, y: 0 })
      endCameraGesture()
    }
  }, [cameraMode])
  useEffect(() => {
    return () => {
      if (activeId.current !== null) {
        activeId.current = null
        endCameraGesture()
      }
    }
  }, [])

  if (cameraMode !== 'firstPerson' || !IS_COARSE_POINTER) return null

  const center = () => {
    const r = baseRef.current?.getBoundingClientRect()
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 }
  }

  const update = (clientX: number, clientY: number) => {
    const { cx, cy } = center()
    const dx = clientX - cx
    const dy = clientY - cy
    const v = normalizeJoystick(dx, dy, RADIUS, DEAD_ZONE)
    setWalkMove(v.x, v.y)
    // Visual thumb: clamp to radius (screen y-down, matches the raw offset).
    const dist = Math.hypot(dx, dy)
    const k = dist > RADIUS ? RADIUS / dist : 1
    setThumb({ x: dx * k, y: dy * k })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    activeId.current = e.pointerId
    baseRef.current?.setPointerCapture(e.pointerId)
    update(e.clientX, e.clientY)
    beginCameraGesture()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return
    e.stopPropagation()
    update(e.clientX, e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return
    e.stopPropagation()
    activeId.current = null
    resetWalkMove()
    setThumb({ x: 0, y: 0 })
    endCameraGesture()
  }

  return (
    <div
      ref={baseRef}
      className="walk-joystick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="walk-joystick-thumb"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      />
    </div>
  )
}
