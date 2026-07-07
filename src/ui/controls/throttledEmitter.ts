/**
 * A tiny leading-edge throttle with a trailing flush, used to coalesce the
 * continuous `onChange` stream from the ColorPicker's SV-pad / hue-bar POINTER
 * drags (dozens of events per second) into at most one apply every
 * `intervalMs`. Without this, a single drag over a FINISH-RECOLOR surface bakes
 * a fresh ≤1024² recolored albedo texture per tick and saturates the main
 * thread + GPU before the material-cache LRU can dispose the stale ones.
 *
 * Semantics:
 * - the FIRST `emit` fires `fn` immediately (leading edge) and opens a window;
 * - further `emit`s inside the window only remember the latest value;
 * - when the window closes, the latest pending value fires once (trailing edge)
 *   and a fresh window opens (so a sustained drag emits at a steady cadence);
 * - `flush()` fires the latest pending value now (the guaranteed final apply on
 *   pointerup / drag-end) and closes the window — nothing fires afterwards until
 *   a new `emit`;
 * - `cancel()` drops any pending value without firing.
 *
 * Pure + framework-agnostic so it is unit-testable with fake timers.
 */
export interface ThrottledEmitter<T> {
  emit: (value: T) => void
  flush: () => void
  cancel: () => void
}

export function createThrottledEmitter<T>(
  fn: (value: T) => void,
  intervalMs = 150,
): ThrottledEmitter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let lastValue: T

  const onWindowEnd = () => {
    timer = null
    if (!pending) return
    pending = false
    const value = lastValue
    // Re-open the window so a continuous stream emits at a steady cadence
    // rather than firing every event once the first window elapses.
    timer = setTimeout(onWindowEnd, intervalMs)
    fn(value)
  }

  return {
    emit(value: T) {
      lastValue = value
      if (timer === null) {
        // Leading edge: apply straight away, then start coalescing.
        timer = setTimeout(onWindowEnd, intervalMs)
        fn(value)
      } else {
        pending = true
      }
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (pending) {
        pending = false
        fn(lastValue)
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = false
    },
  }
}
